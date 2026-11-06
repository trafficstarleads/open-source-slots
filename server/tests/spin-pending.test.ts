import { afterEach, describe, expect, it, vi } from 'vitest';
import { systemClock } from '../src/clock';
import type { Database } from '../src/db/pool';
import type { HubAnswer } from '../src/hub/client';
import { createSpinService, type SpinCommand } from '../src/spin/spin';
import {
  freshKey,
  postSpin,
  SPIN_BET_CENTS,
  SPIN_GAME,
  spinPayload,
  spinUntilWin,
  startStack,
  type Stack,
} from './helpers/app';
import { ManualClock } from './helpers/clock';
import {
  accepted,
  BUSY,
  createRig,
  INTERNAL,
  NO_ANSWER,
  refused,
  rejected,
  RIG_BALANCE_CENTS,
  RIG_RETRY,
  RIG_TOKEN,
  RIG_WIN_CENTS,
  type HubCallRecord,
  type Rig,
  type RigOptions,
} from './helpers/rig';

const BUDGET_MS = RIG_RETRY.budgetMs;
const LEASE_MS = RIG_RETRY.leaseMs;
const FIRST_SWEEP_PAUSE_MS = 5_000;
const POLL_MS = 100;
const SCALED_CALL_TIMEOUT_MS = '1000';
const SCALED_LOCK_WAIT_MS = 300;
const SHORT_CALL_TIMEOUT_MS = '300';

