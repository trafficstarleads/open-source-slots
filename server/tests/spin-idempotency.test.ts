import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import {
  bearer,
  postSpin,
  SPIN_GAME,
  spinPayload,
  spinUntilWin,
  startSequencedHub,
  startStack,
  type ScriptedAnswer,
  type Stack,
} from './helpers/app';

const INTERNAL: ScriptedAnswer = { status: 503, body: '{"status":"retry","code":"INTERNAL","message":"failed"}' };
const ACCEPTED: ScriptedAnswer = { status: 200, body: '{"status":"ok","balanceCents":9990,"currency":"USD"}' };
const SETTLED_BALANCE_CENTS = 777;

interface RoundRow {
  readonly id: string;
  readonly status: string;
  readonly result: unknown;
  readonly bet_sends: number;
  readonly balance_cents: number | null;
}

async function rounds(stack: Stack): Promise<RoundRow[]> {
  const { rows } = await stack.database.pool.query<RoundRow>('select * from rounds order by created_at');
  return rows;
}

async function balanceOf(stack: Stack, token: string): Promise<number> {
  const response = await stack.app.inject({ url: `/api/game/session?game=${SPIN_GAME}`, headers: bearer(token) });
  return response.json().balanceCents;
}

describe('a spin key that arrives again', () => {
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
    ['a winning', true],
    ['a losing', false],
  ])('answers the first answer of %s round, marked replay, and draws, debits and credits nothing again', async (_name, wantsWin) => {
    const { answer: first, payload } = await spinUntilWin(stack.app, 'tok-rich', wantsWin);
    const balanceBefore = await balanceOf(stack, 'tok-rich');
    const rowsBefore = await rounds(stack);
    stack.stub.calls.length = 0;

    const again = await postSpin(stack.app, 'tok-rich', payload);

    expect(again.statusCode).toBe(200);
    expect(again.body).toEqual({ ...first.body, replay: true });
    expect(stack.stub.calls).toHaveLength(0);
    expect(await balanceOf(stack, 'tok-rich')).toBe(balanceBefore);
    expect(await rounds(stack)).toEqual(rowsBefore);
  });

  it('answers the win of a repeated key as a JSON number, from an integer column', async () => {
    const { answer: first, payload } = await spinUntilWin(stack.app, 'tok-rich', true);

    const again = await postSpin(stack.app, 'tok-rich', payload);

    expect(again.raw).toMatch(/"winCents":\d+[,}]/);
    expect(again.body.winCents).toBe(first.body.winCents);
    const column = await stack.database.pool.query(
      "select data_type from information_schema.columns where table_name = 'rounds' and column_name = 'win_cents' and table_schema = current_schema()",
    );
    expect(column.rows).toEqual([{ data_type: 'integer' }]);
  });

  it.each([
    ['another bet', { betCents: 200 }],
    ['another game', { game: 'nitro-hot' }],
  ])('answers the first answer when the same key comes with %s', async (_name, overrides) => {
    const payload = spinPayload();
    const before = (await rounds(stack)).length;
    const first = await postSpin(stack.app, 'tok-rich', payload);

    const again = await postSpin(stack.app, 'tok-rich', { ...payload, ...overrides });

    expect(again.body).toEqual({ ...first.body, replay: true });
    expect((await rounds(stack)).length).toBe(before + 1);
  });

  it('makes another round of the same key from another token, and debits each player once', async () => {
    const payload = spinPayload();

    const mine = await postSpin(stack.app, 'tok-rich', payload);
    const theirs = await postSpin(stack.app, 'tok-rich-2', payload);

    expect(mine.body.ok).toBe(true);
    expect(theirs.body.ok).toBe(true);
    expect(theirs.body.roundId).not.toBe(mine.body.roundId);
    const bets = stack.stub.calls.filter((call) => call.leg === 'bet').map((call) => (call.body as { token: string }).token);
    expect(bets.sort()).toEqual(['tok-rich', 'tok-rich-2']);
  });

  it('makes one round of two requests with one key at once', async () => {
    const payload = spinPayload();
    const before = (await rounds(stack)).length;

    const [first, second] = await Promise.all([
      postSpin(stack.app, 'tok-rich', payload),
      postSpin(stack.app, 'tok-rich', payload),
    ]);

    expect((await rounds(stack)).length).toBe(before + 1);
    expect(first.body.ok).toBe(true);
    expect(second.body.ok).toBe(true);
    expect(second.body.roundId).toBe(first.body.roundId);
    const transactionIds = new Set(
      stack.stub.calls
        .filter((call) => call.leg === 'bet')
        .map((call) => (call.body as { transactionId: string }).transactionId),
    );
    expect(transactionIds).toEqual(new Set([`${first.body.roundId}:bet`]));
  });
});

