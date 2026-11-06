import { readFile } from 'node:fs/promises';
import type { AddressInfo } from 'node:net';
import Fastify, { type FastifyInstance, type FastifyReply } from 'fastify';
import { DEFAULT_PORT } from '../src/config';
import { applyMigrations } from '../src/db/migrate';
import { isEntryPoint } from '../src/entry';
import { isGameSymbol } from '../src/games/registry';
import type { components } from '../src/hub/generated';
import { SIGNATURE_HEADER, signatureMatches } from '../src/hub/sign';
import { start } from '../src/main';
import { isRecord } from '../src/record';

type Schemas = components['schemas'];

export interface StubHubOptions {
  readonly partner: string;
  readonly secretKey: string;
  readonly port: number;
  readonly gameOrigin: string;
  readonly busyWaitMs?: number;
  readonly hangMs?: number;
}

type MoneyLeg = 'bet' | 'win';

export interface RecordedCall {
  readonly leg: 'balance' | MoneyLeg;
  readonly signature: string;
  readonly rawBody: string;
  readonly body: Schemas['BalanceRequest'] | Schemas['MoneyRequest'];
}

interface StubAnswer {
  readonly status: number;
  readonly body: Schemas['Refused'] | Schemas['Retry'];
}

interface ScriptedStep {
  readonly delayMs: number;
  readonly answer: StubAnswer;
}

export interface StubHub {
  readonly url: string;
  readonly calls: RecordedCall[];
  readonly app: FastifyInstance;
  readonly close: () => Promise<void>;
}

export interface DevStack {
  readonly stub: StubHub;
  readonly app: FastifyInstance;
  readonly gameUrl: string;
  readonly stubPort: number;
  readonly close: () => Promise<void>;
}

interface SignedBody {
  readonly rawBody: Buffer;
  readonly json: unknown;
}

const DEFAULT_STUB_PORT = 9100;
const STUB_HOST = '127.0.0.1';
const DEV_PARTNER = 'ownslots';
const DEV_HMAC_KEY = 'dev-hmac-key';
const DEV_DATABASE_URL = 'postgres://postgres:test@localhost:5434/postgres';
const CURRENCY = 'USD';
const MAX_TOKEN_LENGTH = 128;
const MAX_ROUND_ID_LENGTH = 64;
const MAX_AMOUNT_CENTS = 1_000_000_000;
const HUB_LOCK_WAIT_MS = 8_000;
const HANG_PAST_CALL_TIMEOUT_MS = 15_000;
const BUSY_ONCE_TOKEN = 'tok-busy-once';
const TIMEOUT_THEN_FORBIDDEN_TOKEN = 'tok-timeout-then-forbidden';
const STATUS_FORBIDDEN = 403;
const MONEY_REQUEST_KEYS = ['amountCents', 'roundClose', 'roundId', 'token', 'transactionId'].join();
const MONEY_LEGS: readonly MoneyLeg[] = ['bet', 'win'];
const WHOLE_POSITIVE_NUMBER = /^[1-9]\d*$/;
const GAME_ORIGIN_PLACEHOLDER = '__GAME_ORIGIN__';
const HOST_PAGE = new URL('./host.html', import.meta.url);
const INITIAL_BALANCES_CENTS: ReadonlyArray<readonly [string, number]> = [
  ['tok-rich', 10_000],
  ['tok-rich-2', 10_000],
  ['tok-poor', 5],
  ['tok-limit', 10_000],
  ['tok-bet-internal', 10_000],
  ['tok-win-busy', 10_000],
  [BUSY_ONCE_TOKEN, 10_000],
  [TIMEOUT_THEN_FORBIDDEN_TOKEN, 10_000],
];

function refusal(code: Schemas['Refused']['code'], message: string): Schemas['Refused'] {
  return { status: 'refused', code, message };
}

function retry(code: Schemas['Retry']['code'], message: string): Schemas['Retry'] {
  return { status: 'retry', code, message };
}

const SCRIPTED_MONEY_ANSWERS: Readonly<Record<MoneyLeg, ReadonlyMap<string, StubAnswer>>> = {
  bet: new Map([
    ['tok-limit', { status: 422, body: refusal('LIMIT_EXCEEDED', 'a limit of the platform stops the bet') }],
    ['tok-bet-internal', { status: 503, body: retry('INTERNAL', 'the bet failed') }],
  ]),
  win: new Map([['tok-win-busy', { status: 503, body: retry('BUSY', 'wallet is busy') }]]),
};

