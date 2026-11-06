import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  browserEnvironment,
  createWallet,
  creditedShare,
  FAILURE_MESSAGES,
  fromCents,
  roundView,
  toCents,
  type ServerRound,
  type Wallet,
  type WalletEnvironment,
} from '../src';
import { createMemoryStore, createSpinKeyStore } from '../src/spinKey';

const GAME = 'stellar-sevens';
const TOKEN = 'tk-a';
const SEARCH = `?token=${TOKEN}&lang=en&lobby=`;
const STORAGE_KEY = `apex:spin:${GAME}:${TOKEN}`;
const RETRY_DELAY_MS = 700;
const ATTEMPTS = 3;
const BET_CENTS = 100;
const OTHER_BET_CENTS = 500;

type Reply = { readonly status?: number; readonly body: unknown } | 'network' | 'unreadable';
type TestRound = { readonly totalWin: number };

interface Sent {
  readonly url: string;
  readonly init: RequestInit;
}

interface Harness {
  readonly wallet: Wallet<TestRound>;
  readonly sent: Sent[];
  readonly sleeps: number[];
  readonly store: ReturnType<typeof createMemoryStore>;
}

const playedBody = {
  ok: true,
  roundId: 'round-1',
  round: { totalWin: 2 },
  winCents: 200,
  costCents: BET_CENTS,
  balanceCents: 9_900,
};

function response(reply: Reply): Response {
  if (reply === 'network') {
    throw new TypeError('Failed to fetch');
  }
  if (reply === 'unreadable') {
    return new Response('<html>bad gateway</html>', { status: 502 });
  }
  return Response.json(reply.body, { status: reply.status ?? 200 });
}

function harness(replies: readonly Reply[], search = SEARCH): Harness {
  const sent: Sent[] = [];
  const sleeps: number[] = [];
  const store = createMemoryStore();
  const queue = [...replies];
  let issuedKeys = 0;
  const environment: WalletEnvironment = {
    search,
    store,
    send: (url, init) => {
      sent.push({ url, init });
      const reply = queue.shift();
      if (reply === undefined) {
        throw new Error('the test scripted fewer replies than the wallet sent');
      }
      return Promise.resolve(response(reply));
    },
    sleep: (ms) => {
      sleeps.push(ms);
      return Promise.resolve();
    },
    newKey: () => `key-${++issuedKeys}`,
  };
  return { wallet: createWallet<TestRound>(GAME, environment), sent, sleeps, store };
}

function failureOf(outcome: { readonly kind: string; readonly failure?: { readonly code: string } }): string {
  return outcome.failure?.code ?? outcome.kind;
}

function sentBody(call: Sent | undefined): Record<string, unknown> {
  return JSON.parse(String(call?.init.body)) as Record<string, unknown>;
}

function authorization(call: Sent | undefined): string | null {
  return new Headers(call?.init.headers).get('Authorization');
}

beforeEach(() => {
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  window.history.replaceState(null, '', '/');
  document.cookie = 'token=; expires=Thu, 01 Jan 1970 00:00:00 GMT';
  window.sessionStorage.clear();
});

describe('token', () => {
  it('is sent as a Bearer header on the session and on the spin', async () => {
    const { wallet, sent } = harness([
      { body: { ok: true, balanceCents: 10_000 } },
      { body: playedBody },
    ]);

    await wallet.session();
    await wallet.spin(BET_CENTS);

    expect(sent.map(authorization)).toEqual([`Bearer ${TOKEN}`, `Bearer ${TOKEN}`]);
  });

  it('is not read from a cookie and no cookie is sent', async () => {
    document.cookie = 'token=cookie-tk';
    const { wallet, sent } = harness([{ body: { ok: true, balanceCents: 1 } }]);

    await wallet.session();

    expect(authorization(sent[0])).toBe(`Bearer ${TOKEN}`);
    expect(sent[0]?.init.credentials).toBe('omit');
  });

  it('with no token in the address sends nothing and reads session expired', async () => {
    document.cookie = 'token=cookie-tk';
    const { wallet, sent } = harness([], '?lang=en');

    const session = await wallet.session();
    const spin = await wallet.spin(BET_CENTS);
    const clearance = await wallet.clearToSpin(0, BET_CENTS);

    expect(sent).toEqual([]);
    expect(session).toMatchObject({ kind: 'failed', failure: { code: 'session_expired' } });
    expect(spin).toMatchObject({ kind: 'failed', failure: { code: 'session_expired' } });
    expect(clearance).toMatchObject({ kind: 'refused', failure: { code: 'session_expired' } });
  });

  it('treats an empty token as no token', async () => {
    const { wallet, sent } = harness([], '?token=');
    expect(await wallet.spin(BET_CENTS)).toMatchObject({ kind: 'failed' });
    expect(sent).toEqual([]);
  });
});

