import { createServer, type IncomingMessage, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { fileURLToPath } from 'node:url';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../../src/app';
import { loadConfig, type AppConfig } from '../../src/config';
import { startStubHub, type StubHub } from '../../dev/stub-hub';
import { createTestDatabase, standDatabaseUrl, type TestDatabase } from './db';

export const TEST_PARTNER = 'ownslots-test';
export const TEST_HMAC_KEY = 'test-hmac-key';
export const TEST_FRAME_ANCESTORS = 'https://casino.example.com';
export const TEST_GAME_ORIGIN = 'http://localhost:3000';
export const TEST_PUBLIC_DIR = fileURLToPath(new URL('../fixtures', import.meta.url));
export const LOOPBACK = '127.0.0.1';

export interface Stack {
  readonly app: FastifyInstance;
  readonly stub: StubHub;
  readonly config: AppConfig;
  readonly database: TestDatabase;
  readonly close: () => Promise<void>;
}

export interface ScriptedHub {
  readonly url: string;
  readonly close: () => Promise<void>;
}

export interface ScriptedAnswer {
  readonly status: number;
  readonly body: string;
}

export interface ScriptedRequest {
  readonly path: string;
  readonly body: string;
}

export interface SequencedHub extends ScriptedHub {
  readonly requests: ScriptedRequest[];
}

export interface SpinAnswer {
  readonly statusCode: number;
  readonly raw: string;
  readonly body: Record<string, unknown>;
}

export const SPIN_URL = '/api/game/spin';
export const SPIN_GAME = 'stellar-sevens';
export const SPIN_BET_CENTS = 10;
const MAX_SPINS_UNTIL = 600;
let spinKeyCounter = 0;

export function bearer(launchToken: string): Record<string, string> {
  return { authorization: `Bearer ${launchToken}` };
}

export function freshKey(): string {
  spinKeyCounter += 1;
  return `key-${spinKeyCounter}`;
}

export function spinPayload(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return { game: SPIN_GAME, key: freshKey(), betCents: SPIN_BET_CENTS, play: { type: 'base' }, ...overrides };
}

export async function postSpin(
  app: FastifyInstance,
  launchToken: string,
  payload: unknown = spinPayload(),
): Promise<SpinAnswer> {
  const response = await app.inject({ method: 'POST', url: SPIN_URL, headers: bearer(launchToken), payload: payload as object });
  return { statusCode: response.statusCode, raw: response.body, body: response.json() };
}

export async function spinUntilWin(
  app: FastifyInstance,
  launchToken: string,
  wantsWin: boolean,
  overrides: Record<string, unknown> = {},
): Promise<{ answer: SpinAnswer; payload: Record<string, unknown> }> {
  for (let attempt = 0; attempt < MAX_SPINS_UNTIL; attempt += 1) {
    const payload = spinPayload(overrides);
    const answer = await postSpin(app, launchToken, payload);
    if (answer.body.ok !== true || (answer.body.winCents !== 0) === wantsWin) {
      return { answer, payload };
    }
  }
  throw new Error(`no ${wantsWin ? 'winning' : 'losing'} spin in ${MAX_SPINS_UNTIL} tries`);
}

export function testEnv(hubBaseUrl: string, overrides: NodeJS.ProcessEnv = {}): NodeJS.ProcessEnv {
  return {
    HUB_BASE_URL: hubBaseUrl,
    HUB_PARTNER: TEST_PARTNER,
    HUB_SECRET_KEY: TEST_HMAC_KEY,
    FRAME_ANCESTORS: TEST_FRAME_ANCESTORS,
    PUBLIC_DIR: TEST_PUBLIC_DIR,
    LOG_LEVEL: 'silent',
    PORT: '0',
    DATABASE_URL: standDatabaseUrl(),
    ...overrides,
  };
}

export async function startStack(envOverrides: NodeJS.ProcessEnv = {}): Promise<Stack> {
  const stub = await startStubHub({
    partner: TEST_PARTNER,
    secretKey: TEST_HMAC_KEY,
    port: 0,
    gameOrigin: TEST_GAME_ORIGIN,
  });
  const database = await createTestDatabase();
  const config = loadConfig(testEnv(stub.url, { DATABASE_URL: database.url, ...envOverrides }));
  const app = buildApp(config);
  await app.ready();
  return {
    app,
    stub,
    config,
    database,
    close: async () => {
      await app.close();
      await stub.close();
      await database.close();
    },
  };
}

function listening(server: Server): Promise<ScriptedHub> {
  return new Promise((resolve) => {
    server.listen(0, LOOPBACK, () => {
      const { port } = server.address() as AddressInfo;
      resolve({
        url: `http://${LOOPBACK}:${port}`,
        close: () =>
          new Promise<void>((done) => {
            server.closeAllConnections();
            server.close(() => done());
          }),
      });
    });
  });
}

export function startScriptedHub(status: number, body: string): Promise<ScriptedHub> {
  return listening(
    createServer((request, response) => {
      request.resume();
      response.writeHead(status, { 'content-type': 'application/json' });
      response.end(body);
    }),
  );
}

function readBody(request: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    request.on('data', (chunk: Buffer) => chunks.push(chunk));
    request.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    request.on('error', reject);
  });
}

export async function startSequencedHub(
  answers: readonly ScriptedAnswer[],
  beforeAnswer: (request: ScriptedRequest) => Promise<void> = async () => undefined,
): Promise<SequencedHub> {
  const requests: ScriptedRequest[] = [];
  const hub = await listening(
    createServer((request, response) => {
      readBody(request)
        .then(async (body) => {
          const seen = { path: request.url ?? '', body };
          requests.push(seen);
          const answer = answers[Math.min(requests.length, answers.length) - 1];
          await beforeAnswer(seen);
          response.writeHead(answer.status, { 'content-type': 'application/json' });
          response.end(answer.body);
        })
        .catch((error: Error) => response.destroy(error));
    }),
  );
  return { ...hub, requests };
}

export function startSilentHub(): Promise<ScriptedHub> {
  return listening(createServer((request) => request.resume()));
}

export async function closedPortUrl(): Promise<string> {
  const hub = await startSilentHub();
  await hub.close();
  return hub.url;
}
