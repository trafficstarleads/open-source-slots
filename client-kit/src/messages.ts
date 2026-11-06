export const SERVER_ERROR_CODES = [
  'session_expired',
  'insufficient_funds',
  'bet_refused',
  'bad_request',
  'busy',
  'unavailable',
] as const;

export type ServerErrorCode = (typeof SERVER_ERROR_CODES)[number];

export type FailureCode = ServerErrorCode | 'connection_lost';

export const FAILURE_MESSAGES: Readonly<Record<FailureCode, string>> = {
  session_expired: 'SESSION EXPIRED. REOPEN THE GAME.',
  insufficient_funds: 'NOT ENOUGH FUNDS',
  bet_refused: 'THIS BET WAS NOT ACCEPTED. NOTHING WAS CHARGED.',
  bad_request: 'THE GAME IS NOT AVAILABLE NOW. TRY LATER.',
  busy: 'THE CASINO IS BUSY. PRESS SPIN TO TRY AGAIN.',
  unavailable: 'THE GAME IS NOT AVAILABLE NOW. TRY LATER.',
  connection_lost: 'Connection lost. Your balance is safe and correct, reconnect to continue.',
};

export const CREDIT_PENDING_LABEL = 'BEING CREDITED';

export const DEPOSIT_LABEL = 'DEPOSIT';
