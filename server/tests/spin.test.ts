import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { startDevStack, type RecordedCall } from '../dev/stub-hub';
import { GAMES } from '../src/games/registry';
import { SIGNATURE_HEADER, signBody } from '../src/hub/sign';
import { winCents } from '../src/money';
import {
  bearer,
  freshKey,
  postSpin,
  SPIN_BET_CENTS,
  SPIN_GAME,
  spinPayload,
  spinUntilWin,
  startSequencedHub,
  startStack,
  TEST_HMAC_KEY,
  TEST_PARTNER,
  TEST_PUBLIC_DIR,
  type SequencedHub,
  type Stack,
} from './helpers/app';
import { createTestDatabase } from './helpers/db';

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const RANDOM_BUFFER_LENGTH = 1024;
const ACCEPTED = '{"status":"ok","balanceCents":9990,"currency":"USD"}';
const TROPIC_ESCAPE = 'tropic-escape';
const BET_URL = `/webhook/${TEST_PARTNER}/bet`;
const WIN_URL = `/webhook/${TEST_PARTNER}/win`;

interface RoundRow {
  readonly id: string;
  readonly game: string;
  readonly token: string;
  readonly spin_key: string;
  readonly bet_cents: number;
  readonly result: { totalWin: number } | null;
  readonly win_cents: number;
  readonly status: string;
  readonly bet_sends: number;
  readonly bet_busy_answers: number;
}

async function rounds(stack: Stack): Promise<RoundRow[]> {
  const { rows } = await stack.database.pool.query<RoundRow>('select * from rounds order by created_at');
  return rows;
}

async function balanceOf(stack: Stack, token: string): Promise<number> {
  const response = await stack.app.inject({ url: `/api/game/session?game=${SPIN_GAME}`, headers: bearer(token) });
  return response.json().balanceCents;
}

function moneyCalls(stack: Stack, roundId: string): RecordedCall[] {
  return stack.stub.calls.filter(
    (call) => call.leg !== 'balance' && (call.body as { roundId?: string }).roundId === roundId,
  );
}

