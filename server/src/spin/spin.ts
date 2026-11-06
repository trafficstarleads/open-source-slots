import { randomUUID } from 'node:crypto';
import { laterBy, type Clock } from '../clock';
import type { Database } from '../db/pool';
import {
  acceptBet,
  claimRound,
  deferRound,
  findRound,
  findRoundById,
  parkWin,
  recordBetFailure,
  recordBetSend,
  refuseBet,
  ROUND_STATUS,
  saveRound,
  settleWin,
  type OwedStatus,
  type RoundRow,
} from '../db/rounds';
import { GAMES, type DealtRound, type GameSymbol } from '../games/registry';
import type { BetRefusal, HubAnswer, HubClient, HubLogger, RefusalCode } from '../hub/client';
import { winCents } from '../money';
import { nextRequestPause, pauseAfterAttempts, REQUEST_FIRST_PAUSE_MS } from './backoff';
import { outcomeOfRound, type SpinOutcome } from './outcome';

export interface SpinCommand {
  readonly token: string;
  readonly game: GameSymbol;
  readonly key: string;
  readonly betCents: number;
}

export interface SpinLogger extends HubLogger {
  readonly error: (fields: object, message: string) => void;
}

export interface RetrySettings {
  readonly budgetMs: number;
  readonly leaseMs: number;
  readonly alertAfterAttempts: number;
}

export interface SpinDependencies {
  readonly db: Database;
  readonly hub: HubClient;
  readonly deal: (game: GameSymbol) => DealtRound;
  readonly logger: SpinLogger;
  readonly clock: Clock;
  readonly retry: RetrySettings;
}

export interface SpinService {
  readonly play: (command: SpinCommand) => Promise<SpinOutcome>;
  readonly repeatLeg: (round: RoundRow) => Promise<void>;
}

type UnacceptedAnswer = Exclude<HubAnswer, { readonly kind: 'accepted' }>;

type BetStep =
  | { readonly kind: 'accepted'; readonly round: RoundRow }
  | { readonly kind: 'closed'; readonly round: RoundRow }
  | { readonly kind: 'failed'; readonly round: RoundRow; readonly error: string };

const REJECTION_CODES: Readonly<Record<number, BetRefusal>> = {
  401: 'UNAUTHORIZED',
  403: 'FORBIDDEN',
  404: 'NOT_FOUND',
};
const PARKING_CODES: ReadonlySet<RefusalCode> = new Set<RefusalCode>(['CONFLICT', 'BAD_REQUEST']);
const ALERT_EVENTS: Readonly<Record<OwedStatus, string>> = {
  [ROUND_STATUS.betPending]: 'bet_pending_alert',
  [ROUND_STATUS.winPending]: 'win_pending_alert',
};
const NO_ANSWER_LABEL = 'NO_ANSWER';
const WAIT_POLL_MS = 100;
const MIN_ATTEMPT_TIMEOUT_MS = 1;

function isBusyAnswer(answer: UnacceptedAnswer): boolean {
  return answer.kind === 'retry' && answer.code === 'BUSY';
}

function answerLabel(answer: UnacceptedAnswer): string {
  switch (answer.kind) {
    case 'refused':
    case 'retry':
      return answer.code;
    case 'rejected':
      return `HTTP_${answer.status}`;
    case 'no_answer':
      return NO_ANSWER_LABEL;
  }
}

