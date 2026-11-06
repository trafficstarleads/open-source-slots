import { randomUUID } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { startStubHub } from '../dev/stub-hub';
import { ConfigError, loadConfig } from '../src/config';
import { findRoundById, type RoundRow } from '../src/db/rounds';
import { start } from '../src/main';
import { createSweeper, startSweepLoop } from '../src/spin/sweeper';
import {
  freshKey,
  SPIN_BET_CENTS,
  SPIN_GAME,
  TEST_GAME_ORIGIN,
  TEST_HMAC_KEY,
  TEST_PARTNER,
  testEnv,
} from './helpers/app';
import { ManualClock } from './helpers/clock';
import { createTestDatabase } from './helpers/db';
import {
  accepted,
  BUSY,
  createRig,
  INTERNAL,
  NO_ANSWER,
  refused,
  rejected,
  RIG_RETRY,
  runSweeperWhenDue,
  type Rig,
  type RigOptions,
  type RoundSnapshot,
} from './helpers/rig';

const HUB_URL = 'http://127.0.0.1:9';
const BUDGET_MS = RIG_RETRY.budgetMs;
const HOUR_MS = 3_600_000;
const ALERT_AFTER = RIG_RETRY.alertAfterAttempts;
const SWEEP_PAUSES_MS = [5_000, 10_000, 20_000];
const LOOP_INTERVAL_MS = '50';

const rigs: Rig[] = [];
const closers: Array<() => Promise<void>> = [];

async function open(options: RigOptions = {}): Promise<Rig> {
  const rig = await createRig(options);
  rigs.push(rig);
  return rig;
}

afterEach(async () => {
  await Promise.all([...rigs.splice(0).map((rig) => rig.close()), ...closers.splice(0).map((close) => close())]);
});

interface PendingRound {
  readonly sends: number;
  readonly busy: number;
  readonly dueAt: Date;
}

async function insertPendingRound(rig: Rig, { sends, busy, dueAt }: PendingRound): Promise<string> {
  const id = randomUUID();
  await rig.database.pool.query(
    `insert into rounds (id, game, token, spin_key, bet_cents, result, win_cents, status, bet_sends, bet_busy_answers, next_attempt_at)
     values ($1, $2, 'tok-rig', $3, $4, '{"totalWin":2}', 20, 'bet_pending', $5, $6, $7)`,
    [id, SPIN_GAME, freshKey(), SPIN_BET_CENTS, sends, busy, dueAt],
  );
  return id;
}

async function row(rig: Rig, id: string): Promise<RoundSnapshot> {
  const { rows } = await rig.database.pool.query<RoundSnapshot>('select * from rounds where id = $1', [id]);
  return rows[0];
}

