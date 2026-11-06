import type { RoundResult } from '../engine';
import { createWallet } from '../../../client-kit/src';

export {
  CREDIT_PENDING_LABEL,
  creditedShare,
  DEPOSIT_LABEL,
  fromCents,
  postDeposit,
  roundView,
  toCents,
  type Failure,
  type RoundView,
  type ServerRound,
} from '../../../client-kit/src';

export const GAME = 'discovery-voyage';

export const wallet = createWallet<RoundResult>(GAME);