describe('session', () => {
  it('asks for the game of the window and returns the balance in cents', async () => {
    const { wallet, sent } = harness([{ body: { ok: true, balanceCents: 10_000 } }]);

    const session = await wallet.session();

    expect(session).toEqual({ kind: 'ready', balanceCents: 10_000 });
    expect(sent[0]?.url).toBe(`/api/game/session?game=${GAME}`);
    expect(sent[0]?.init.method ?? 'GET').toBe('GET');
  });

  it('shows the session expired text and stops the spins after session_expired', async () => {
    const { wallet, sent } = harness([{ status: 401, body: { ok: false, error: 'session_expired' } }]);

    const session = await wallet.session();
    const spin = await wallet.spin(BET_CENTS);

    expect(session).toMatchObject({
      kind: 'failed',
      failure: { code: 'session_expired', message: 'SESSION EXPIRED. REOPEN THE GAME.', offersDeposit: false },
    });
    expect(spin).toMatchObject({ kind: 'failed', failure: { code: 'session_expired' } });
    expect(sent).toHaveLength(1);
  });

  it('shows the unavailable text after unavailable', async () => {
    const { wallet } = harness([{ status: 503, body: { ok: false, error: 'unavailable' } }]);

    const session = await wallet.session();

    expect(session).toMatchObject({
      kind: 'failed',
      failure: { code: 'unavailable', message: 'THE GAME IS NOT AVAILABLE NOW. TRY LATER.' },
    });
  });

  it('shows the connection lost text after three failed attempts 700 ms apart', async () => {
    const { wallet, sent, sleeps } = harness(['network', 'unreadable', 'network']);

    const session = await wallet.session();

    expect(session).toMatchObject({
      kind: 'failed',
      failure: {
        code: 'connection_lost',
        message: 'Connection lost. Your balance is safe and correct, reconnect to continue.',
      },
    });
    expect(sent).toHaveLength(ATTEMPTS);
    expect(sleeps).toEqual([RETRY_DELAY_MS, RETRY_DELAY_MS]);
  });

  it('recovers when a later attempt is answered', async () => {
    const { wallet, sent } = harness(['network', { body: { ok: true, balanceCents: 7 } }]);

    expect(await wallet.session()).toEqual({ kind: 'ready', balanceCents: 7 });
    expect(sent).toHaveLength(2);
  });

  it('does not call a session answer without a balance an answer', async () => {
    const { wallet, sent } = harness([
      { body: { ok: true } },
      { body: { ok: true, balanceCents: -1 } },
      { body: { ok: true, balanceCents: 1.5 } },
    ]);

    expect(failureOf(await wallet.session())).toBe('connection_lost');
    expect(sent).toHaveLength(ATTEMPTS);
  });
});