describe('a spin through the application', () => {
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

  it('answers the outcome the server drew and keeps the whole round', async () => {
    const answer = await postSpin(stack.app, 'tok-rich');

    expect(answer.statusCode).toBe(200);
    expect(answer.body).toMatchObject({ ok: true, costCents: SPIN_BET_CENTS });
    expect(answer.body.roundId).toMatch(UUID_V4);
    expect(answer.body.replay).toBeUndefined();
    expect(answer.body.creditPending).toBeUndefined();
    const [row] = (await rounds(stack)).filter((candidate) => candidate.id === answer.body.roundId);
    expect(row).toMatchObject({
      game: SPIN_GAME,
      token: 'tok-rich',
      bet_cents: SPIN_BET_CENTS,
      win_cents: answer.body.winCents,
      status: 'settled',
    });
    expect(row.result).toEqual(answer.body.round);
    expect(typeof row.result?.totalWin).toBe('number');
  });

  it('credits the whole win in one call after the bet, under the two transaction ids of the round', async () => {
    const { answer } = await spinUntilWin(stack.app, 'tok-rich', true);

    const roundId = answer.body.roundId as string;
    const credited = answer.body.winCents as number;
    expect(credited).toBeGreaterThan(0);
    expect(moneyCalls(stack, roundId).map((call) => call.body)).toEqual([
      {
        token: 'tok-rich',
        transactionId: `${roundId}:bet`,
        roundId,
        amountCents: SPIN_BET_CENTS,
        roundClose: false,
      },
      { token: 'tok-rich', transactionId: `${roundId}:win`, roundId, amountCents: credited, roundClose: true },
    ]);
    expect(moneyCalls(stack, roundId).map((call) => call.leg)).toEqual(['bet', 'win']);
    expect(await balanceOf(stack, 'tok-rich')).toBe(answer.body.balanceCents);
  });

  it('ends a round that won nothing with the bet call alone, sent with roundClose true', async () => {
    const { answer } = await spinUntilWin(stack.app, 'tok-rich', false);

    const roundId = answer.body.roundId as string;
    expect(answer.body.winCents).toBe(0);
    expect(moneyCalls(stack, roundId).map((call) => call.body)).toEqual([
      {
        token: 'tok-rich',
        transactionId: `${roundId}:bet`,
        roundId,
        amountCents: SPIN_BET_CENTS,
        roundClose: true,
      },
    ]);
    expect(moneyCalls(stack, roundId).map((call) => call.leg)).toEqual(['bet']);
    const [row] = (await rounds(stack)).filter((candidate) => candidate.id === roundId);
    expect(row).toMatchObject({ win_cents: 0, status: 'settled' });
  });

  it('moves the balance by the bet minus the win, taken from the hub', async () => {
    const before = await balanceOf(stack, 'tok-rich-2');

    const answer = await postSpin(stack.app, 'tok-rich-2');

    expect(answer.body.balanceCents).toBe(before - SPIN_BET_CENTS + (answer.body.winCents as number));
  });

  it('turns the total win of the engine into whole cents, rounded to the nearest cent, and credits exactly that', async () => {
    const overrides = { game: TROPIC_ESCAPE, betCents: 100 };
    const { answer } = await spinUntilWin(stack.app, 'tok-rich', true, overrides);

    const roundId = answer.body.roundId as string;
    const [row] = (await rounds(stack)).filter((candidate) => candidate.id === roundId);
    const expected = winCents(100, row.result?.totalWin ?? Number.NaN, GAMES[TROPIC_ESCAPE].lines);
    expect(Number.isInteger(row.win_cents)).toBe(true);
    expect(row.win_cents).toBe(expected);
    expect(answer.body.winCents).toBe(expected);
    const winCall = moneyCalls(stack, roundId).find((call) => call.leg === 'win');
    expect((winCall?.body as { amountCents: number }).amountCents).toBe(expected);
  });

  it('takes no outcome, bet or win from the browser', async () => {
    const forged = { round: { totalWin: 500 }, result: { totalWin: 500 }, winCents: 1_000_000, totalWin: 500 };

    const { answer } = await spinUntilWin(stack.app, 'tok-rich', false, forged);

    expect(answer.body.winCents).toBe(0);
    const roundId = answer.body.roundId as string;
    expect(moneyCalls(stack, roundId)).toHaveLength(1);
    const [row] = (await rounds(stack)).filter((candidate) => candidate.id === roundId);
    expect(row.result).not.toEqual(forged.result);
  });

  it('signs the bet call and the win call under the partner key', async () => {
    const { answer } = await spinUntilWin(stack.app, 'tok-rich', true);

    const calls = moneyCalls(stack, answer.body.roundId as string);
    expect(calls).toHaveLength(2);
    for (const call of calls) {
      expect(call.signature).toBe(signBody(TEST_HMAC_KEY, call.rawBody));
    }
  });
});

describe('the order of one spin', () => {
  const closers: Array<() => Promise<void>> = [];

  afterEach(async () => {
    await Promise.all(closers.splice(0).map((close) => close()));
  });

  it('saves the drawn round, and counts the send, before the bet call leaves', async () => {
    const holder: { stack?: Stack } = {};
    const seen: RoundRow[][] = [];
    const hub: SequencedHub = await startSequencedHub([{ status: 200, body: ACCEPTED }], async () => {
      if (holder.stack !== undefined) {
        seen.push(await rounds(holder.stack));
      }
    });
    closers.push(hub.close);
    holder.stack = await startStack({ HUB_BASE_URL: hub.url });
    closers.push(holder.stack.close);

    await postSpin(holder.stack.app, 'tok-rich');

    expect(seen[0]).toHaveLength(1);
    expect(seen[0][0]).toMatchObject({
      status: 'bet_pending',
      token: 'tok-rich',
      bet_cents: SPIN_BET_CENTS,
      bet_sends: 1,
      bet_busy_answers: 0,
    });
    expect(seen[0][0].result).not.toBeNull();
  });

  it('draws with the secure random source', async () => {
    const spy = vi.spyOn(globalThis.crypto, 'getRandomValues');
    const fresh = await startStack();
    closers.push(fresh.close);
    try {
      await postSpin(fresh.app, 'tok-rich');

      const buffers = spy.mock.calls.map(([buffer]) => buffer);
      expect(buffers.some((buffer) => buffer instanceof Uint32Array && buffer.length === RANDOM_BUFFER_LENGTH)).toBe(
        true,
      );
    } finally {
      spy.mockRestore();
    }
  });

  it('answers busy, not a 500, and calls the hub not at all when the journal fails', async () => {
    const broken = await startStack();
    closers.push(broken.close);
    await broken.database.pool.query('drop table rounds');

    const answer = await postSpin(broken.app, 'tok-rich');

    expect(answer.statusCode).toBe(503);
    expect(answer.body).toEqual({ ok: false, error: 'busy' });
    expect(broken.stub.calls).toHaveLength(0);
  });
});