describe('a round that still owes its win', () => {
  let stack: Stack;

  beforeAll(async () => {
    stack = await startStack();
  });

  afterAll(async () => {
    await stack.close();
  });

  it('shows the outcome marked creditPending and keeps the round win_pending, and a repeat does not credit again', async () => {
    const { answer: first, payload } = await spinUntilWin(stack.app, 'tok-win-busy', true);
    const roundId = first.body.roundId as string;
    stack.stub.calls.length = 0;

    const again = await postSpin(stack.app, 'tok-win-busy', payload);

    expect(first.statusCode).toBe(200);
    expect(first.body.creditPending).toBe(true);
    expect(first.body.replay).toBeUndefined();
    expect(again.body).toEqual({ ...first.body, replay: true });
    expect(stack.stub.calls).toHaveLength(0);
    const row = (await rounds(stack)).find((candidate) => candidate.id === roundId);
    expect(row?.status).toBe('win_pending');
  });

  it('answers the outcome of a parked round marked creditPending', async () => {
    const { answer: first, payload } = await spinUntilWin(stack.app, 'tok-win-busy', true);
    await stack.database.pool.query("update rounds set status = 'parked' where id = $1", [first.body.roundId]);
    stack.stub.calls.length = 0;

    const again = await postSpin(stack.app, 'tok-win-busy', payload);

    expect(again.body).toEqual({ ...first.body, replay: true });
    expect(again.body.creditPending).toBe(true);
    expect(stack.stub.calls).toHaveLength(0);
  });
});

describe('a key whose bet is still pending', () => {
  const closers: Array<() => Promise<void>> = [];

  afterEach(async () => {
    await Promise.all(closers.splice(0).map((close) => close()));
  });

  it('sends the same bet again with the same transaction id and answers the round already drawn', async () => {
    const hub = await startSequencedHub([INTERNAL, ACCEPTED]);
    closers.push(hub.close);
    const stack = await startStack({ HUB_BASE_URL: hub.url });
    closers.push(stack.close);
    const payload = spinPayload();

    const first = await postSpin(stack.app, 'tok-rich', payload);
    const [drawn] = await rounds(stack);
    const again = await postSpin(stack.app, 'tok-rich', payload);

    expect(first.body).toEqual({ ok: false, error: 'busy' });
    expect(again.statusCode).toBe(200);
    expect(again.body).toMatchObject({ ok: true, replay: true, roundId: drawn.id, balanceCents: 9990 });
    expect(again.body.round).toEqual(drawn.result);
    const bets = hub.requests.slice(0, 2).map((request) => JSON.parse(request.body).transactionId);
    expect(bets).toEqual([`${drawn.id}:bet`, `${drawn.id}:bet`]);
    expect(await rounds(stack)).toMatchObject([{ id: drawn.id, bet_sends: 2 }]);
  });

  it('answers from the row, and does not revert it, when the round was settled while the call was out', async () => {
    const holder: { stack?: Stack } = {};
    const hub = await startSequencedHub([ACCEPTED], async () => {
      await holder.stack?.database.pool.query(
        "update rounds set status = 'settled', balance_cents = $1, win_cents = 0",
        [SETTLED_BALANCE_CENTS],
      );
    });
    closers.push(hub.close);
    holder.stack = await startStack({ HUB_BASE_URL: hub.url });
    closers.push(holder.stack.close);

    const answer = await postSpin(holder.stack.app, 'tok-rich');

    expect(answer.statusCode).toBe(200);
    expect(answer.body).toMatchObject({ ok: true, balanceCents: SETTLED_BALANCE_CENTS, winCents: 0 });
    expect(answer.body.creditPending).toBeUndefined();
    expect(await rounds(holder.stack)).toMatchObject([{ status: 'settled', balance_cents: SETTLED_BALANCE_CENTS }]);
    expect(hub.requests).toHaveLength(1);
  });
});