describe('spin', () => {
  it('sends the game, a key, the bet in cents and the base play', async () => {
    const { wallet, sent } = harness([{ body: playedBody }]);

    await wallet.spin(BET_CENTS);

    const call = sent[0];
    expect(call?.url).toBe('/api/game/spin');
    expect(call?.init.method).toBe('POST');
    expect(sentBody(call)).toEqual({ game: GAME, key: expect.any(String), betCents: BET_CENTS, play: { type: 'base' } });
  });

  it('stores the key and the bet before the request leaves', async () => {
    const store = createMemoryStore();
    let storedWhenSent: string | null = 'unset';
    const environment: WalletEnvironment = {
      search: SEARCH,
      store,
      send: () => {
        storedWhenSent = store.getItem(STORAGE_KEY);
        return Promise.resolve(Response.json(playedBody));
      },
      sleep: () => Promise.resolve(),
      newKey: () => 'key-1',
    };

    await createWallet<TestRound>(GAME, environment).spin(60);

    expect(JSON.parse(String(storedWhenSent))).toEqual({ key: 'key-1', betCents: 60 });
    expect(store.getItem(STORAGE_KEY)).toBeNull();
  });

  it('returns the round the server answered and clears the key', async () => {
    const { wallet, store } = harness([{ body: { ...playedBody, replay: true } }]);

    const outcome = await wallet.spin(BET_CENTS);

    expect(outcome).toEqual({
      kind: 'played',
      round: {
        roundId: 'round-1',
        round: { totalWin: 2 },
        winCents: 200,
        costCents: BET_CENTS,
        balanceCents: 9_900,
        replay: true,
        creditPending: false,
      },
    });
    expect(store.getItem(STORAGE_KEY)).toBeNull();
    expect(wallet.pendingBetCents()).toBeUndefined();
  });

  it('keeps the key and the bet after three failed attempts and sends them again with the stored bet', async () => {
    const { wallet, sent, sleeps } = harness([
      'network',
      'network',
      'network',
      { body: { ...playedBody, replay: true } },
    ]);

    const first = await wallet.spin(BET_CENTS);
    expect(first).toMatchObject({ kind: 'failed', failure: { code: 'connection_lost' } });
    expect(sleeps).toEqual([RETRY_DELAY_MS, RETRY_DELAY_MS]);
    expect(wallet.pendingBetCents()).toBe(BET_CENTS);

    const second = await wallet.spin(OTHER_BET_CENTS);

    expect(second).toMatchObject({ kind: 'played' });
    const bodies = sent.map(sentBody);
    expect(bodies).toHaveLength(4);
    expect(new Set(bodies.map((body) => body.key)).size).toBe(1);
    expect(bodies.map((body) => body.betCents)).toEqual([BET_CENTS, BET_CENTS, BET_CENTS, BET_CENTS]);
    expect(wallet.pendingBetCents()).toBeUndefined();
  });

  it('sends the key of an earlier page load after a reload', async () => {
    const { wallet, sent, store } = harness([{ body: { ...playedBody, replay: true } }]);
    createSpinKeyStore(store, GAME, TOKEN).save({ key: 'k-old', betCents: 60 });

    expect(wallet.pendingBetCents()).toBe(60);
    await wallet.spin(BET_CENTS);

    expect(sentBody(sent[0])).toMatchObject({ key: 'k-old', betCents: 60 });
  });

  it('takes a fresh key after a definite answer', async () => {
    const { wallet, sent } = harness([{ body: playedBody }, { body: playedBody }]);

    await wallet.spin(BET_CENTS);
    await wallet.spin(BET_CENTS);

    expect(sentBody(sent[0]).key).not.toBe(sentBody(sent[1]).key);
  });

  it.each([
    ['insufficient_funds', 422],
    ['bet_refused', 422],
    ['unavailable', 503],
    ['session_expired', 401],
    ['bad_request', 400],
  ])('clears the stored key on %s', async (error, status) => {
    const { wallet, store } = harness([{ status, body: { ok: false, error } }]);

    const outcome = await wallet.spin(BET_CENTS);

    expect(failureOf(outcome)).toBe(error);
    expect(store.getItem(STORAGE_KEY)).toBeNull();
    expect(wallet.pendingBetCents()).toBeUndefined();
  });

  it('keeps the stored key on busy and sends it again', async () => {
    const { wallet, sent } = harness([
      { status: 503, body: { ok: false, error: 'busy' } },
      { body: { ...playedBody, replay: true } },
    ]);

    const busy = await wallet.spin(BET_CENTS);
    expect(busy).toMatchObject({
      kind: 'failed',
      failure: { code: 'busy', message: 'THE CASINO IS BUSY. PRESS SPIN TO TRY AGAIN.' },
    });
    expect(wallet.pendingBetCents()).toBe(BET_CENTS);

    await wallet.spin(OTHER_BET_CENTS);

    const bodies = sent.map(sentBody);
    expect(bodies[1]).toEqual(bodies[0]);
  });

  it('treats a code it does not know like busy and keeps the key', async () => {
    const { wallet } = harness([{ status: 500, body: { ok: false, error: 'something_new' } }]);

    const outcome = await wallet.spin(BET_CENTS);

    expect(failureOf(outcome)).toBe('busy');
    expect(wallet.pendingBetCents()).toBe(BET_CENTS);
  });

  it.each([
    ['bet_refused', 'THIS BET WAS NOT ACCEPTED. NOTHING WAS CHARGED.'],
    ['unavailable', 'THE GAME IS NOT AVAILABLE NOW. TRY LATER.'],
    ['bad_request', 'THE GAME IS NOT AVAILABLE NOW. TRY LATER.'],
    ['insufficient_funds', 'NOT ENOUGH FUNDS'],
  ])('shows the text of %s and reveals no outcome', async (error, message) => {
    const { wallet } = harness([{ status: 422, body: { ok: false, error } }]);

    const outcome = await wallet.spin(BET_CENTS);

    expect(outcome).toMatchObject({ kind: 'failed', failure: { code: error, message } });
    expect(outcome).not.toHaveProperty('round');
  });

  it('offers the deposit button only with insufficient funds and carries the balance of the answer', async () => {
    const { wallet } = harness([
      { status: 422, body: { ok: false, error: 'insufficient_funds', balanceCents: 5 } },
    ]);

    const outcome = await wallet.spin(BET_CENTS);

    expect(outcome).toMatchObject({
      kind: 'failed',
      failure: { code: 'insufficient_funds', offersDeposit: true, balanceCents: 5 },
    });
    expect(FAILURE_MESSAGES.insufficient_funds).toBe('NOT ENOUGH FUNDS');
  });

  it('sends no spin after session_expired', async () => {
    const { wallet, sent } = harness([{ status: 401, body: { ok: false, error: 'session_expired' } }]);

    await wallet.spin(BET_CENTS);
    const again = await wallet.spin(BET_CENTS);

    expect(again).toMatchObject({ kind: 'failed', failure: { code: 'session_expired' } });
    expect(sent).toHaveLength(1);
  });

  it('retries an answer that is not an answer of the contract', async () => {
    const { wallet, sent } = harness([
      { body: { ok: true, roundId: 'r' } },
      { body: [] },
      { body: { ok: false } },
    ]);

    const outcome = await wallet.spin(BET_CENTS);

    expect(failureOf(outcome)).toBe('connection_lost');
    expect(sent).toHaveLength(ATTEMPTS);
    expect(wallet.pendingBetCents()).toBe(BET_CENTS);
  });
});

