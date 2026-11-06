import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  bearer,
  closedPortUrl,
  postSpin,
  SPIN_URL,
  spinPayload,
  startSequencedHub,
  startSilentHub,
  startStack,
  type ScriptedAnswer,
  type Stack,
} from './helpers/app';
import { ManualClock } from './helpers/clock';

const SHORT_CALL_TIMEOUT_MS = '200';
const LONG_CALL_TIMEOUT_MS = '3000';
const SINGLE_ATTEMPT_BUDGET_MS = '150';
const AFTER_FIRST_SWEEP_PAUSE_MS = 5_000;
const BUSY: ScriptedAnswer = { status: 503, body: '{"status":"retry","code":"BUSY","message":"wallet is busy"}' };
const INTERNAL: ScriptedAnswer = { status: 503, body: '{"status":"retry","code":"INTERNAL","message":"failed"}' };
const FORBIDDEN: ScriptedAnswer = { status: 403, body: '' };

interface RoundRow {
  readonly status: string;
  readonly result: unknown;
  readonly win_cents: number;
  readonly refusal_code: string | null;
  readonly bet_sends: number;
  readonly bet_busy_answers: number;
}

async function rounds(stack: Stack): Promise<RoundRow[]> {
  const { rows } = await stack.database.pool.query<RoundRow>('select * from rounds order by created_at');
  return rows;
}

function refusal(code: string): ScriptedAnswer {
  return { status: 422, body: JSON.stringify({ status: 'refused', code, message: 'refused' }) };
}

function betCalls(stack: Stack): number {
  return stack.stub.calls.filter((call) => call.leg === 'bet').length;
}

