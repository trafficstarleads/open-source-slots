import type { RoundResult } from '../engine';
import { createWallet } from '../../../client-kit/src';

export {
  CREDIT_PENDING_LABEL,
  creditedShare,
  DEPOSIT_LABEL,
  fromCents,
  postDeposit,
  roundView,
  showFailure,
  toCents,
  type Failure,
  type RoundView,
  type ServerRound,
} from '../../../client-kit/src';

export const GAME = 'bumper-crop';

export const wallet = createWallet<RoundResult>(GAME);
