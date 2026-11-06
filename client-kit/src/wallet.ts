import {
  FAILURE_MESSAGES,
  SERVER_ERROR_CODES,
  type FailureCode,
  type ServerErrorCode,
} from './messages';
import { createSpinKeyStore, sessionStore, type KeyValueStore } from './spinKey';

const SESSION_PATH = '/api/game/session';
const SPIN_PATH = '/api/game/spin';
const TOKEN_PARAMETER = 'token';
const NO_TOKEN = '';
const ATTEMPTS = 3;
const RETRY_DELAY_MS = 700;
const CENTS_PER_UNIT = 100;
const BASE_PLAY = { type: 'base' } as const;
const KEPT_SPIN_KEY_CODE: ServerErrorCode = 'busy';

export interface WalletEnvironment {
  readonly search: string;
  readonly store: KeyValueStore;
  readonly send: (url: string, init: RequestInit) => Promise<Response>;
  readonly sleep: (ms: number) => Promise<void>;
  readonly newKey: () => string;
}

export interface ServerRound<Round> {
  readonly roundId: string;
  readonly round: Round;
  readonly winCents: number;
  readonly costCents: number;
  readonly balanceCents: number;
  readonly replay: boolean;
  readonly creditPending: boolean;
}

export interface Failure {
  readonly code: FailureCode;
  readonly message: string;
  readonly balanceCents: number | undefined;
  readonly offersDeposit: boolean;
}

export type SessionOutcome =
  | { readonly kind: 'ready'; readonly balanceCents: number }
  | { readonly kind: 'failed'; readonly failure: Failure };

export type SpinOutcome<Round> =
  | { readonly kind: 'played'; readonly round: ServerRound<Round> }
  | { readonly kind: 'failed'; readonly failure: Failure };

export type Clearance =
  | { readonly kind: 'clear'; readonly balanceCents: number | undefined }
  | { readonly kind: 'refused'; readonly failure: Failure };

export interface Wallet<Round> {
  session(): Promise<SessionOutcome>;
  clearToSpin(shownBalanceCents: number, betCents: number): Promise<Clearance>;
  spin(betCents: number): Promise<SpinOutcome<Round>>;
  pendingBetCents(): number | undefined;
}

export interface RoundView {
  readonly winAmount: number;
  readonly balanceAfterBetCents: number;
  readonly finalBalanceCents: number;
  readonly creditPending: boolean;
}

type ServerAnswer<Body> =
  | { readonly ok: true; readonly body: Body }
  | { readonly ok: false; readonly error: ServerErrorCode; readonly balanceCents: number | undefined };

export function toCents(amount: number): number {
  return Math.round(amount * CENTS_PER_UNIT);
}

export function fromCents(cents: number): number {
  return cents / CENTS_PER_UNIT;
}

export function roundView(round: ServerRound<unknown>): RoundView {
  return {
    winAmount: fromCents(round.winCents),
    balanceAfterBetCents: round.creditPending ? round.balanceCents : round.balanceCents - round.winCents,
    finalBalanceCents: round.balanceCents,
    creditPending: round.creditPending,
  };
}