describe('a spin that is not valid', () => {
  let stack: Stack;

  beforeAll(async () => {
    stack = await startStack();
  });

  afterAll(async () => {
    await stack.close();
  });

  afterEach(() => {
    stack.stub.calls.length = 0;
  });

  it.each([
    ['a bet of 5 cents', { betCents: 5 }],
    ['a bet of 150 cents', { betCents: 150 }],
    ['a bet of 1001 cents', { betCents: 1001 }],
    ['a bet of zero', { betCents: 0 }],
    ['a negative bet', { betCents: -10 }],
    ['a bet with a fraction of a cent', { betCents: 10.5 }],
    ['a bet written as text', { betCents: '10' }],
    ['no bet', { betCents: undefined }],
    ['an unknown game', { game: 'nope' }],
    ['a prototype name for a game', { game: '__proto__' }],
    ['no game', { game: undefined }],
    ['a game that is not text', { game: 5 }],
    ['no key', { key: undefined }],
    ['an empty key', { key: '' }],
    ['a key that is not text', { key: 5 }],
    ['a key longer than the journal keeps', { key: 'k'.repeat(129) }],
  ])('refuses %s with bad_request, draws nothing and calls the hub not at all', async (_name, overrides) => {
    const answer = await postSpin(stack.app, 'tok-rich', spinPayload(overrides));

    expect(answer.statusCode).toBe(400);
    expect(answer.body).toEqual({ ok: false, error: 'bad_request' });
    expect(await rounds(stack)).toHaveLength(0);
    expect(stack.stub.calls).toHaveLength(0);
  });

  it.each([
    ['text that is not JSON', '{broken'],
    ['JSON null', 'null'],
    ['a JSON array', '[]'],
    ['a JSON string', '"spin"'],
  ])('refuses %s with bad_request', async (_name, payload) => {
    const response = await stack.app.inject({
      method: 'POST',
      url: SPIN_URL,
      headers: { ...bearer('tok-rich'), 'content-type': 'application/json' },
      payload,
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({ ok: false, error: 'bad_request' });
    expect(await rounds(stack)).toHaveLength(0);
  });

  it('refuses a request with no body at all with bad_request', async () => {
    const response = await stack.app.inject({ method: 'POST', url: SPIN_URL, headers: bearer('tok-rich') });

    expect(response.json()).toEqual({ ok: false, error: 'bad_request' });
  });

  it('refuses a valid spin that has no launch token: no demo play, no guest play', async () => {
    const response = await stack.app.inject({ method: 'POST', url: SPIN_URL, payload: spinPayload() as object });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toEqual({ ok: false, error: 'session_expired' });
    expect(await rounds(stack)).toHaveLength(0);
    expect(stack.stub.calls).toHaveLength(0);
  });

  it('serves the spin by POST only', async () => {
    const response = await stack.app.inject({ method: 'GET', url: SPIN_URL, headers: bearer('tok-rich') });

    expect(response.statusCode).toBe(404);
  });
});

describe('a bet the hub refuses for good', () => {
  let stack: Stack;

  beforeAll(async () => {
    stack = await startStack();
  });

  afterAll(async () => {
    await stack.close();
  });

  afterEach(async () => {
    stack.stub.calls.length = 0;
    await stack.database.pool.query('delete from rounds');
  });

  it('answers session_expired, keeps a refused row with no result, and answers it again without a second bet', async () => {
    const payload = spinPayload();

    const first = await postSpin(stack.app, 'tok-expired', payload);
    const again = await postSpin(stack.app, 'tok-expired', payload);

    expect(first.statusCode).toBe(401);
    expect(first.body).toEqual({ ok: false, error: 'session_expired' });
    expect(again).toEqual(first);
    const stored = await rounds(stack);
    expect(stored).toHaveLength(1);
    expect(stored[0]).toMatchObject({ status: 'refused', result: null, win_cents: 0, refusal_code: 'SESSION_NOT_FOUND' });
    expect(betCalls(stack)).toBe(1);
  });

  it('answers insufficient_funds with the balance, no outcome, drops the drawn result and never repeats the bet', async () => {
    const payload = spinPayload();

    const first = await postSpin(stack.app, 'tok-poor', payload);
    const again = await postSpin(stack.app, 'tok-poor', payload);

    expect(first.statusCode).toBe(422);
    expect(first.body).toEqual({ ok: false, error: 'insufficient_funds', balanceCents: 5 });
    expect(again).toEqual(first);
    expect(first.raw).not.toContain('round');
    expect(first.raw).not.toContain('winCents');
    const stored = await rounds(stack);
    expect(stored).toHaveLength(1);
    expect(stored[0]).toMatchObject({ status: 'refused', result: null, win_cents: 0, refusal_code: 'INSUFFICIENT_FUNDS' });
    expect(betCalls(stack)).toBe(1);
  });

  it('answers bet_refused to LIMIT_EXCEEDED and returns the same refusal for the same key without a second bet', async () => {
    const payload = spinPayload();

    const first = await postSpin(stack.app, 'tok-limit', payload);
    const again = await postSpin(stack.app, 'tok-limit', payload);

    expect(first.statusCode).toBe(422);
    expect(first.body).toEqual({ ok: false, error: 'bet_refused' });
    expect(again).toEqual(first);
    expect((await rounds(stack))[0]).toMatchObject({ status: 'refused', result: null, refusal_code: 'LIMIT_EXCEEDED' });
    expect(betCalls(stack)).toBe(1);
  });
});

describe('a bet the hub answers with a scripted refusal', () => {
  const closers: Array<() => Promise<void>> = [];

  afterEach(async () => {
    await Promise.all(closers.splice(0).map((close) => close()));
  });

  async function against(answers: readonly ScriptedAnswer[]) {
    const hub = await startSequencedHub(answers);
    closers.push(hub.close);
    const stack = await startStack({ HUB_BASE_URL: hub.url });
    closers.push(stack.close);
    return { hub, stack };
  }

  it.each([
    ['REFUSED', 'bet_refused', 422],
    ['CONFLICT', 'bet_refused', 422],
    ['BAD_REQUEST', 'bet_refused', 422],
    ['UNAUTHORIZED', 'unavailable', 503],
  ])('turns the refusal %s into %s and never repeats the bet', async (code, error, statusCode) => {
    const { hub, stack } = await against([refusal(code)]);
    const payload = spinPayload();

    const first = await postSpin(stack.app, 'tok-rich', payload);
    const again = await postSpin(stack.app, 'tok-rich', payload);

    expect(first.statusCode).toBe(statusCode);
    expect(first.body).toEqual({ ok: false, error });
    expect(again).toEqual(first);
    expect(await rounds(stack)).toMatchObject([{ status: 'refused', result: null, refusal_code: code }]);
    expect(hub.requests).toHaveLength(1);
  });

  it.each([
    [401, 'UNAUTHORIZED'],
    [403, 'FORBIDDEN'],
    [404, 'NOT_FOUND'],
  ])(
    'answers unavailable to a first bet answered %i, ends the round refused and never repeats the bet',
    async (status, code) => {
      const { hub, stack } = await against([{ status, body: '' }]);
      const payload = spinPayload();

      const first = await postSpin(stack.app, 'tok-rich', payload);
      const again = await postSpin(stack.app, 'tok-rich', payload);

      expect(first.statusCode).toBe(503);
      expect(first.body).toEqual({ ok: false, error: 'unavailable' });
      expect(again).toEqual(first);
      expect(await rounds(stack)).toMatchObject([
        { status: 'refused', result: null, refusal_code: code, bet_sends: 1, bet_busy_answers: 0 },
      ]);
      expect(hub.requests).toHaveLength(1);
    },
  );

  it('answers insufficient_funds without a balance when the balance cannot be read, and repeats that answer', async () => {
    const { hub, stack } = await against([refusal('INSUFFICIENT_FUNDS'), BUSY]);
    const payload = spinPayload();

    const first = await postSpin(stack.app, 'tok-rich', payload);
    const again = await postSpin(stack.app, 'tok-rich', payload);

    expect(first.statusCode).toBe(422);
    expect(first.body).toEqual({ ok: false, error: 'insufficient_funds' });
    expect(again).toEqual(first);
    expect(hub.requests.map((request) => request.path.split('/').pop())).toEqual(['bet', 'balance']);
  });
});

describe('a bet that gets no definite answer', () => {
  const closers: Array<() => Promise<void>> = [];

  afterEach(async () => {
    await Promise.all(closers.splice(0).map((close) => close()));
  });

  async function against(
    hubUrl: string | undefined,
    env: NodeJS.ProcessEnv = {},
    clock?: ManualClock,
  ): Promise<Stack> {
    const stack = await startStack(
      { HUB_CALL_TIMEOUT_MS: SINGLE_ATTEMPT_BUDGET_MS, ...(hubUrl === undefined ? {} : { HUB_BASE_URL: hubUrl }), ...env },
      { clock },
    );
    closers.push(stack.close);
    return stack;
  }

  async function scripted(...answers: ScriptedAnswer[]) {
    const hub = await startSequencedHub(answers);
    closers.push(hub.close);
    return hub;
  }

  const BUSY_ANSWER = { statusCode: 503, body: { ok: false, error: 'busy' } };

  it('counts a send answered BUSY as a send and as a busy answer, and keeps the round for the repeat', async () => {
    const hub = await scripted(BUSY);
    const stack = await against(hub.url);

    const answer = await postSpin(stack.app, 'tok-rich');

    expect({ statusCode: answer.statusCode, body: answer.body }).toEqual(BUSY_ANSWER);
    const [row] = await rounds(stack);
    expect(row).toMatchObject({ status: 'bet_pending', bet_sends: 1, bet_busy_answers: 1 });
    expect(row.result).not.toBeNull();
  });

  it('counts a send answered INTERNAL as a send only', async () => {
    const stack = await against(undefined);

    const answer = await postSpin(stack.app, 'tok-bet-internal');

    expect({ statusCode: answer.statusCode, body: answer.body }).toEqual(BUSY_ANSWER);
    expect((await rounds(stack))[0]).toMatchObject({ status: 'bet_pending', bet_sends: 1, bet_busy_answers: 0 });
  });

  it('counts a send that timed out as a send only', async () => {
    const hub = await startSilentHub();
    closers.push(hub.close);
    const stack = await against(hub.url, { HUB_CALL_TIMEOUT_MS: SHORT_CALL_TIMEOUT_MS });

    const answer = await postSpin(stack.app, 'tok-rich');

    expect({ statusCode: answer.statusCode, body: answer.body }).toEqual(BUSY_ANSWER);
    expect((await rounds(stack))[0]).toMatchObject({ status: 'bet_pending', bet_sends: 1, bet_busy_answers: 0 });
  });

  it('counts a send that ended in a closed connection as a send only', async () => {
    const stack = await against(await closedPortUrl());

    const answer = await postSpin(stack.app, 'tok-rich');

    expect({ statusCode: answer.statusCode, body: answer.body }).toEqual(BUSY_ANSWER);
    expect((await rounds(stack))[0]).toMatchObject({ status: 'bet_pending', bet_sends: 1, bet_busy_answers: 0 });
  });

  it('has the send counted while the call is still out, so a stopped process leaves sends above busy answers', async () => {
    const hub = await startSilentHub();
    closers.push(hub.close);
    const stack = await against(hub.url, { HUB_CALL_TIMEOUT_MS: LONG_CALL_TIMEOUT_MS });

    const pending = postSpin(stack.app, 'tok-rich');
    await vi.waitFor(async () => {
      expect(await rounds(stack)).toMatchObject([{ status: 'bet_pending', bet_sends: 1, bet_busy_answers: 0 }]);
    });
    const answer = await pending;

    expect(answer.body).toEqual({ ok: false, error: 'busy' });
  });

  it('keeps the round open when a later 403 follows a send that may have debited, and sends the same bet again', async () => {
    const hub = await scripted(INTERNAL, FORBIDDEN);
    const clock = new ManualClock();
    const stack = await against(hub.url, {}, clock);
    const payload = spinPayload();

    const first = await postSpin(stack.app, 'tok-rich', payload);
    clock.advance(AFTER_FIRST_SWEEP_PAUSE_MS);
    const second = await postSpin(stack.app, 'tok-rich', payload);

    expect(first.body).toEqual({ ok: false, error: 'busy' });
    expect(second.body).toEqual({ ok: false, error: 'busy' });
    expect(await rounds(stack)).toMatchObject([{ status: 'bet_pending', bet_sends: 2, bet_busy_answers: 0 }]);
    const sent = hub.requests.map((request) => JSON.parse(request.body).transactionId);
    expect(sent[0]).toBe(sent[1]);
  });

  it('ends the round when a later 403 follows only sends answered BUSY', async () => {
    const hub = await scripted(BUSY, FORBIDDEN);
    const clock = new ManualClock();
    const stack = await against(hub.url, {}, clock);
    const payload = spinPayload();

    await postSpin(stack.app, 'tok-rich', payload);
    clock.advance(AFTER_FIRST_SWEEP_PAUSE_MS);
    const second = await postSpin(stack.app, 'tok-rich', payload);

    expect(second.body).toEqual({ ok: false, error: 'unavailable' });
    expect(await rounds(stack)).toMatchObject([{ status: 'refused', result: null, bet_sends: 2, bet_busy_answers: 1 }]);
  });
});