describe('the sweeper over a bet that the spin request could not finish', () => {
  it('answers busy after the budget, then completes the bet and sends the win once when the pause has passed', async () => {
    const clock = new ManualClock();
    const startedAt = clock.now().getTime();
    let hubDown = true;
    const rig = await open({ clock, hub: { bet: [async () => (hubDown ? INTERNAL : accepted())] } });

    const outcome = await rig.play();

    expect(outcome).toMatchObject({ ok: false, error: 'busy' });
    const elapsed = clock.now().getTime() - startedAt;
    expect(elapsed).toBeGreaterThanOrEqual(BUDGET_MS - 1_000);
    expect(elapsed).toBeLessThanOrEqual(BUDGET_MS);
    const waiting = await rig.onlyRow();
    expect(waiting).toMatchObject({ status: 'bet_pending', attempts: 1, last_error: 'INTERNAL' });
    expect(waiting.next_attempt_at).toEqual(new Date(clock.now().getTime() + SWEEP_PAUSES_MS[0]));
    expect(await rig.sweeper.runOnce()).toBe(0);
    clock.advanceTo(new Date(waiting.next_attempt_at!.getTime() - 1));
    expect(await rig.sweeper.runOnce()).toBe(0);
    expect(rig.hub.wins).toHaveLength(0);

    hubDown = false;
    clock.advanceTo(waiting.next_attempt_at!);
    expect(await rig.sweeper.runOnce()).toBe(1);

    expect(await rig.onlyRow()).toMatchObject({ status: 'settled', attempts: 0, balance_cents: 9_990 });
    expect(rig.hub.wins).toHaveLength(1);
    expect(rig.hub.wins[0].call.roundId).toBe(waiting.id);
    expect(new Set(rig.hub.bets.map((record) => record.call.roundId))).toEqual(new Set([waiting.id]));
    expect(await rig.sweeper.runOnce()).toBe(0);
  });

  it('asks the hub with the call timeout of one attempt, not with what is left of a request budget', async () => {
    const clock = new ManualClock();
    const rig = await open({ clock });
    await insertPendingRound(rig, { sends: 0, busy: 0, dueAt: clock.now() });

    await rig.sweeper.runOnce();

    expect(rig.hub.bets.map((record) => record.timeoutMs)).toEqual([BUDGET_MS]);
  });

  it('ends a round whose bet the hub now refuses for good, and never repeats it', async () => {
    const clock = new ManualClock();
    const rig = await open({ clock, hub: { bet: [refused('SESSION_NOT_FOUND')] } });
    const id = await insertPendingRound(rig, { sends: 1, busy: 1, dueAt: clock.now() });

    await rig.sweeper.runOnce();
    clock.advance(HOUR_MS);
    await rig.sweeper.runOnce();

    expect(await row(rig, id)).toMatchObject({ status: 'refused', refusal_code: 'SESSION_NOT_FOUND', next_attempt_at: null });
    expect(rig.hub.bets).toHaveLength(1);
  });

  it('does not end a round with a 403 when an earlier send was never answered, as after a stopped process', async () => {
    const clock = new ManualClock();
    const rig = await open({ clock, hub: { bet: [rejected(403)] } });
    const id = await insertPendingRound(rig, { sends: 1, busy: 0, dueAt: clock.now() });

    await rig.sweeper.runOnce();

    expect(await row(rig, id)).toMatchObject({ status: 'bet_pending', bet_sends: 2, attempts: 1, last_error: 'HTTP_403' });
  });

  it('ends a round with a 403 when every earlier send was answered BUSY', async () => {
    const clock = new ManualClock();
    const rig = await open({ clock, hub: { bet: [rejected(403)] } });
    const id = await insertPendingRound(rig, { sends: 1, busy: 1, dueAt: clock.now() });

    await rig.sweeper.runOnce();

    expect(await row(rig, id)).toMatchObject({ status: 'refused', refusal_code: 'FORBIDDEN', bet_sends: 2 });
  });
});

