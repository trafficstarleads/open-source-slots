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
} from '../../../client-kit/src';

export const GAME = 'scorching-hot';

export const wallet = createWallet<RoundResult>(GAME);
