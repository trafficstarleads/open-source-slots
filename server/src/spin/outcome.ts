import { ROUND_STATUS, type RoundRow } from '../db/rounds';
import type { BetRefusal } from '../hub/client';
import type { BrowserErrorCode } from '../http/browserError';

export interface PlayedSpin {
  readonly ok: true;
  readonly roundId: string;
  readonly round: unknown;
  readonly winCents: number;
  readonly costCents: number;
  readonly balanceCents: number | undefined;
  readonly replay: true | undefined;
  readonly creditPending: true | undefined;
}

export interface FailedSpin {
  readonly ok: false;
  readonly error: BrowserErrorCode;
  readonly balanceCents: number | undefined;
}

export type SpinOutcome = PlayedSpin | FailedSpin;

const REFUSAL_ANSWERS: Readonly<Record<BetRefusal, BrowserErrorCode>> = {
  INSUFFICIENT_FUNDS: 'insufficient_funds',
  SESSION_NOT_FOUND: 'session_expired',
  UNAUTHORIZED: 'unavailable',
  FORBIDDEN: 'unavailable',
  NOT_FOUND: 'unavailable',
  LIMIT_EXCEEDED: 'bet_refused',
  REFUSED: 'bet_refused',
  CONFLICT: 'bet_refused',
  BAD_REQUEST: 'bet_refused',
};

function failedSpin(error: BrowserErrorCode, balanceCents?: number): FailedSpin {
  return { ok: false, error, balanceCents };
}

function playedSpin(round: RoundRow, replay: boolean): PlayedSpin {
  return {
    ok: true,
    roundId: round.id,
    round: round.result,
    winCents: round.winCents,
    costCents: round.betCents,
    balanceCents: round.balanceCents ?? undefined,
    replay: replay ? true : undefined,
    creditPending: round.status === ROUND_STATUS.settled ? undefined : true,
  };
}

export function outcomeOfRound(round: RoundRow, replay: boolean): SpinOutcome {
  switch (round.status) {
    case ROUND_STATUS.betPending:
      return failedSpin('busy');
    case ROUND_STATUS.refused:
      return failedSpin(REFUSAL_ANSWERS[round.refusalCode as BetRefusal], round.balanceCents ?? undefined);
    case ROUND_STATUS.settled:
    case ROUND_STATUS.winPending:
    case ROUND_STATUS.parked:
      return playedSpin(round, replay);
  }
}