describe('the sweeper over a win that is owed', () => {
  it('repeats the win with the same round, the round token and growing pauses of 5, 10 and 20 seconds', async () => {
    const clock = new ManualClock();
    const rig = await open({ clock, hub: { win: [BUSY] } });
    await rig.play();
    const pauses: number[] = [];

    for (let attempt = 0; attempt < SWEEP_PAUSES_MS.length; attempt += 1) {
      const waiting = await rig.onlyRow();
      pauses.push(waiting.next_attempt_at!.getTime() - clock.now().getTime());
      expect(await rig.sweeper.runOnce()).toBe(0);
      expect(await runSweeperWhenDue(rig, clock)).toBe(1);
    }

    expect(pauses).toEqual(SWEEP_PAUSES_MS);
    const { id } = await rig.onlyRow();
    expect(rig.hub.wins).toHaveLength(SWEEP_PAUSES_MS.length + 1);
    expect(new Set(rig.hub.wins.map((record) => record.call.roundId))).toEqual(new Set([id]));
    expect(new Set(rig.hub.wins.map((record) => record.call.token))).toEqual(new Set(['tok-rig']));
  });

  it('settles the round when the repeated win is accepted, and repeats nothing after that', async () => {
    const clock = new ManualClock();
    const rig = await open({ clock, hub: { win: [BUSY, accepted(4_242)] } });
    await rig.play();

    expect(await runSweeperWhenDue(rig, clock)).toBe(1);

    expect(await rig.onlyRow()).toMatchObject({ status: 'settled', balance_cents: 4_242, attempts: 1, next_attempt_at: null });
    clock.advance(HOUR_MS);
    expect(await rig.sweeper.runOnce()).toBe(0);
    expect(rig.hub.wins).toHaveLength(2);
  });

  it.each([
    ['INSUFFICIENT_FUNDS', refused('INSUFFICIENT_FUNDS')],
    ['SESSION_NOT_FOUND', refused('SESSION_NOT_FOUND')],
  ])('keeps repeating a win answered %s until it is accepted', async (_name, answer) => {
    const clock = new ManualClock();
    const rig = await open({ clock, hub: { win: [answer, answer, accepted()] } });
    await rig.play();

    await runSweeperWhenDue(rig, clock);
    expect(await rig.onlyRow()).toMatchObject({ status: 'win_pending', attempts: 2 });
    await runSweeperWhenDue(rig, clock);

    expect(await rig.onlyRow()).toMatchObject({ status: 'settled' });
    expect(rig.hub.wins).toHaveLength(3);
  });

  it.each([
    ['CONFLICT', refused('CONFLICT')],
    ['BAD_REQUEST', refused('BAD_REQUEST')],
  ])('parks a round whose repeated win is answered %s, and does not repeat it', async (code, answer) => {
    const clock = new ManualClock();
    const rig = await open({ clock, hub: { win: [BUSY, answer] } });
    await rig.play();

    await runSweeperWhenDue(rig, clock);
    clock.advance(2 * HOUR_MS);
    const claimedLater = await rig.sweeper.runOnce();

    expect(await rig.onlyRow()).toMatchObject({ status: 'parked', last_error: code, next_attempt_at: null });
    expect(claimedLater).toBe(0);
    expect(rig.hub.wins).toHaveLength(2);
  });

  it('writes the outcome of a claimed win only while the round is still win_pending', async () => {
    const clock = new ManualClock();
    const settledMeanwhile = 4_242;
    const rig: Rig = await open({
      clock,
      hub: {
        win: [
          BUSY,
          async () => {
            await rig.database.pool.query("update rounds set status = 'settled', balance_cents = $1", [settledMeanwhile]);
            return accepted();
          },
        ],
      },
    });
    await rig.play();

    await runSweeperWhenDue(rig, clock);

    expect(await rig.onlyRow()).toMatchObject({ status: 'settled', balance_cents: settledMeanwhile });
  });
});

