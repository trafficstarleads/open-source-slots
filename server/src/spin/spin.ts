import { randomUUID } from 'node:crypto';
import type { Database } from '../db/pool';
import {
  acceptBet,
  findRound,
  recordBetBusyAnswer,
  recordBetSend,
  refuseBet,
  ROUND_STATUS,
  saveRound,
  settleWin,
  type RoundRow,
} from '../db/rounds';
import { GAMES, type DealtRound, type GameSymbol } from '../games/registry';
import type { BetRefusal, HubAnswer, HubClient, HubLogger } from '../hub/client';
import { winCents } from '../money';
import { outcomeOfRound, type SpinOutcome } from './outcome';

export interface SpinCommand {
  readonly token: string;
  readonly game: GameSymbol;
  readonly key: string;
  readonly betCents: number;
}

export interface SpinDependencies {
  readonly db: Database;
  readonly hub: HubClient;
  readonly deal: (game: GameSymbol) => DealtRound;
  readonly logger: HubLogger;
}

export interface SpinService {
  readonly play: (command: SpinCommand) => Promise<SpinOutcome>;
}

const REJECTION_CODES: Readonly<Record<number, BetRefusal>> = {
  401: 'UNAUTHORIZED',
  403: 'FORBIDDEN',
  404: 'NOT_FOUND',
};

function isBusyAnswer(answer: HubAnswer): boolean {
  return answer.kind === 'retry' && answer.code === 'BUSY';
}

export function createSpinService({ db, hub, deal, logger }: SpinDependencies): SpinService {
  async function currentBalance(token: string): Promise<number | null> {
    const answer = await hub.balance(token);
    return answer.kind === 'accepted' ? answer.balanceCents : null;
  }

  async function creditWin(round: RoundRow, replay: boolean): Promise<SpinOutcome> {
    if (round.status !== ROUND_STATUS.winPending) {
      return outcomeOfRound(round, replay);
    }
    const answer = await hub.win({
      token: round.token,
      roundId: round.id,
      amountCents: round.winCents,
      roundClose: true,
    });
    if (answer.kind !== 'accepted') {
      logger.warn({ roundId: round.id, answer }, 'win_not_credited');
      return outcomeOfRound(round, replay);
    }
    return outcomeOfRound(await settleWin(db, round.id, answer.balanceCents), replay);
  }

  async function refuse(round: RoundRow, code: BetRefusal, replay: boolean): Promise<SpinOutcome> {
    const balanceCents = code === 'INSUFFICIENT_FUNDS' ? await currentBalance(round.token) : null;
    return outcomeOfRound(await refuseBet(db, round.id, code, balanceCents), replay);
  }

  async function unanswered(round: RoundRow, answer: HubAnswer, replay: boolean): Promise<SpinOutcome> {
    const current = isBusyAnswer(answer) ? await recordBetBusyAnswer(db, round.id) : round;
    return outcomeOfRound(current, replay);
  }

  async function afterBet(round: RoundRow, answer: HubAnswer, replay: boolean): Promise<SpinOutcome> {
    switch (answer.kind) {
      case 'accepted':
        return creditWin(await acceptBet(db, round.id, answer.balanceCents), replay);
      case 'refused':
        return refuse(round, answer.code, replay);
      case 'rejected': {
        const nothingMovedBefore = round.betSends - 1 === round.betBusyAnswers;
        return nothingMovedBefore
          ? refuse(round, REJECTION_CODES[answer.status], replay)
          : outcomeOfRound(round, replay);
      }
      case 'retry':
      case 'no_answer':
        return unanswered(round, answer, replay);
    }
  }

  async function placeBet(round: RoundRow, replay: boolean): Promise<SpinOutcome> {
    const sent = await recordBetSend(db, round.id);
    const answer = await hub.bet({
      token: sent.token,
      roundId: sent.id,
      amountCents: sent.betCents,
      roundClose: sent.winCents === 0,
    });
    return afterBet(sent, answer, replay);
  }

  async function resume(round: RoundRow): Promise<SpinOutcome> {
    return round.status === ROUND_STATUS.betPending ? placeBet(round, true) : outcomeOfRound(round, true);
  }

  async function play(command: SpinCommand): Promise<SpinOutcome> {
    const existing = await findRound(db, command.token, command.key);
    if (existing !== null) {
      return resume(existing);
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
    });
    return saved.id === id ? placeBet(saved, false) : resume(saved);
  }

  return { play };
}