function sequencedBetStep(token: string, callNumber: number, options: StubHubOptions): ScriptedStep | undefined {
  if (token === BUSY_ONCE_TOKEN && callNumber === 1) {
    return {
      delayMs: options.busyWaitMs ?? HUB_LOCK_WAIT_MS,
      answer: { status: 503, body: retry('BUSY', 'wallet is busy') },
    };
  }
  if (token === TIMEOUT_THEN_FORBIDDEN_TOKEN) {
    return callNumber === 1
      ? {
          delayMs: options.hangMs ?? HANG_PAST_CALL_TIMEOUT_MS,
          answer: { status: 503, body: retry('INTERNAL', 'the bet failed') },
        }
      : { delayMs: 0, answer: { status: STATUS_FORBIDDEN, body: refusal('UNAUTHORIZED', 'forbidden') } };
  }
  return undefined;
}

function wait(ms: number): Promise<void> {
  return new Promise((done) => {
    setTimeout(done, ms).unref();
  });
}

function isToken(value: unknown): value is string {
  return typeof value === 'string' && value.length >= 1 && value.length <= MAX_TOKEN_LENGTH;
}

function isBalanceRequest(value: unknown): value is Schemas['BalanceRequest'] {
  return isRecord(value) && Object.keys(value).join() === 'token' && isToken(value.token);
}

function isMoneyRequest(value: unknown, leg: MoneyLeg): value is Schemas['MoneyRequest'] {
  if (!isRecord(value) || Object.keys(value).sort().join() !== MONEY_REQUEST_KEYS) {
    return false;
  }
  const { token, transactionId, roundId, amountCents, roundClose } = value;
  return (
    isToken(token) &&
    typeof roundId === 'string' &&
    roundId.length >= 1 &&
    roundId.length <= MAX_ROUND_ID_LENGTH &&
    transactionId === `${roundId}:${leg}` &&
    typeof amountCents === 'number' &&
    Number.isInteger(amountCents) &&
    amountCents >= 1 &&
    amountCents <= MAX_AMOUNT_CENTS &&
    typeof roundClose === 'boolean'
  );
}

function authenticated(
  options: StubHubOptions,
  request: { params: { partner: string }; body: SignedBody; headers: Record<string, unknown> },
  reply: FastifyReply,
): { signature: string; rawBody: string; json: unknown } | null {
  if (request.params.partner !== options.partner) {
    reply.code(404).type('text/plain').send('unknown partner');
    return null;
  }
  const { rawBody, json } = request.body;
  const signature = request.headers[SIGNATURE_HEADER.toLowerCase()];
  if (typeof signature !== 'string' || !signatureMatches(options.secretKey, rawBody, signature)) {
    reply.code(401).send(refusal('UNAUTHORIZED', 'bad signature'));
    return null;
  }
  return { signature, rawBody: rawBody.toString('utf8'), json };
}