describe('the alert of a leg that keeps failing', () => {
  function alertsOf(rig: Rig): unknown[][] {
    return rig.logger.error.mock.calls.filter(([, message]) => message === 'bet_pending_alert' || message === 'win_pending_alert');
  }

  it.each([
    ['bet', 'bet_pending_alert', { bet: [INTERNAL] }],
    ['win', 'win_pending_alert', { win: [BUSY] }],
  ])('logs %s alert from the sixth failed attempt on, once per attempt, and not at the fifth', async (_leg, event, hub) => {
    const clock = new ManualClock();
    const rig = await open({ clock, hub });
    await rig.play();

    for (let attempt = 2; attempt <= ALERT_AFTER; attempt += 1) {
      await runSweeperWhenDue(rig, clock);
    }
    expect(await rig.onlyRow()).toMatchObject({ attempts: ALERT_AFTER });
    expect(alertsOf(rig)).toHaveLength(0);

    await runSweeperWhenDue(rig, clock);
    const sixth = await rig.onlyRow();
    expect(alertsOf(rig)).toHaveLength(1);
    expect(rig.logger.error).toHaveBeenLastCalledWith(
      expect.objectContaining({ roundId: sixth.id, attempts: ALERT_AFTER + 1 }),
      event,
    );
    await runSweeperWhenDue(rig, clock);
    expect(alertsOf(rig)).toHaveLength(2);
  });

  it('logs the alert for a bet answered 403 after a send that was never answered, and keeps repeating the bet', async () => {
    const clock = new ManualClock();
    const rig = await open({ clock, hub: { bet: [NO_ANSWER, rejected(403)] } });

    const outcome = await rig.play();
    for (let attempt = 2; attempt <= ALERT_AFTER + 1; attempt += 1) {
      await runSweeperWhenDue(rig, clock);
    }

    expect(outcome).toMatchObject({ ok: false, error: 'busy' });
    const waiting = await rig.onlyRow();
    expect(waiting).toMatchObject({ status: 'bet_pending', attempts: ALERT_AFTER + 1, last_error: 'HTTP_403' });
    expect(alertsOf(rig)).toHaveLength(1);
    expect(rig.logger.error).toHaveBeenLastCalledWith(expect.objectContaining({ roundId: waiting.id }), 'bet_pending_alert');
    expect(new Set(rig.hub.bets.map((record) => record.call.roundId))).toEqual(new Set([waiting.id]));
  });

  it('logs no alert for a leg that is answered at once', async () => {
    const rig = await open();

    await rig.play();

    expect(rig.logger.error).not.toHaveBeenCalled();
  });
});

describe('two callers over one due round', () => {
  const PAUSE_IN_CALL_MS = 40;

  it('make one hub call when two sweepers run at once', async () => {
    const clock = new ManualClock();
    const rig = await open({
      clock,
      hub: {
        bet: [
          async () => {
            await new Promise((done) => setTimeout(done, PAUSE_IN_CALL_MS));
            return accepted();
          },
        ],
      },
    });
    const second = createSweeper({
      db: rig.database.pool,
      spins: rig.spins,
      clock,
      leaseMs: RIG_RETRY.leaseMs,
      logger: rig.logger,
    });
    const ids = await Promise.all(
      Array.from({ length: 5 }, () => insertPendingRound(rig, { sends: 0, busy: 0, dueAt: clock.now() })),
    );

    const claimed = await Promise.all([rig.sweeper.runOnce(), second.runOnce()]);

    expect(claimed.reduce((total, count) => total + count, 0)).toBe(ids.length);
    expect(rig.hub.bets).toHaveLength(ids.length);
    expect(new Set(rig.hub.bets.map((record) => record.call.roundId))).toEqual(new Set(ids));
  });

  it('keep the pool free while the hub call waits: the call runs outside any transaction', async () => {
    const clock = new ManualClock();
    const observed: { busyConnections?: number; waiting?: number } = {};
    const rig: Rig = await open({
      clock,
      hub: {
        bet: [
          async () => {
            const { pool } = rig.database;
            observed.busyConnections = pool.totalCount - pool.idleCount;
            observed.waiting = pool.waitingCount;
            return accepted();
          },
        ],
      },
    });
    await insertPendingRound(rig, { sends: 0, busy: 0, dueAt: clock.now() });

    await rig.sweeper.runOnce();

    expect(observed).toEqual({ busyConnections: 0, waiting: 0 });
  });

  it('writes the outcome of a claimed bet only while the round is still bet_pending', async () => {
    const clock = new ManualClock();
    const settledMeanwhile = 777;
    const rig: Rig = await open({
      clock,
      hub: {
        bet: [
          async () => {
            await rig.database.pool.query(
              "update rounds set status = 'settled', win_cents = 0, balance_cents = $1",
              [settledMeanwhile],
            );
            return accepted();
          },
        ],
      },
    });
    const id = await insertPendingRound(rig, { sends: 0, busy: 0, dueAt: clock.now() });

    await rig.sweeper.runOnce();

    expect(await row(rig, id)).toMatchObject({ status: 'settled', balance_cents: settledMeanwhile, win_cents: 0 });
    expect(rig.hub.wins).toHaveLength(0);
  });

  it('make no hub call for a round that settled between the claim and the send', async () => {
    const clock = new ManualClock();
    const rig = await open({ clock });
    const id = await insertPendingRound(rig, { sends: 0, busy: 0, dueAt: clock.now() });
    const claimed = (await findRoundById(rig.database.pool, id)) as RoundRow;
    await rig.database.pool.query("update rounds set status = 'settled', win_cents = 0 where id = $1", [id]);

    await rig.spins.repeatLeg(claimed);

    expect(rig.hub.bets).toHaveLength(0);
    expect(await row(rig, id)).toMatchObject({ status: 'settled', bet_sends: 0 });
  });

  it.each([
    ['settled', null],
    ['refused', 'REFUSED'],
    ['parked', null],
  ])('claim no round that is %s, however old its due time', async (status, refusalCode) => {
    const clock = new ManualClock();
    const rig = await open({ clock });
    const id = await insertPendingRound(rig, { sends: 0, busy: 0, dueAt: new Date(clock.now().getTime() - HOUR_MS) });
    await rig.database.pool.query('update rounds set status = $2, refusal_code = $3 where id = $1', [id, status, refusalCode]);

    expect(await rig.sweeper.runOnce()).toBe(0);
    expect(rig.hub.bets).toHaveLength(0);
    expect(rig.hub.wins).toHaveLength(0);
  });
});

