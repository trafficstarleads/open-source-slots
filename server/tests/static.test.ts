import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ConfigError, loadConfig } from '../src/config';
import { isEntryPoint } from '../src/entry';
import { start } from '../src/main';
import { startStack, testEnv, TEST_FRAME_ANCESTORS, TEST_PUBLIC_DIR, type Stack } from './helpers/app';

const STELLAR_PAGE = readFileSync(
  fileURLToPath(new URL('./fixtures/play/stellar-sevens/index.html', import.meta.url)),
  'utf8',
);
const HUB_URL = 'http://hub.example.com:8080';
const REQUIRED_SETTINGS = ['FRAME_ANCESTORS', 'HUB_SECRET_KEY', 'HUB_BASE_URL', 'DATABASE_URL'] as const;
const DATABASE_URL = 'postgres://app@db.example.com:5432/slots';
const TWELVE_SYMBOLS = [
  'tropic-escape',
  'stellar-sevens',
  'bumper-crop',
  'golden-papyrus',
  'nitro-hot',
  'scorching-hot',
  'pearl-reef',
  'discovery-voyage',
  'house-of-ra',
  'fairytale',
  'samurai',
  'the-dynasty',
] as const;

describe('the game pages', () => {
  let stack: Stack;

  beforeAll(async () => {
    stack = await startStack();
  });

  afterAll(async () => {
    await stack.close();
  });

  it('serves the page of a game at /play/<symbol>', async () => {
    const response = await stack.app.inject({ url: '/play/stellar-sevens' });

    expect(response.statusCode).toBe(200);
    expect(response.headers['content-type']).toContain('text/html');
    expect(response.body).toBe(STELLAR_PAGE);
  });

  it('serves the same page at the trailing slash and at its file name', async () => {
    const slash = await stack.app.inject({ url: '/play/stellar-sevens/' });
    const file = await stack.app.inject({ url: '/play/stellar-sevens/index.html' });

    expect([slash.statusCode, file.statusCode]).toEqual([200, 200]);
    expect([slash.body, file.body]).toEqual([STELLAR_PAGE, STELLAR_PAGE]);
  });

  it('keeps the query of the launch address out of the way of the page', async () => {
    const response = await stack.app.inject({ url: '/play/stellar-sevens?token=tok-rich&lang=en&lobby=' });

    expect(response.statusCode).toBe(200);
    expect(response.body).toBe(STELLAR_PAGE);
  });

  it.each([
    '/play/nope',
    '/play/nope/index.html',
    '/play/__proto__',
    '/play/constructor',
    '/play/Stellar-Sevens',
    '/play/tropic-escape',
    '/play/stellar-sevens/missing.js',
    '/play/stellar-sevens/assets',
    '/play/stellar-sevens/../../package.json',
    '/play/stellar-sevens/%2e%2e/%2e%2e/package.json',
    '/play/stellar-sevens/..%2f..%2fpackage.json',
    '/play/stellar-sevens/..%2f..%2f..%2ftests%2ffixtures%2fbalance_ok.json',
    '/play/stellar-sevens/..%5c..%5cpackage.json',
    '/play/stellar-sevens/%00',
    '/play',
    '/play/',
    '/',
    '/api/other',
    '/api/game/deliver',
  ])('answers 404 to %s', async (url) => {
    const response = await stack.app.inject({ url });

    expect(response.statusCode).toBe(404);
  });

  it('answers 404 to every symbol whose bundle was not built', async () => {
    const answers = await Promise.all(
      TWELVE_SYMBOLS.filter((symbol) => symbol !== 'stellar-sevens').map((symbol) =>
        stack.app.inject({ url: `/play/${symbol}` }),
      ),
    );

    expect(answers.map((answer) => answer.statusCode)).toEqual(Array(TWELVE_SYMBOLS.length - 1).fill(404));
  });

  it('allows framing only by the configured ancestors and sends no referrer', async () => {
    const response = await stack.app.inject({ url: '/play/stellar-sevens' });

    expect(response.headers['content-security-policy']).toBe(`frame-ancestors ${TEST_FRAME_ANCESTORS}`);
    expect(response.headers['referrer-policy']).toBe('no-referrer');
  });

  it('sends the same headers with every file of a game, and with its 404', async () => {
    const file = await stack.app.inject({ url: '/play/stellar-sevens/index.html' });
    const missing = await stack.app.inject({ url: '/play/stellar-sevens/missing.js' });

    for (const response of [file, missing]) {
      expect(response.headers['content-security-policy']).toBe(`frame-ancestors ${TEST_FRAME_ANCESTORS}`);
      expect(response.headers['referrer-policy']).toBe('no-referrer');
    }
  });

  it('passes a list of ancestors through exactly as configured', async () => {
    const ancestors = "'self' https://a.example.com https://*.b.example.com";
    const custom = await startStack({ FRAME_ANCESTORS: ancestors });
    try {
      const response = await custom.app.inject({ url: '/play/stellar-sevens' });

      expect(response.headers['content-security-policy']).toBe(`frame-ancestors ${ancestors}`);
    } finally {
      await custom.close();
    }
  });
});

