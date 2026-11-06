import { vi, type Mock } from 'vitest';
import type { Clock } from '../../src/clock';
import type { HubAnswer, HubClient, MoneyCall, RefusalCode } from '../../src/hub/client';
import type { SpinOutcome } from '../../src/spin/outcome';
import { createSpinService, type RetrySettings, type SpinService } from '../../src/spin/spin';
import { createSweeper, type Sweeper } from '../../src/spin/sweeper';
import { freshKey, SPIN_BET_CENTS, SPIN_GAME } from './app';
import { ManualClock } from './clock';
import { createTestDatabase, type TestDatabase } from './db';

export const RIG_TOKEN = 'tok-rig';
export const RIG_BALANCE_CENTS = 9_990;
export const RIG_WIN_UNITS = 2;
export const RIG_WIN_CENTS = SPIN_BET_CENTS * RIG_WIN_UNITS;
export const RIG_RETRY: RetrySettings = { budgetMs: 10_000, leaseMs: 12_000, alertAfterAttempts: 5 };

export const BUSY: HubAnswer = { kind: 'retry', code: 'BUSY' };
export const INTERNAL: HubAnswer = { kind: 'retry', code: 'INTERNAL' };
export const NO_ANSWER: HubAnswer = { kind: 'no_answer' };

export function accepted(balanceCents: number = RIG_BALANCE_CENTS): HubAnswer {
  return { kind: 'accepted', balanceCents };
}

export function refused(code: RefusalCode): HubAnswer {
  return { kind: 'refused', code };
}

export function rejected(status: number): HubAnswer {
  return { kind: 'rejected', status };
}

export interface HubCallRecord {
  readonly call: MoneyCall;
  readonly timeoutMs: number | undefined;
}

export type HubStep = HubAnswer | ((record: HubCallRecord, callNumber: number) => HubAnswer | Promise<HubAnswer>);

export interface HubScript {
  readonly bet?: readonly HubStep[];
  readonly win?: readonly HubStep[];
}

export interface ScriptedHub extends HubClient {
  readonly bets: HubCallRecord[];
  readonly wins: HubCallRecord[];
}

export interface RigLogger {
  readonly warn: Mock<(fields: object, message: string) => void>;
  readonly error: Mock<(fields: object, message: string) => void>;
}

export interface RoundSnapshot {
  readonly id: string;
  readonly status: string;
  readonly refusal_code: string | null;
  readonly win_cents: number;
  readonly bet_sends: number;
  readonly bet_busy_answers: number;
  readonly balance_cents: number | null;
  readonly attempts: number;
  readonly next_attempt_at: Date | null;
  readonly last_error: string | null;
}

export interface Rig {
  readonly database: TestDatabase;
  readonly hub: ScriptedHub;
  readonly spins: SpinService;
  readonly sweeper: Sweeper;
  readonly clock: Clock;
  readonly logger: RigLogger;
  readonly play: (key?: string) => Promise<SpinOutcome>;
  readonly rows: () => Promise<RoundSnapshot[]>;
  readonly onlyRow: () => Promise<RoundSnapshot>;
  readonly close: () => Promise<void>;
}

export interface RigOptions {
  readonly hub?: HubScript;
  readonly clock?: Clock;
  readonly retry?: RetrySettings;
  readonly totalWin?: number;
}

function stepAt(steps: readonly HubStep[], callNumber: number): HubStep {
  return steps[Math.min(callNumber, steps.length) - 1];
}

async function answerOf(
  steps: readonly HubStep[],
  record: HubCallRecord,
  callNumber: number,
): Promise<HubAnswer> {
  const step = stepAt(steps, callNumber);
  return typeof step === 'function' ? step(record, callNumber) : step;
}

export function scriptedHub(script: HubScript = {}): ScriptedHub {
  const bets: HubCallRecord[] = [];
  const wins: HubCallRecord[] = [];
  const betSteps = script.bet ?? [accepted()];
  const winSteps = script.win ?? [accepted()];
  return {
    bets,
    wins,
    balance: async () => accepted(),
    bet: async (call, timeoutMs) => {
      const record = { call, timeoutMs };
      bets.push(record);
      return answerOf(betSteps, record, bets.length);
    },
    win: async (call, timeoutMs) => {
      const record = { call, timeoutMs };
      wins.push(record);
      return answerOf(winSteps, record, wins.length);
    },
  };
}

export async function createRig(options: RigOptions = {}): Promise<Rig> {
  const database = await createTestDatabase();
  const hub = scriptedHub(options.hub);
  const clock = options.clock ?? new ManualClock();
  const retry = options.retry ?? RIG_RETRY;
  const logger: RigLogger = { warn: vi.fn(), error: vi.fn() };
  const totalWin = options.totalWin ?? RIG_WIN_UNITS;
  const spins = createSpinService({
    db: database.pool,
    hub,
    deal: () => ({ totalWin }),
    logger,
    clock,
    retry,
  });
  const sweeper = createSweeper({ db: database.pool, spins, clock, leaseMs: retry.leaseMs, logger });
  const rows = async (): Promise<RoundSnapshot[]> => {
    const { rows: found } = await database.pool.query<RoundSnapshot>('select * from rounds order by created_at, id');
    return found;
  };
  return {
    database,
    hub,
    spins,
    sweeper,
    clock,
    logger,
    play: (key: string = freshKey()) =>
      spins.play({ token: RIG_TOKEN, game: SPIN_GAME, key, betCents: SPIN_BET_CENTS }),
    rows,
    onlyRow: async () => {
      const [row] = await rows();
      return row;
    },
    close: () => database.close(),
  };
}

export async function runSweeperWhenDue(rig: Rig, clock: ManualClock): Promise<number> {
  const row = await rig.onlyRow();
  if (row.next_attempt_at !== null) {
    clock.advanceTo(row.next_attempt_at);
  }
  return rig.sweeper.runOnce();
}