describe('the development stack', () => {
  it('migrates its database before the start and plays a spin against the stub hub', async () => {
    const database = await createTestDatabase(false);
    const dev = await startDevStack({
      PORT: '0',
      STUB_PORT: '0',
      PUBLIC_DIR: TEST_PUBLIC_DIR,
      LOG_LEVEL: 'silent',
      DATABASE_URL: database.url,
    });
    try {
      const response = await fetch(`${dev.gameUrl}/api/game/spin`, {
        method: 'POST',
        headers: { ...bearer('tok-rich'), 'content-type': 'application/json' },
        body: JSON.stringify(spinPayload()),
      });

      expect(response.status).toBe(200);
      expect((await database.pool.query('select id from rounds')).rowCount).toBe(1);
      expect(dev.stub.calls.map((call) => call.leg)[0]).toBe('bet');
    } finally {
      await dev.close();
      await database.close();
    }
  });
});

describe('the stub hub that stands in for the money legs', () => {
  let stack: Stack;

  beforeAll(async () => {
    stack = await startStack();
  });

  afterAll(async () => {
    await stack.close();
  });

  async function send(path: string, raw: string, key = TEST_HMAC_KEY): Promise<Response> {
    return fetch(`${stack.stub.url}${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', [SIGNATURE_HEADER]: signBody(key, raw) },
      body: raw,
    });
  }

  function money(roundId: string, leg: 'bet' | 'win', extra: Record<string, unknown> = {}): string {
    return JSON.stringify({
      token: 'tok-rich',
      transactionId: `${roundId}:${leg}`,
      roundId,
      amountCents: 10,
      roundClose: false,
      ...extra,
    });
  }

  it('books one bet once per transaction id and answers a repeat with the booked answer', async () => {
    const roundId = freshKey();

    const first = (await (await send(BET_URL, money(roundId, 'bet'))).json()) as { status: string };
    const second = (await (await send(BET_URL, money(roundId, 'bet'))).json()) as { status: string };

    expect(second).toEqual(first);
    expect(first.status).toBe('ok');
  });

  it('refuses a partner it does not know with 404', async () => {
    const response = await send(`/webhook/${TEST_PARTNER}-x/bet`, money(freshKey(), 'bet'));

    expect(response.status).toBe(404);
  });

  it.each([
    ['balance', `/webhook/${TEST_PARTNER}/balance`, '{"token":"tok-rich"}'],
    ['win', WIN_URL, money(freshKey(), 'win')],
  ])('refuses a %s body signed with another key with 401', async (_leg, path, raw) => {
    const response = await send(path, raw, `${TEST_HMAC_KEY}-x`);

    expect(response.status).toBe(401);
  });

  it.each([
    ['text that is not JSON', 'not json'],
    ['a body with a key the contract does not know', money(freshKey(), 'bet', { extra: true })],
    ['an amount of zero', money(freshKey(), 'bet', { amountCents: 0 })],
    ['an amount that is not whole', money(freshKey(), 'bet', { amountCents: 1.5 })],
    ['a transaction id that is not the round id and the leg', money(freshKey(), 'win')],
    ['a round close that is not a boolean', money(freshKey(), 'bet', { roundClose: 'no' })],
  ])('refuses %s with BAD_REQUEST', async (_name, raw) => {
    const response = await send(BET_URL, raw);

    expect(response.status).toBe(422);
    expect(await response.json()).toMatchObject({ status: 'refused', code: 'BAD_REQUEST' });
  });

  it('answers a win for a token it does not know with SESSION_NOT_FOUND', async () => {
    const roundId = freshKey();

    const response = await send(WIN_URL, money(roundId, 'win', { token: 'tok-unknown' }));

    expect(await response.json()).toMatchObject({ code: 'SESSION_NOT_FOUND' });
  });
});