describe('spin answer money fields', () => {
  it('are whole non-negative cents or the answer is not accepted', async () => {
    const { wallet, sent } = harness([
      { body: { ...playedBody, winCents: -1 } },
      { body: { ...playedBody, costCents: 1.5 } },
      { body: { ...playedBody, balanceCents: '9900' } },
    ]);

    const outcome = await wallet.spin(BET_CENTS);

    expect(failureOf(outcome)).toBe('connection_lost');
    expect(sent).toHaveLength(ATTEMPTS);
  });
});

describe('credited win', () => {
  it('marks a creditPending answer', async () => {
    const { wallet } = harness([{ body: { ...playedBody, creditPending: true } }]);

    const outcome = await wallet.spin(BET_CENTS);

    expect(outcome).toMatchObject({ kind: 'played', round: { creditPending: true } });
  });

  it('does not read held or pending', async () => {
    const { wallet } = harness([{ body: { ...playedBody, held: 500, pending: true } }]);

    const outcome = await wallet.spin(BET_CENTS);

    expect(outcome.kind).toBe('played');
    if (outcome.kind === 'played') {
      expect(outcome.round).not.toHaveProperty('held');
      expect(outcome.round).not.toHaveProperty('pending');
      expect(outcome.round.creditPending).toBe(false);
    }
  });

  it('shows the win as winCents over 100 and not as the engine total times the bet', () => {
    const round: ServerRound<TestRound> = {
      roundId: 'r',
      round: { totalWin: 7 },
      winCents: 1_234,
      costCents: BET_CENTS,
      balanceCents: 10_000,
      replay: false,
      creditPending: false,
    };

    const view = roundView(round);

    expect(view.winAmount).toBe(12.34);
    expect(view.winAmount).not.toBe(round.round.totalWin * fromCents(round.costCents));
  });

  it('shows the balance after the bet while the animation runs and the balance with the win at the end', () => {
    const view = roundView({
      roundId: 'r',
      round: { totalWin: 2 },
      winCents: 200,
      costCents: BET_CENTS,
      balanceCents: 9_900,
      replay: false,
      creditPending: false,
    });

    expect(view.balanceAfterBetCents).toBe(9_700);
    expect(view.finalBalanceCents).toBe(9_900);
  });

  it('leaves a win that is still being credited out of the balance', () => {
    const view = roundView({
      roundId: 'r',
      round: { totalWin: 2 },
      winCents: 200,
      costCents: BET_CENTS,
      balanceCents: 9_700,
      replay: false,
      creditPending: true,
    });

    expect(view.balanceAfterBetCents).toBe(9_700);
    expect(view.finalBalanceCents).toBe(9_700);
    expect(view.creditPending).toBe(true);
  });
});

