import type { HubSettings } from '../config';
import type { components } from './generated';
import { SIGNATURE_HEADER, signBody } from './sign';

type Schemas = components['schemas'];
type MoneyRequest = Schemas['MoneyRequest'];
type HubLeg = 'balance' | 'bet' | 'win';
type HubRequest = Schemas['BalanceRequest'] | MoneyRequest;

export type MoneyCall = Omit<MoneyRequest, 'transactionId'>;
export type RefusalCode = Schemas['Refused']['code'];
export type BetRefusal = RefusalCode | 'FORBIDDEN' | 'NOT_FOUND';
export type RetryCode = Schemas['Retry']['code'];

export type HubAnswer =
  | { readonly kind: 'accepted'; readonly balanceCents: number }
  | { readonly kind: 'refused'; readonly code: RefusalCode }
  | { readonly kind: 'retry'; readonly code: RetryCode }
  | { readonly kind: 'rejected'; readonly status: number }
  | { readonly kind: 'no_answer' };

export interface HubLogger {
  readonly warn: (fields: object, message: string) => void;
}

export interface HubClient {
  readonly balance: (token: string) => Promise<HubAnswer>;
  readonly bet: (call: MoneyCall) => Promise<HubAnswer>;
  readonly win: (call: MoneyCall) => Promise<HubAnswer>;
}

const STATUS_OK = 200;
const STATUS_REFUSED = 422;
const STATUS_RETRY = 503;
const REJECTION_STATUSES: readonly number[] = [401, 403, 404];
const NO_ANSWER: HubAnswer = { kind: 'no_answer' };

const REFUSAL_CODES: Readonly<Record<RefusalCode, true>> = {
  UNAUTHORIZED: true,
  INSUFFICIENT_FUNDS: true,
  LIMIT_EXCEEDED: true,
  SESSION_NOT_FOUND: true,
  CONFLICT: true,
  BAD_REQUEST: true,
  REFUSED: true,
};
const RETRY_CODES: Readonly<Record<RetryCode, true>> = { BUSY: true, INTERNAL: true };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isWholeCents(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0;
}

function isRefusalCode(value: unknown): value is RefusalCode {
  return typeof value === 'string' && Object.hasOwn(REFUSAL_CODES, value);
}

function isRetryCode(value: unknown): value is RetryCode {
  return typeof value === 'string' && Object.hasOwn(RETRY_CODES, value);
}

function readAnswer(status: number, text: string): HubAnswer {
  if (REJECTION_STATUSES.includes(status)) {
    return { kind: 'rejected', status };
  }
  const body: unknown = JSON.parse(text);
  if (!isRecord(body)) {
    return NO_ANSWER;
  }
  if (status === STATUS_OK && body.status === 'ok' && isWholeCents(body.balanceCents)) {
    return { kind: 'accepted', balanceCents: body.balanceCents };
  }
  if (status === STATUS_REFUSED && body.status === 'refused' && isRefusalCode(body.code)) {
    return { kind: 'refused', code: body.code };
  }
  if (status === STATUS_RETRY && body.status === 'retry' && isRetryCode(body.code)) {
    return { kind: 'retry', code: body.code };
  }
  return NO_ANSWER;
}

export function createHubClient(settings: HubSettings, logger: HubLogger): HubClient {
  const webhookBase = `${settings.baseUrl}/webhook/${encodeURIComponent(settings.partner)}`;

  async function call(leg: HubLeg, request: HubRequest): Promise<HubAnswer> {
    const rawBody = JSON.stringify(request);
    try {
      const response = await fetch(`${webhookBase}/${leg}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', [SIGNATURE_HEADER]: signBody(settings.secretKey, rawBody) },
        body: rawBody,
        signal: AbortSignal.timeout(settings.callTimeoutMs),
      });
      const answer = readAnswer(response.status, await response.text());
      if (answer.kind === 'no_answer') {
        logger.warn({ leg, status: response.status }, 'hub_answer_unreadable');
      }
      return answer;
    } catch (error) {
      logger.warn({ leg, err: error }, 'hub_call_failed');
      return NO_ANSWER;
    }
  }

  function money(leg: 'bet' | 'win', { token, roundId, amountCents, roundClose }: MoneyCall): Promise<HubAnswer> {
    return call(leg, { token, transactionId: `${roundId}:${leg}`, roundId, amountCents, roundClose });
  }

  return {
    balance: (token) => call('balance', { token }),
    bet: (moneyCall) => money('bet', moneyCall),
    win: (moneyCall) => money('win', moneyCall),
  };
}
