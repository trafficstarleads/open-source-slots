import { laterBy, type Clock } from '../clock';
import { claimDueRounds, type RoundRow } from '../db/rounds';
import type { Database } from '../db/pool';
import type { SpinLogger, SpinService } from './spin';

export type SweepLogger = Pick<SpinLogger, 'error'>;

export interface SweeperDependencies {
  readonly db: Database;
  readonly spins: Pick<SpinService, 'repeatLeg'>;
  readonly clock: Clock;
  readonly leaseMs: number;
  readonly logger: SweepLogger;
}

export interface Sweeper {
  readonly runOnce: () => Promise<number>;
}

const SWEEP_BATCH_SIZE = 20;

export function createSweeper({ db, spins, clock, leaseMs, logger }: SweeperDependencies): Sweeper {
  async function repeatOne(round: RoundRow): Promise<void> {
    try {
      await spins.repeatLeg(round);
    } catch (error) {
      logger.error({ roundId: round.id, err: error }, 'sweep_round_failed');
    }
  }

  async function runOnce(): Promise<number> {
    const now = clock.now();
    const claimed = await claimDueRounds(db, now, laterBy(now, leaseMs), SWEEP_BATCH_SIZE);
    await Promise.all(claimed.map(repeatOne));
    return claimed.length;
  }

  return { runOnce };
}

export function startSweepLoop(sweeper: Sweeper, intervalMs: number, logger: SweepLogger): () => Promise<void> {
  let stopped = false;
  let timer: NodeJS.Timeout | undefined;
  let pass: Promise<void> = Promise.resolve();

  async function runPass(): Promise<void> {
    try {
      await sweeper.runOnce();
    } catch (error) {
      logger.error({ err: error }, 'sweep_pass_failed');
    }
  }

  function schedule(): void {
    timer = setTimeout(() => {
      pass = runPass().then(() => {
        if (!stopped) {
          schedule();
        }
      });
    }, intervalMs);
  }

  schedule();
  return async () => {
    stopped = true;
    clearTimeout(timer);
    await pass;
  };
}