describe('money', () => {
  it.each([
    [0.1, 10],
    [0.6, 60],
    [1.2, 120],
    [1.8, 180],
    [9, 900],
    [10, 1_000],
    [19.99, 1_999],
  ])('turns the bet %s into %s whole cents', (amount, cents) => {
    expect(toCents(amount)).toBe(cents);
    expect(Number.isInteger(toCents(amount))).toBe(true);
  });

  it('sends the bet 0.60 as 60 cents', async () => {
    const { wallet, sent } = harness([{ body: playedBody }]);

    await wallet.spin(toCents(0.6));

    expect(sentBody(sent[0]).betCents).toBe(60);
  });

  it('turns cents into an amount for the meters', () => {
    expect(fromCents(10_000)).toBe(100);
    expect(fromCents(5)).toBe(0.05);
  });
});

describe('shares of the credited win', () => {
  const CREDITED_CENTS = 1_001;
  const WHOLE_UNITS = 7;

  it('splits the credited win into a base and a bonus that add up to it', () => {
    const baseCents = creditedShare(CREDITED_CENTS, 3, WHOLE_UNITS);
    const bonusCents = CREDITED_CENTS - baseCents;

    expect(baseCents).toBe(429);
    expect(baseCents + bonusCents).toBe(CREDITED_CENTS);
  });

  it('rounds each running tally to the cent and ends the last one on the credited win', () => {
    const tallies = [1, 2, 4, WHOLE_UNITS].map((units) => creditedShare(CREDITED_CENTS, units, WHOLE_UNITS));

    expect(tallies).toEqual([143, 286, 572, CREDITED_CENTS]);
    expect(tallies.every((cents) => Number.isInteger(cents))).toBe(true);
  });

  it('shows nothing for a part of a round that won no units', () => {
    expect(creditedShare(CREDITED_CENTS, 0, 0)).toBe(0);
  });
});

