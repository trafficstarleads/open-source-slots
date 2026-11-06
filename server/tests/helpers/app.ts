import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { fileURLToPath } from 'node:url';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../../src/app';
import { loadConfig, type AppConfig } from '../../src/config';
import { startStubHub, type StubHub } from '../../dev/stub-hub';

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
  readonly close: () => Promise<void>;
}

export interface ScriptedHub {
  readonly url: string;
  readonly close: () => Promise<void>;
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
  const config = loadConfig(testEnv(stub.url, envOverrides));
  const app = buildApp(config);
  await app.ready();
  return {
    app,
    stub,
    config,
    close: async () => {
      await app.close();
      await stub.close();
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

export function startSilentHub(): Promise<ScriptedHub> {
  return listening(createServer((request) => request.resume()));
}

export async function closedPortUrl(): Promise<string> {
  const hub = await startSilentHub();
  await hub.close();
  return hub.url;
}