export function browserEnvironment(owner: Window = window): WalletEnvironment {
  return {
    search: owner.location.search,
    store: sessionStore(owner),
    send: (url, init) => fetch(url, init),
    sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    newKey: () => crypto.randomUUID(),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isCents(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 0;
}

function toErrorCode(raw: string): ServerErrorCode {
  return SERVER_ERROR_CODES.find((code) => code === raw) ?? 'busy';
}

function readAnswer<Body>(read: (fields: Record<string, unknown>) => Body | undefined) {
  return (answer: unknown): ServerAnswer<Body> | undefined => {
    if (!isRecord(answer)) {
      return undefined;
    }
    if (answer.ok === false && typeof answer.error === 'string') {
      return {
        ok: false,
        error: toErrorCode(answer.error),
        balanceCents: isCents(answer.balanceCents) ? answer.balanceCents : undefined,
      };
    }
    const body = answer.ok === true ? read(answer) : undefined;
    return body === undefined ? undefined : { ok: true, body };
  };
}

const readSession = readAnswer((fields) => (isCents(fields.balanceCents) ? fields.balanceCents : undefined));

function readSpin<Round>(): (answer: unknown) => ServerAnswer<ServerRound<Round>> | undefined {
  return readAnswer<ServerRound<Round>>((fields) => {
    const { roundId, round, winCents, costCents, balanceCents } = fields;
    if (typeof roundId !== 'string' || !isRecord(round)) {
      return undefined;
    }
    if (!isCents(winCents) || !isCents(costCents) || !isCents(balanceCents)) {
      return undefined;
    }
    return {
      roundId,
      round: round as Round,
      winCents,
      costCents,
      balanceCents,
      replay: fields.replay === true,
      creditPending: fields.creditPending === true,
    };
  });
}

function failure(code: FailureCode, balanceCents?: number): Failure {
  return {
    code,
    message: FAILURE_MESSAGES[code],
    balanceCents,
    offersDeposit: code === 'insufficient_funds',
  };
}

async function readOnce<Answer>(
  request: () => Promise<Response>,
  read: (answer: unknown) => Answer | undefined,
): Promise<Answer | undefined> {
  try {
    const answer = read(await (await request()).json());
    if (answer === undefined) {
      console.warn('The server sent an answer that is not part of the contract.');
    }
    return answer;
  } catch (error) {
    console.warn('The request to the server failed.', error);
    return undefined;
  }
}

export function createWallet<Round>(game: string, environment: WalletEnvironment = browserEnvironment()): Wallet<Round> {
  const token = new URLSearchParams(environment.search).get(TOKEN_PARAMETER) ?? NO_TOKEN;
  const spinKeys = createSpinKeyStore(environment.store, game, token);
  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
  let expired = token === NO_TOKEN;

  async function answerOf<Answer>(
    url: string,
    init: RequestInit,
    read: (answer: unknown) => Answer | undefined,
  ): Promise<Answer | undefined> {
    const request = (): Promise<Response> => environment.send(url, { ...init, headers, credentials: 'omit' });
    for (let attempt = 1; attempt <= ATTEMPTS; attempt++) {
      const answer = await readOnce(request, read);
      if (answer !== undefined) {
        return answer;
      }
      if (attempt < ATTEMPTS) {
        await environment.sleep(RETRY_DELAY_MS);
      }
    }
    return undefined;
  }

  function expire(): Failure {
    expired = true;
    spinKeys.clear();
    return failure('session_expired');
  }

  function sessionFailure(code: ServerErrorCode, balanceCents: number | undefined): Failure {
    return code === 'session_expired' ? expire() : failure(code, balanceCents);
  }

  function spinFailure(code: ServerErrorCode, balanceCents: number | undefined): Failure {
    if (code !== KEPT_SPIN_KEY_CODE) {
      spinKeys.clear();
    }
    return sessionFailure(code, balanceCents);
  }

  async function session(): Promise<SessionOutcome> {
    if (expired) {
      return { kind: 'failed', failure: failure('session_expired') };
    }
    const answer = await answerOf(`${SESSION_PATH}?game=${game}`, { method: 'GET' }, readSession);
    if (answer === undefined) {
      return { kind: 'failed', failure: failure('connection_lost') };
    }
    if (!answer.ok) {
      return { kind: 'failed', failure: sessionFailure(answer.error, answer.balanceCents) };
    }
    return { kind: 'ready', balanceCents: answer.body };
  }

  async function clearToSpin(shownBalanceCents: number, betCents: number): Promise<Clearance> {
    if (expired) {
      return { kind: 'refused', failure: failure('session_expired') };
    }
    if (spinKeys.load() !== undefined || shownBalanceCents >= betCents) {
      return { kind: 'clear', balanceCents: undefined };
    }
    const fresh = await session();
    if (fresh.kind === 'failed') {
      return { kind: 'refused', failure: fresh.failure };
    }
    if (fresh.balanceCents >= betCents) {
      return { kind: 'clear', balanceCents: fresh.balanceCents };
    }
    return { kind: 'refused', failure: failure('insufficient_funds', fresh.balanceCents) };
  }

  async function spin(betCents: number): Promise<SpinOutcome<Round>> {
    if (expired) {
      return { kind: 'failed', failure: failure('session_expired') };
    }
    const unfinished = spinKeys.load() ?? { key: environment.newKey(), betCents };
    spinKeys.save(unfinished);
    const body = JSON.stringify({ game, key: unfinished.key, betCents: unfinished.betCents, play: BASE_PLAY });
    const answer = await answerOf(SPIN_PATH, { method: 'POST', body }, readSpin<Round>());
    if (answer === undefined) {
      return { kind: 'failed', failure: failure('connection_lost') };
    }
    if (!answer.ok) {
      return { kind: 'failed', failure: spinFailure(answer.error, answer.balanceCents) };
    }
    spinKeys.clear();
    return { kind: 'played', round: answer.body };
  }

  return {
    session,
    clearToSpin,
    spin,
    pendingBetCents: () => spinKeys.load()?.betCents,
  };
}