export function createSpinService({ db, hub, deal, logger, clock, retry }: SpinDependencies): SpinService {
  const leaseEnd = (): Date => laterBy(clock.now(), retry.leaseMs);

  async function currentBalance(token: string): Promise<number | null> {
    const answer = await hub.balance(token);
    return answer.kind === 'accepted' ? answer.balanceCents : null;
  }

  function alertIfStuck(round: RoundRow, status: OwedStatus): void {
    if (round.status === status && round.attempts > retry.alertAfterAttempts) {
      logger.error({ roundId: round.id, attempts: round.attempts, lastError: round.lastError }, ALERT_EVENTS[status]);
    }
  }

  async function giveUpForNow(round: RoundRow, status: OwedStatus, error: string): Promise<RoundRow> {
    const dueAt = laterBy(clock.now(), pauseAfterAttempts(round.attempts + 1));
    const deferred = await deferRound(db, round.id, status, error, dueAt);
    alertIfStuck(deferred, status);
    return deferred;
  }

  async function creditWin(round: RoundRow): Promise<RoundRow> {
    if (round.status !== ROUND_STATUS.winPending) {
      return round;
    }
    const answer = await hub.win({
      token: round.token,
      roundId: round.id,
      amountCents: round.winCents,
      roundClose: true,
    });
    if (answer.kind === 'accepted') {
      return settleWin(db, round.id, answer.balanceCents);
    }
    if (answer.kind === 'refused' && PARKING_CODES.has(answer.code)) {
      return parkWin(db, round.id, answer.code);
    }
    logger.warn({ roundId: round.id, answer }, 'win_not_credited');
    return giveUpForNow(round, ROUND_STATUS.winPending, answerLabel(answer));
  }

  async function refuse(round: RoundRow, code: BetRefusal): Promise<RoundRow> {
    const balanceCents = code === 'INSUFFICIENT_FUNDS' ? await currentBalance(round.token) : null;
    return refuseBet(db, round.id, code, balanceCents);
  }

  async function failedBet(sent: RoundRow, answer: UnacceptedAnswer): Promise<BetStep> {
    const error = answerLabel(answer);
    return { kind: 'failed', round: await recordBetFailure(db, sent.id, isBusyAnswer(answer), error), error };
  }

  async function sendBet(round: RoundRow, timeoutMs: number): Promise<BetStep> {
    const sent = await recordBetSend(db, round.id, leaseEnd());
    if (sent.status !== ROUND_STATUS.betPending) {
      return { kind: 'closed', round: sent };
    }
    const answer = await hub.bet(
      { token: sent.token, roundId: sent.id, amountCents: sent.betCents, roundClose: sent.winCents === 0 },
      timeoutMs,
    );
    switch (answer.kind) {
      case 'accepted':
        return { kind: 'accepted', round: await acceptBet(db, sent.id, answer.balanceCents, leaseEnd()) };
      case 'refused':
        return { kind: 'closed', round: await refuse(sent, answer.code) };
      case 'rejected': {
        const nothingMovedBefore = sent.betSends - 1 === sent.betBusyAnswers;
        return nothingMovedBefore
          ? { kind: 'closed', round: await refuse(sent, REJECTION_CODES[answer.status]) }
          : failedBet(sent, answer);
      }
      case 'retry':
      case 'no_answer':
        return failedBet(sent, answer);
    }
  }

  async function betWithinBudget(round: RoundRow, startedAt: Date): Promise<RoundRow> {
    const deadline = startedAt.getTime() + retry.budgetMs;
    let current = round;
    let pauseMs = REQUEST_FIRST_PAUSE_MS;
    for (;;) {
      const remainingMs = deadline - clock.now().getTime();
      const step = await sendBet(current, Math.max(MIN_ATTEMPT_TIMEOUT_MS, Math.min(remainingMs, retry.budgetMs)));
      if (step.kind === 'accepted') {
        return creditWin(step.round);
      }
      if (step.kind === 'closed') {
        return step.round;
      }
      current = step.round;
      if (deadline - clock.now().getTime() <= pauseMs) {
        return giveUpForNow(current, ROUND_STATUS.betPending, step.error);
      }
      await clock.sleep(pauseMs);
      pauseMs = nextRequestPause(pauseMs);
    }
  }

  async function claimOrWait(round: RoundRow, startedAt: Date): Promise<RoundRow> {
    const deadline = startedAt.getTime() + retry.budgetMs;
    for (;;) {
      const claimed = await claimRound(db, round.id, clock.now(), leaseEnd());
      if (claimed !== null) {
        return betWithinBudget(claimed, startedAt);
      }
      const current = (await findRoundById(db, round.id)) ?? round;
      if (current.status !== ROUND_STATUS.betPending || deadline - clock.now().getTime() <= WAIT_POLL_MS) {
        return current;
      }
      await clock.sleep(WAIT_POLL_MS);
    }
  }

  async function answerRepeat(round: RoundRow, startedAt: Date): Promise<SpinOutcome> {
    if (round.status !== ROUND_STATUS.betPending) {
      return outcomeOfRound(round, true);
    }
    return outcomeOfRound(await claimOrWait(round, startedAt), true);
  }

  async function play(command: SpinCommand): Promise<SpinOutcome> {
    const startedAt = clock.now();
    const existing = await findRound(db, command.token, command.key);
    if (existing !== null) {
      return answerRepeat(existing, startedAt);
    }
    const dealt = deal(command.game);
    const id = randomUUID();
    const saved = await saveRound(db, {
      id,
      game: command.game,
      token: command.token,
      spinKey: command.key,
      betCents: command.betCents,
      result: dealt,
      winCents: winCents(command.betCents, dealt.totalWin, GAMES[command.game].lines),
      dueAt: leaseEnd(),
    });
    if (saved.id !== id) {
      return answerRepeat(saved, startedAt);
    }
    return outcomeOfRound(await betWithinBudget(saved, startedAt), false);
  }

  async function repeatLeg(round: RoundRow): Promise<void> {
    if (round.status === ROUND_STATUS.winPending) {
      await creditWin(round);
      return;
    }
    const step = await sendBet(round, retry.budgetMs);
    if (step.kind === 'accepted') {
      await creditWin(step.round);
    } else if (step.kind === 'failed') {
      await giveUpForNow(step.round, ROUND_STATUS.betPending, step.error);
    }
  }

  return { play, repeatLeg };
}