describe('a round that fails inside a pass of the sweeper', () => {
  it('is logged, and the other due rounds are still repeated', async () => {
    const clock = new ManualClock();
    const rig = await open({ clock });
    const first = await insertPendingRound(rig, { sends: 0, busy: 0, dueAt: new Date(clock.now().getTime() - 1_000) });
    const second = await insertPendingRound(rig, { sends: 0, busy: 0, dueAt: clock.now() });
    const failing = {
      play: rig.spins.play,
      repeatLeg: vi.fn(async (round: RoundRow) => {
        if (round.id === first) {
          throw new Error('database went away');
        }
        await rig.spins.repeatLeg(round);
      }),
    };
    const sweeper = createSweeper({ db: rig.database.pool, spins: failing, clock, leaseMs: RIG_RETRY.leaseMs, logger: rig.logger });

    expect(await sweeper.runOnce()).toBe(2);

    expect(rig.logger.error).toHaveBeenCalledWith(
      expect.objectContaining({ roundId: first, err: expect.any(Error) }),
      'sweep_round_failed',
    );
    expect((await row(rig, second)).status).toBe('settled');
  });
});

describe('the sweep loop', () => {
  it('logs a failed pass and runs the next one', async () => {
    const runOnce = vi.fn<() => Promise<number>>().mockRejectedValueOnce(new Error('db down')).mockResolvedValue(0);
    const logger = { error: vi.fn() };

    const stop = startSweepLoop({ runOnce }, 10, logger);
    await vi.waitFor(() => expect(runOnce.mock.calls.length).toBeGreaterThan(2));
    await stop();

    expect(logger.error).toHaveBeenCalledTimes(1);
    expect(logger.error).toHaveBeenCalledWith(expect.objectContaining({ err: expect.any(Error) }), 'sweep_pass_failed');
  });

  it('stops for good, and waits for the pass under way, when it is stopped', async () => {
    let finishPass: () => void = () => undefined;
    const runOnce = vi.fn<() => Promise<number>>(
      () =>
        new Promise<number>((done) => {
          finishPass = () => done(0);
        }),
    );
    const stop = startSweepLoop({ runOnce }, 10, { error: vi.fn() });
    await vi.waitFor(() => expect(runOnce).toHaveBeenCalledTimes(1));

    let stopped = false;
    const stopping = stop().then(() => {
      stopped = true;
    });
    await new Promise((done) => setTimeout(done, 50));
    expect(stopped).toBe(false);
    finishPass();
    await stopping;
    await new Promise((done) => setTimeout(done, 50));

    expect(runOnce).toHaveBeenCalledTimes(1);
  });

  it('is started by the application: it repeats a due round on its own and stops with the application', async () => {
    const stub = await startStubHub({ partner: TEST_PARTNER, secretKey: TEST_HMAC_KEY, port: 0, gameOrigin: TEST_GAME_ORIGIN });
    const database = await createTestDatabase();
    closers.push(stub.close, database.close);
    const insertDue = async (): Promise<string> => {
      const id = randomUUID();
      await database.pool.query(
        `insert into rounds (id, game, token, spin_key, bet_cents, result, win_cents, status, next_attempt_at)
         values ($1, $2, 'tok-rich', $3, $4, '{"totalWin":0}', 0, 'bet_pending', now() - interval '1 second')`,
        [id, SPIN_GAME, freshKey(), SPIN_BET_CENTS],
      );
      return id;
    };
    const statusOf = async (id: string): Promise<string> =>
      (await database.pool.query('select status from rounds where id = $1', [id])).rows[0].status;
    const app = await start(testEnv(stub.url, { DATABASE_URL: database.url, SWEEP_INTERVAL_MS: LOOP_INTERVAL_MS }));
    const dueBeforeStop = await insertDue();

    await vi.waitFor(async () => expect(await statusOf(dueBeforeStop)).toBe('settled'));
    await app.close();
    const dueAfterStop = await insertDue();
    await new Promise((done) => setTimeout(done, 4 * Number(LOOP_INTERVAL_MS)));

    expect(await statusOf(dueAfterStop)).toBe('bet_pending');
    expect(stub.calls.filter((call) => call.leg === 'bet')).toHaveLength(1);
  });
});