describe('the settings', () => {
  it('reads the required ones and defaults the rest', () => {
    const config = loadConfig({
      HUB_BASE_URL: HUB_URL,
      HUB_SECRET_KEY: 'k',
      FRAME_ANCESTORS: TEST_FRAME_ANCESTORS,
      DATABASE_URL,
    });

    expect(config).toEqual({
      port: 3000,
      publicDir: resolve('public'),
      frameAncestors: TEST_FRAME_ANCESTORS,
      databaseUrl: DATABASE_URL,
      logLevel: 'info',
      hub: { baseUrl: HUB_URL, partner: 'ownslots', secretKey: 'k', callTimeoutMs: 10_000 },
      sweep: { leaseMs: 12_000, intervalMs: 1_000, alertAfterAttempts: 5 },
    });
  });

  it('reads every optional setting from the environment', () => {
    const config = loadConfig(
      testEnv(HUB_URL, { PORT: '8081', HUB_CALL_TIMEOUT_MS: '2500', LOG_LEVEL: 'warn', HUB_PARTNER: 'shop-1' }),
    );

    expect(config).toMatchObject({
      port: 8081,
      publicDir: TEST_PUBLIC_DIR,
      logLevel: 'warn',
      hub: { partner: 'shop-1', callTimeoutMs: 2500 },
    });
  });

  it('is frozen, in every section', () => {
    const config = loadConfig(testEnv(HUB_URL));

    expect(Object.isFrozen(config)).toBe(true);
    expect(Object.isFrozen(config.hub)).toBe(true);
  });

  it('drops the trailing slashes of the hub address', () => {
    expect(loadConfig(testEnv(`${HUB_URL}//`)).hub.baseUrl).toBe(HUB_URL);
  });

  it.each(REQUIRED_SETTINGS)('fails when %s is missing', (name) => {
    const env = testEnv(HUB_URL);
    delete env[name];

    expect(() => loadConfig(env)).toThrow(ConfigError);
    expect(() => loadConfig(env)).toThrow(name);
  });

  it.each(REQUIRED_SETTINGS)('fails when %s is blank', (name) => {
    expect(() => loadConfig(testEnv(HUB_URL, { [name]: '  ' }))).toThrow(name);
  });

  it('names every missing required setting at once', () => {
    expect(() => loadConfig({})).toThrow('FRAME_ANCESTORS, HUB_SECRET_KEY, HUB_BASE_URL, DATABASE_URL');
  });

  it.each([
    ['PORT', 'abc'],
    ['PORT', '70000'],
    ['PORT', '-1'],
    ['HUB_CALL_TIMEOUT_MS', '0'],
    ['HUB_CALL_TIMEOUT_MS', '1.5'],
    ['HUB_BASE_URL', 'not a url'],
    ['HUB_BASE_URL', 'ftp://hub.example.com'],
  ])('fails when %s is %s', (name, value) => {
    expect(() => loadConfig(testEnv(HUB_URL, { [name]: value }))).toThrow(name);
  });
});

describe('the start', () => {
  it('listens on the configured port and serves the pages', async () => {
    const app = await start(testEnv(HUB_URL));
    try {
      const { port } = app.server.address() as AddressInfo;
      const response = await fetch(`http://127.0.0.1:${port}/play/stellar-sevens`);

      expect(response.status).toBe(200);
      expect(await response.text()).toBe(STELLAR_PAGE);
    } finally {
      await app.close();
    }
  });

  it.each(REQUIRED_SETTINGS)('fails with no %s', async (name) => {
    const env = testEnv(HUB_URL);
    delete env[name];

    await expect(start(env)).rejects.toThrow(name);
  });

  it('knows the file it was started as', () => {
    const file = fileURLToPath(import.meta.url);

    expect(isEntryPoint(import.meta.url, file)).toBe(true);
    expect(isEntryPoint(import.meta.url, `${file}.other`)).toBe(false);
    expect(isEntryPoint(import.meta.url, undefined)).toBe(false);
  });
});