function buildStubHub(options: StubHubOptions): { app: FastifyInstance; calls: RecordedCall[] } {
  const app = Fastify({ logger: false });
  const calls: RecordedCall[] = [];
  const balancesCents = new Map<string, number>(INITIAL_BALANCES_CENTS);
  const bookedAnswers = new Map<string, Schemas['Accepted']>();
  const betCallsByToken = new Map<string, number>();

  app.removeContentTypeParser('application/json');
  app.addContentTypeParser('application/json', { parseAs: 'buffer' }, (request, rawBody: Buffer, done) => {
    let json: unknown;
    try {
      json = JSON.parse(rawBody.toString('utf8'));
    } catch (error) {
      request.log.warn({ err: error }, 'stub_unreadable_body');
    }
    done(null, { rawBody, json } satisfies SignedBody);
  });

  function accepted(balanceCents: number): Schemas['Accepted'] {
    return { status: 'ok', balanceCents, currency: CURRENCY };
  }

  app.post<{ Params: { partner: string }; Body: SignedBody }>('/webhook/:partner/balance', async (request, reply) => {
    const signed = authenticated(options, request, reply);
    if (signed === null) {
      return reply;
    }
    if (!isBalanceRequest(signed.json)) {
      return reply.code(422).send(refusal('BAD_REQUEST', 'unreadable body'));
    }
    calls.push({ leg: 'balance', signature: signed.signature, rawBody: signed.rawBody, body: signed.json });
    const balanceCents = balancesCents.get(signed.json.token);
    if (balanceCents === undefined) {
      return reply.code(422).send(refusal('SESSION_NOT_FOUND', 'token is unknown or expired'));
    }
    return accepted(balanceCents);
  });

  for (const leg of MONEY_LEGS) {
    app.post<{ Params: { partner: string }; Body: SignedBody }>(`/webhook/:partner/${leg}`, async (request, reply) => {
      const signed = authenticated(options, request, reply);
      if (signed === null) {
        return reply;
      }
      if (!isMoneyRequest(signed.json, leg)) {
        return reply.code(422).send(refusal('BAD_REQUEST', 'body breaks the contract'));
      }
      const money = signed.json;
      calls.push({ leg, signature: signed.signature, rawBody: signed.rawBody, body: money });
      const balanceCents = balancesCents.get(money.token);
      if (balanceCents === undefined) {
        return reply.code(422).send(refusal('SESSION_NOT_FOUND', 'token is unknown or expired'));
      }
      const scripted = SCRIPTED_MONEY_ANSWERS[leg].get(money.token);
      if (scripted !== undefined) {
        return reply.code(scripted.status).send(scripted.body);
      }
      if (leg === 'bet') {
        const callNumber = (betCallsByToken.get(money.token) ?? 0) + 1;
        betCallsByToken.set(money.token, callNumber);
        const step = sequencedBetStep(money.token, callNumber, options);
        if (step !== undefined) {
          await wait(step.delayMs);
          return reply.code(step.answer.status).send(step.answer.body);
        }
      }
      const booked = bookedAnswers.get(money.transactionId);
      if (booked !== undefined) {
        return booked;
      }
      if (leg === 'bet' && balanceCents < money.amountCents) {
        return reply.code(422).send(refusal('INSUFFICIENT_FUNDS', 'balance is below the bet'));
      }
      const newBalanceCents = leg === 'bet' ? balanceCents - money.amountCents : balanceCents + money.amountCents;
      balancesCents.set(money.token, newBalanceCents);
      const answer = accepted(newBalanceCents);
      bookedAnswers.set(money.transactionId, answer);
      return answer;
    });
  }

  app.get('/calls', async () => calls);

  app.post<{ Params: { token: string }; Querystring: { cents?: string } }>('/deposit/:token', async (request, reply) => {
    const balanceCents = balancesCents.get(request.params.token);
    if (balanceCents === undefined) {
      return reply.code(404).send({ error: 'unknown token' });
    }
    const { cents } = request.query;
    if (typeof cents !== 'string' || !WHOLE_POSITIVE_NUMBER.test(cents)) {
      return reply.code(400).send({ error: 'cents must be a whole positive number' });
    }
    const newBalanceCents = balanceCents + Number(cents);
    balancesCents.set(request.params.token, newBalanceCents);
    return { balanceCents: newBalanceCents };
  });

  app.get<{ Params: { symbol: string } }>('/host/:symbol', async (request, reply) => {
    if (!isGameSymbol(request.params.symbol)) {
      reply.callNotFound();
      return reply;
    }
    const page = await readFile(HOST_PAGE, 'utf8');
    return reply.type('text/html').send(page.replaceAll(GAME_ORIGIN_PLACEHOLDER, encodeURI(options.gameOrigin)));
  });

  return { app, calls };
}

export async function startStubHub(options: StubHubOptions): Promise<StubHub> {
  const { app, calls } = buildStubHub(options);
  await app.listen({ port: options.port, host: STUB_HOST });
  const { port } = app.server.address() as AddressInfo;
  return {
    url: `http://${STUB_HOST}:${port}`,
    calls,
    app,
    close: async () => {
      await app.close();
    },
  };
}

export async function startDevStack(env: NodeJS.ProcessEnv): Promise<DevStack> {
  const databaseUrl = env.DATABASE_URL ?? DEV_DATABASE_URL;
  await applyMigrations(databaseUrl);
  const stub = await startStubHub({
    partner: DEV_PARTNER,
    secretKey: DEV_HMAC_KEY,
    port: Number(env.STUB_PORT ?? DEFAULT_STUB_PORT),
    gameOrigin: `http://localhost:${env.PORT ?? DEFAULT_PORT}`,
  });
  const stubPort = Number(new URL(stub.url).port);
  const app = await start({
    HUB_BASE_URL: stub.url,
    HUB_PARTNER: DEV_PARTNER,
    HUB_SECRET_KEY: DEV_HMAC_KEY,
    FRAME_ANCESTORS: `http://localhost:${stubPort} http://127.0.0.1:${stubPort}`,
    DATABASE_URL: databaseUrl,
    ...env,
  });
  const { port } = app.server.address() as AddressInfo;
  return {
    stub,
    app,
    gameUrl: `http://127.0.0.1:${port}`,
    stubPort,
    close: async () => {
      await app.close();
      await stub.close();
    },
  };
}

if (isEntryPoint(import.meta.url)) await startDevStack(process.env);