describe('the settings of the sweeper', () => {
  const callTimeoutMs = 10_000;

  it('takes a lease of the call timeout plus a margin, a one second interval and an alert after five attempts', () => {
    const config = loadConfig(testEnv(HUB_URL));

    expect(config.sweep).toEqual({ leaseMs: callTimeoutMs + 2_000, intervalMs: 1_000, alertAfterAttempts: 5 });
    expect(Object.isFrozen(config.sweep)).toBe(true);
  });

  it('derives the default lease from the call timeout that is set', () => {
    expect(loadConfig(testEnv(HUB_URL, { HUB_CALL_TIMEOUT_MS: '2500' })).sweep.leaseMs).toBe(4_500);
  });

  it('reads the lease, the interval and the alert threshold from the environment', () => {
    const config = loadConfig(
      testEnv(HUB_URL, { SWEEP_LEASE_MS: '30000', SWEEP_INTERVAL_MS: '250', ALERT_AFTER_ATTEMPTS: '0' }),
    );

    expect(config.sweep).toEqual({ leaseMs: 30_000, intervalMs: 250, alertAfterAttempts: 0 });
  });

  it.each(['10000', '9999', '1'])('refuses a lease of %s ms that is not larger than the call timeout', (lease) => {
    const env = testEnv(HUB_URL, { SWEEP_LEASE_MS: lease });

    expect(() => loadConfig(env)).toThrow(ConfigError);
    expect(() => loadConfig(env)).toThrow('SWEEP_LEASE_MS');
  });

  it('refuses to start when the lease is not larger than the call timeout', async () => {
    await expect(start(testEnv(HUB_URL, { SWEEP_LEASE_MS: '10000' }))).rejects.toThrow('SWEEP_LEASE_MS');
  });

  it.each([
    ['SWEEP_INTERVAL_MS', '0'],
    ['SWEEP_INTERVAL_MS', 'soon'],
    ['SWEEP_LEASE_MS', '1.5'],
    ['ALERT_AFTER_ATTEMPTS', '-1'],
    ['ALERT_AFTER_ATTEMPTS', 'five'],
  ])('refuses %s of %s', (name, value) => {
    expect(() => loadConfig(testEnv(HUB_URL, { [name]: value }))).toThrow(name);
  });
});
