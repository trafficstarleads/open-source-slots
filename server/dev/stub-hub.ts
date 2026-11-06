import { readFile } from 'node:fs/promises';
import type { AddressInfo } from 'node:net';
import Fastify, { type FastifyInstance } from 'fastify';
import { DEFAULT_PORT } from '../src/config';
import { isEntryPoint } from '../src/entry';
import { isGameSymbol } from '../src/games/registry';
import type { components } from '../src/hub/generated';
import { SIGNATURE_HEADER, signatureMatches } from '../src/hub/sign';
import { start } from '../src/main';

type Schemas = components['schemas'];

export interface StubHubOptions {
  readonly partner: string;
  readonly secretKey: string;
  readonly port: number;
  readonly gameOrigin: string;
}

export interface RecordedCall {
  readonly leg: 'balance';
  readonly signature: string;
  readonly rawBody: string;
  readonly body: Schemas['BalanceRequest'];
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
const CURRENCY = 'USD';
const MAX_TOKEN_LENGTH = 128;
const WHOLE_POSITIVE_NUMBER = /^[1-9]\d*$/;
const GAME_ORIGIN_PLACEHOLDER = '__GAME_ORIGIN__';
const HOST_PAGE = new URL('./host.html', import.meta.url);
const INITIAL_BALANCES_CENTS: ReadonlyArray<readonly [string, number]> = [
  ['tok-rich', 10_000],
  ['tok-rich-2', 10_000],
];

function refusal(code: Schemas['Refused']['code'], message: string): Schemas['Refused'] {
  return { status: 'refused', code, message };
}

function isBalanceRequest(value: unknown): value is Schemas['BalanceRequest'] {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const keys = Object.keys(value);
  const { token } = value as { token?: unknown };
  return (
    keys.length === 1 &&
    keys[0] === 'token' &&
    typeof token === 'string' &&
    token.length >= 1 &&
    token.length <= MAX_TOKEN_LENGTH
  );
}

function buildStubHub(options: StubHubOptions): { app: FastifyInstance; calls: RecordedCall[] } {
  const app = Fastify({ logger: false });
  const calls: RecordedCall[] = [];
  const balancesCents = new Map<string, number>(INITIAL_BALANCES_CENTS);

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

  app.post<{ Params: { partner: string }; Body: SignedBody }>('/webhook/:partner/balance', async (request, reply) => {
    if (request.params.partner !== options.partner) {
      return reply.code(404).type('text/plain').send('unknown partner');
    }
    const { rawBody, json } = request.body;
    const signature = request.headers[SIGNATURE_HEADER.toLowerCase()];
    if (typeof signature !== 'string' || !signatureMatches(options.secretKey, rawBody, signature)) {
      return reply.code(401).send(refusal('UNAUTHORIZED', 'bad signature'));
    }
    if (!isBalanceRequest(json)) {
      return reply.code(422).send(refusal('BAD_REQUEST', 'unreadable body'));
    }
    calls.push({ leg: 'balance', signature, rawBody: rawBody.toString('utf8'), body: json });
    const balanceCents = balancesCents.get(json.token);
    if (balanceCents === undefined) {
      return reply.code(422).send(refusal('SESSION_NOT_FOUND', 'token is unknown or expired'));
    }
    return { status: 'ok', balanceCents, currency: CURRENCY } satisfies Schemas['Accepted'];
  });

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