describe('before the spin', () => {
  it('lets the spin through at once when the shown balance covers the bet', async () => {
    const { wallet, sent } = harness([]);

    expect(await wallet.clearToSpin(BET_CENTS, BET_CENTS)).toEqual({ kind: 'clear', balanceCents: undefined });
    expect(sent).toEqual([]);
  });

  it('asks the server when the shown balance is below the bet and lets the spin through on a covering balance', async () => {
    const { wallet, sent } = harness([{ body: { ok: true, balanceCents: 5_005 } }]);

    const clearance = await wallet.clearToSpin(5, BET_CENTS);

    expect(clearance).toEqual({ kind: 'clear', balanceCents: 5_005 });
    expect(sent).toHaveLength(1);
    expect(sent[0]?.url).toBe(`/api/game/session?game=${GAME}`);
  });

  it('refuses with not enough funds when the fresh balance is below the bet too', async () => {
    const { wallet } = harness([{ body: { ok: true, balanceCents: 5 } }]);

    const clearance = await wallet.clearToSpin(5, BET_CENTS);

    expect(clearance).toMatchObject({
      kind: 'refused',
      failure: { code: 'insufficient_funds', message: 'NOT ENOUGH FUNDS', offersDeposit: true, balanceCents: 5 },
    });
  });

  it('asks again at the next spin so that a deposit made elsewhere lets it through', async () => {
    const { wallet, sent } = harness([
      { body: { ok: true, balanceCents: 5 } },
      { body: { ok: true, balanceCents: 5_005 } },
    ]);

    expect((await wallet.clearToSpin(5, BET_CENTS)).kind).toBe('refused');
    expect((await wallet.clearToSpin(5, BET_CENTS)).kind).toBe('clear');
    expect(sent).toHaveLength(2);
  });

  it('refuses with the failure of the session call when it fails', async () => {
    const { wallet } = harness([{ status: 401, body: { ok: false, error: 'session_expired' } }]);

    const clearance = await wallet.clearToSpin(0, BET_CENTS);

    expect(clearance).toMatchObject({ kind: 'refused', failure: { code: 'session_expired' } });
  });

  it('does not check the balance of a spin that is waiting for a definite answer', async () => {
    const { wallet, sent, store } = harness([]);
    createSpinKeyStore(store, GAME, TOKEN).save({ key: 'key-1', betCents: BET_CENTS });

    const clearance = await wallet.clearToSpin(0, BET_CENTS);

    expect(clearance).toEqual({ kind: 'clear', balanceCents: undefined });
    expect(sent).toEqual([]);
  });
});

describe('browser environment', () => {
  it('reads the address, the tab storage, the timer and the global fetch of the window', async () => {
    window.history.replaceState(null, '', `/play/${GAME}${SEARCH}`);
    const fetchMock = vi.fn().mockResolvedValue(Response.json({ ok: true, balanceCents: 3 }));
    vi.stubGlobal('fetch', fetchMock);

    const environment = browserEnvironment();
    const wallet = createWallet<TestRound>(GAME, environment);
    const session = await wallet.session();

    expect(environment.search).toBe(SEARCH);
    expect(session).toEqual({ kind: 'ready', balanceCents: 3 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(environment.newKey()).toMatch(/^[0-9a-f-]{36}$/);
    expect(environment.newKey()).not.toBe(environment.newKey());
    await expect(environment.sleep(1)).resolves.toBeUndefined();
  });

  it('is the environment of createWallet when none is given', async () => {
    window.history.replaceState(null, '', `/play/${GAME}${SEARCH}`);
    const fetchMock = vi.fn().mockResolvedValue(Response.json(playedBody));
    vi.stubGlobal('fetch', fetchMock);

    const outcome = await createWallet<TestRound>(GAME).spin(BET_CENTS);

    expect(outcome.kind).toBe('played');
    const init = fetchMock.mock.calls[0]?.[1] as RequestInit;
    expect(new Headers(init.headers).get('Authorization')).toBe(`Bearer ${TOKEN}`);
  });
});