function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void } {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

const rigs: Rig[] = [];
const stacks: Stack[] = [];

async function open(options: RigOptions = {}): Promise<Rig> {
  const rig = await createRig(options);
  rigs.push(rig);
  return rig;
}

afterEach(async () => {
  await Promise.all([...rigs.splice(0).map((rig) => rig.close()), ...stacks.splice(0).map((stack) => stack.close())]);
});

describe('a bet that gets no definite answer inside the spin request', () => {
  it('repeats a bet answered BUSY inside the same request, for the same round, and answers the outcome', async () => {
    const clock = new ManualClock();
    const rig = await open({ clock, hub: { bet: [BUSY, accepted()] } });

    const outcome = await rig.play();

    expect(outcome).toMatchObject({ ok: true, winCents: RIG_WIN_CENTS, balanceCents: RIG_BALANCE_CENTS });
    expect(rig.hub.bets.map((record) => record.call.roundId)).toEqual(Array(2).fill((await rig.onlyRow()).id));
    expect(clock.sleeps).toEqual([200]);
    expect(await rig.onlyRow()).toMatchObject({ status: 'settled', bet_sends: 2, bet_busy_answers: 1, attempts: 0 });
  });

  it('does not let a BUSY answer keep the round open when the next send is answered 403', async () => {
    const rig = await open({ hub: { bet: [BUSY, rejected(403)] } });

    const outcome = await rig.play();

    expect(outcome).toMatchObject({ ok: false, error: 'unavailable' });
    expect(await rig.onlyRow()).toMatchObject({ status: 'refused', refusal_code: 'FORBIDDEN', bet_sends: 2, bet_busy_answers: 1 });
  });

  it('ends the round on a 403 to the first send', async () => {
    const rig = await open({ hub: { bet: [rejected(403)] } });

    const outcome = await rig.play();

    expect(outcome).toMatchObject({ ok: false, error: 'unavailable' });
    expect(await rig.onlyRow()).toMatchObject({ status: 'refused', bet_sends: 1 });
    expect(rig.hub.bets).toHaveLength(1);
  });

  it('keeps the round open and repeats the same bet when a 403 follows a send that may have debited', async () => {
    const rig = await open({ hub: { bet: [INTERNAL, rejected(403)] } });

    const outcome = await rig.play();

    expect(outcome).toMatchObject({ ok: false, error: 'busy' });
    const row = await rig.onlyRow();
    expect(row).toMatchObject({ status: 'bet_pending', bet_busy_answers: 0, attempts: 1, last_error: 'HTTP_403' });
    expect(rig.hub.bets.length).toBeGreaterThan(2);
    expect(new Set(rig.hub.bets.map((record) => record.call.roundId))).toEqual(new Set([row.id]));
  });

  it('cuts an attempt to the remaining budget, so no bet call runs past the 10 seconds', async () => {
    const clock = new ManualClock();
    const startedAt = clock.now().getTime();
    const hang = async (record: HubCallRecord): Promise<HubAnswer> => {
      clock.advance(record.timeoutMs ?? 0);
      return NO_ANSWER;
    };
    const rig = await open({
      clock,
      hub: {
        bet: [
          async () => {
            clock.advance(8_000);
            return BUSY;
          },
          hang,
        ],
      },
    });

    const outcome = await rig.play();

    expect(outcome).toMatchObject({ ok: false, error: 'busy' });
    expect(rig.hub.bets.map((record) => record.timeoutMs)).toEqual([BUDGET_MS, BUDGET_MS - 8_000 - 200]);
    expect(clock.now().getTime() - startedAt).toBe(BUDGET_MS);
    const row = await rig.onlyRow();
    expect(row).toMatchObject({ status: 'bet_pending', bet_sends: 2, bet_busy_answers: 1, attempts: 1 });
    expect(row.next_attempt_at).toEqual(new Date(startedAt + BUDGET_MS + FIRST_SWEEP_PAUSE_MS));
  });

  it('keeps the round not due until its win call has ended when the bet was accepted at 7 seconds', async () => {
    const clock = new ManualClock();
    const startedAt = clock.now().getTime();
    const observed: { dueAt?: Date | null; claimedDuringWin?: number } = {};
    const rig: Rig = await open({
      clock,
      hub: {
        bet: [
          async () => {
            clock.advance(7_000);
            return accepted();
          },
        ],
        win: [
          async () => {
            observed.dueAt = (await rig.onlyRow()).next_attempt_at;
            clock.advance(10_000);
            observed.claimedDuringWin = await rig.sweeper.runOnce();
            return accepted();
          },
        ],
      },
    });

    const outcome = await rig.play();

    expect(outcome).toMatchObject({ ok: true });
    expect(observed.dueAt).toEqual(new Date(startedAt + 7_000 + LEASE_MS));
    expect(observed.claimedDuringWin).toBe(0);
    expect(rig.hub.wins).toHaveLength(1);
    expect(await rig.onlyRow()).toMatchObject({ status: 'settled' });
  });

  it('moves the due time of a new round to the lease before the first bet call', async () => {
    const clock = new ManualClock();
    const startedAt = clock.now().getTime();
    const observed: { dueAt?: Date | null; claimedBeforeLease?: number } = {};
    const rig: Rig = await open({
      clock,
      hub: {
        bet: [
          async () => {
            observed.dueAt = (await rig.onlyRow()).next_attempt_at;
            clock.advance(LEASE_MS - 1);
            observed.claimedBeforeLease = await rig.sweeper.runOnce();
            return accepted();
          },
        ],
      },
    });

    await rig.play();

    expect(observed.dueAt).toEqual(new Date(startedAt + LEASE_MS));
    expect(observed.claimedBeforeLease).toBe(0);
    expect(rig.hub.bets).toHaveLength(1);
  });
});

describe('a key that finds the round bet_pending', () => {
  const NO_ANSWER_AFTER_TIMEOUT = async (record: HubCallRecord, clock: ManualClock): Promise<HubAnswer> => {
    clock.advance(record.timeoutMs ?? 0);
    return NO_ANSWER;
  };

  async function openWithUnansweredFirstBet(): Promise<{ rig: Rig; clock: ManualClock; key: string }> {
    const clock = new ManualClock();
    const rig = await open({ clock, hub: { bet: [(record) => NO_ANSWER_AFTER_TIMEOUT(record, clock), accepted()] } });
    const key = freshKey();
    const first = await rig.play(key);
    expect(first).toMatchObject({ ok: false, error: 'busy' });
    expect(rig.hub.bets).toHaveLength(1);
    return { rig, clock, key };
  }

  it('makes the call itself when the lease is free, and answers the round marked as a replay', async () => {
    const { rig, clock, key } = await openWithUnansweredFirstBet();
    clock.advance(FIRST_SWEEP_PAUSE_MS);
    const sleepsBefore = clock.sleeps.length;

    const again = await rig.play(key);

    expect(again).toMatchObject({ ok: true, replay: true });
    expect(rig.hub.bets).toHaveLength(2);
    expect(rig.hub.bets[1].call.roundId).toBe(rig.hub.bets[0].call.roundId);
    expect(clock.sleeps).toHaveLength(sleepsBefore);
  });

  it('waits out the pause of the last attempt, inside the budget, and then makes the call itself', async () => {
    const { rig, clock, key } = await openWithUnansweredFirstBet();

    const again = await rig.play(key);

    expect(again).toMatchObject({ ok: true, replay: true });
    expect(clock.sleeps.filter((ms) => ms === POLL_MS).length).toBeGreaterThan(0);
    expect(rig.hub.bets).toHaveLength(2);
  });

  it('answers busy, and calls the hub not at all, when the pause outlasts the budget', async () => {
    const clock = new ManualClock();
    const rig = await open({ clock, hub: { bet: [INTERNAL] } });
    const key = freshKey();
    await rig.play(key);
    for (let attempt = 0; attempt < 3; attempt += 1) {
      clock.advanceTo((await rig.onlyRow()).next_attempt_at!);
      await rig.sweeper.runOnce();
    }
    const sent = rig.hub.bets.length;

    const again = await rig.play(key);

    expect(again).toMatchObject({ ok: false, error: 'busy' });
    expect(rig.hub.bets).toHaveLength(sent);
  });

  it('with the lease held by another caller waits for its outcome and never makes a second concurrent call', async () => {
    const gate = deferred<HubAnswer>();
    const rig = await open({
      clock: systemClock,
      retry: { budgetMs: 1_500, leaseMs: 4_000, alertAfterAttempts: 5 },
      hub: { bet: [() => gate.promise] },
    });
    const key = freshKey();
    const holder = rig.play(key);
    await vi.waitFor(() => expect(rig.hub.bets).toHaveLength(1));

    const waiter = rig.play(key);
    await new Promise((done) => setTimeout(done, 300));
    expect(rig.hub.bets).toHaveLength(1);
    gate.resolve(accepted());
    const [held, waited] = await Promise.all([holder, waiter]);

    expect(held).toMatchObject({ ok: true });
    expect(waited).toMatchObject({ ok: true, replay: true, roundId: (held as { roundId: string }).roundId });
    expect(rig.hub.bets).toHaveLength(1);
  });

  it('answers busy when the holder gives no outcome within the budget, still with one call only', async () => {
    const gate = deferred<HubAnswer>();
    const rig = await open({
      clock: systemClock,
      retry: { budgetMs: 500, leaseMs: 4_000, alertAfterAttempts: 5 },
      hub: { bet: [() => gate.promise] },
    });
    const key = freshKey();
    const holder = rig.play(key);
    await vi.waitFor(() => expect(rig.hub.bets).toHaveLength(1));

    const waited = await rig.play(key);
    gate.resolve(accepted());

    expect(waited).toMatchObject({ ok: false, error: 'busy' });
    expect(rig.hub.bets).toHaveLength(1);
    expect(await holder).toMatchObject({ ok: true });
  });
});

describe('two requests that carry one new key at once', () => {
  it('make one round and one bet call: the one that lost the insert waits for the one that won it', async () => {
    const rig = await open({ clock: systemClock });
    const { pool } = rig.database;
    const barrier = deferred<void>();
    let findsAsked = 0;
    const gatedDb = {
      query: async (text: string, values?: unknown[]) => {
        if (!text.includes('WHERE token = $1 AND spin_key = $2')) {
          return pool.query(text, values);
        }
        findsAsked += 1;
        if (findsAsked === 2) {
          barrier.resolve();
        }
        const found = await pool.query(text, values);
        await barrier.promise;
        return found;
      },
    } as unknown as Database;
    const spins = createSpinService({
      db: gatedDb,
      hub: rig.hub,
      deal: () => ({ totalWin: 0 }),
      logger: rig.logger,
      clock: systemClock,
      retry: RIG_RETRY,
    });
    const command: SpinCommand = { token: RIG_TOKEN, game: SPIN_GAME, key: freshKey(), betCents: SPIN_BET_CENTS };

    const [first, second] = await Promise.all([spins.play(command), spins.play(command)]);

    expect([first, second]).toEqual([expect.objectContaining({ ok: true }), expect.objectContaining({ ok: true })]);
    expect(new Set([first, second].map((outcome) => (outcome as { roundId: string }).roundId)).size).toBe(1);
    expect([first, second].filter((outcome) => (outcome as { replay?: true }).replay === true)).toHaveLength(1);
    expect(rig.hub.bets).toHaveLength(1);
    expect(await rig.rows()).toHaveLength(1);
  });
});

describe('a win that is not credited at once', () => {
  it('answers the outcome marked creditPending, keeps the round win_pending, and a repeated key does not credit again', async () => {
    const rig = await open({ hub: { win: [BUSY] } });
    const key = freshKey();
    const startedAt = rig.clock.now().getTime();

    const first = await rig.play(key);
    const again = await rig.play(key);

    expect(first).toMatchObject({ ok: true, creditPending: true, winCents: RIG_WIN_CENTS });
    expect(again).toMatchObject({ ok: true, creditPending: true, replay: true });
    expect(rig.hub.wins).toHaveLength(1);
    const row = await rig.onlyRow();
    expect(row).toMatchObject({ status: 'win_pending', attempts: 1, last_error: 'BUSY' });
    expect(row.next_attempt_at).toEqual(new Date(startedAt + FIRST_SWEEP_PAUSE_MS));
    expect(rig.logger.warn).toHaveBeenCalledWith(expect.objectContaining({ roundId: row.id }), 'win_not_credited');
  });

  it.each([
    ['INSUFFICIENT_FUNDS', refused('INSUFFICIENT_FUNDS')],
    ['SESSION_NOT_FOUND', refused('SESSION_NOT_FOUND')],
    ['REFUSED', refused('REFUSED')],
    ['a 403', rejected(403)],
    ['no answer', NO_ANSWER],
    ['INTERNAL', INTERNAL],
  ])('keeps the round win_pending when the win is answered %s', async (_name, answer) => {
    const rig = await open({ hub: { win: [answer] } });

    const outcome = await rig.play();

    expect(outcome).toMatchObject({ ok: true, creditPending: true });
    expect(await rig.onlyRow()).toMatchObject({ status: 'win_pending', attempts: 1 });
  });

  it.each([
    ['CONFLICT', refused('CONFLICT')],
    ['BAD_REQUEST', refused('BAD_REQUEST')],
  ])('parks the round when the win is answered %s, and a repeated key answers it marked creditPending', async (code, answer) => {
    const rig = await open({ hub: { win: [answer] } });
    const key = freshKey();

    const first = await rig.play(key);
    const again = await rig.play(key);

    expect(first).toMatchObject({ ok: true, creditPending: true });
    expect(again).toMatchObject({ ok: true, creditPending: true, replay: true });
    expect(await rig.onlyRow()).toMatchObject({ status: 'parked', last_error: code, next_attempt_at: null });
    expect(rig.hub.wins).toHaveLength(1);
  });

  it('sends the win with the round token, as the one call of the request', async () => {
    const rig = await open();

    await rig.play();

    expect(rig.hub.wins).toHaveLength(1);
    expect(rig.hub.wins[0].call).toMatchObject({ token: RIG_TOKEN, amountCents: RIG_WIN_CENTS, roundClose: true });
  });
});

describe('the unfinished bets of the stub hub tokens, through the application', () => {
  it('repeats a bet answered BUSY after the lock wait inside the same request and answers the outcome', async () => {
    const stack = await startStack({ HUB_CALL_TIMEOUT_MS: SCALED_CALL_TIMEOUT_MS }, { stub: { busyWaitMs: SCALED_LOCK_WAIT_MS } });
    stacks.push(stack);
    const startedAt = Date.now();

    const answer = await postSpin(stack.app, 'tok-busy-once');

    expect(answer.statusCode).toBe(200);
    expect(answer.body.ok).toBe(true);
    expect(Date.now() - startedAt).toBeLessThan(Number(SCALED_CALL_TIMEOUT_MS));
    const bets = stack.stub.calls.filter((call) => call.leg === 'bet');
    expect(bets).toHaveLength(2);
    const transactionIds = bets.map((call) => (call.body as { transactionId: string }).transactionId);
    expect(transactionIds).toEqual(Array(2).fill(`${answer.body.roundId}:bet`));
    const { rows } = await stack.database.pool.query('select bet_sends, bet_busy_answers from rounds');
    expect(rows).toEqual([{ bet_sends: 2, bet_busy_answers: 1 }]);
  });

  it('reads the balance of a bet refused for lack of funds with the default call timeout', async () => {
    const stack = await startStack();
    stacks.push(stack);

    const answer = await postSpin(stack.app, 'tok-poor');

    expect(answer.body).toEqual({ ok: false, error: 'insufficient_funds', balanceCents: 5 });
  });

  it('repeats a win the stub hub answers BUSY with the same transaction id and the round token', async () => {
    const clock = new ManualClock();
    const stack = await startStack({}, { clock });
    stacks.push(stack);
    const { answer } = await spinUntilWin(stack.app, 'tok-win-busy', true);

    clock.advance(FIRST_SWEEP_PAUSE_MS);
    const claimed = await stack.app.sweeper.runOnce();

    expect(answer.body.creditPending).toBe(true);
    expect(claimed).toBe(1);
    const wins = stack.stub.calls.filter((call) => call.leg === 'win').map((call) => call.body as { token: string; transactionId: string });
    expect(wins).toEqual([
      { token: 'tok-win-busy', transactionId: `${answer.body.roundId}:win`, roundId: answer.body.roundId, amountCents: answer.body.winCents, roundClose: true },
      { token: 'tok-win-busy', transactionId: `${answer.body.roundId}:win`, roundId: answer.body.roundId, amountCents: answer.body.winCents, roundClose: true },
    ]);
  });

  it('keeps a bet that timed out once and is then answered 403 open, repeats it with one transaction id, and answers busy', async () => {
    const clock = new ManualClock();
    const stack = await startStack({ HUB_CALL_TIMEOUT_MS: SHORT_CALL_TIMEOUT_MS }, { clock });
    stacks.push(stack);
    const payload = spinPayload();
    const pending = async (): Promise<{ id: string; status: string; attempts: number; next_attempt_at: Date }> =>
      (await stack.database.pool.query('select id, status, attempts, next_attempt_at from rounds')).rows[0];

    const first = await postSpin(stack.app, 'tok-timeout-then-forbidden', payload);

    expect(first.body).toEqual({ ok: false, error: 'busy' });
    expect(await pending()).toMatchObject({ status: 'bet_pending', attempts: 1 });
    for (let attempt = 0; attempt < 5; attempt += 1) {
      clock.advanceTo((await pending()).next_attempt_at);
      expect(await stack.app.sweeper.runOnce()).toBe(1);
    }
    clock.advanceTo((await pending()).next_attempt_at);
    const again = await postSpin(stack.app, 'tok-timeout-then-forbidden', payload);

    expect(again.body).toEqual({ ok: false, error: 'busy' });
    const round = await pending();
    expect(round).toMatchObject({ status: 'bet_pending', attempts: 7 });
    const transactionIds = new Set(
      stack.stub.calls.filter((call) => call.leg === 'bet').map((call) => (call.body as { transactionId: string }).transactionId),
    );
    expect(transactionIds).toEqual(new Set([`${round.id}:bet`]));
  });
});
