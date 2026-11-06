import type { RoundResult } from '../engine';
import { createWallet } from '../../../client-kit/src';

export {
  CREDIT_PENDING_LABEL,
  DEPOSIT_LABEL,
  fromCents,
  postDeposit,
  roundView,
  toCents,
  type Failure,
  type RoundView,
  type ServerRound,
} from '../../../client-kit/src';

export const GAME = 'samurai';

export const wallet = createWallet<RoundResult>(GAME);
