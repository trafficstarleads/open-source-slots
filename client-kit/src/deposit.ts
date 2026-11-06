export const DEPOSIT_MESSAGE_TYPE = 'apex:deposit';

const ANY_TARGET_ORIGIN = '*';

export interface MessageTarget {
  postMessage(message: unknown, targetOrigin: string): void;
}

export function postDeposit(target: MessageTarget): void {
  target.postMessage({ type: DEPOSIT_MESSAGE_TYPE }, ANY_TARGET_ORIGIN);
}
