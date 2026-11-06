import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import {
  bearer,
  closedPortUrl,
  startScriptedHub,
  startStack,
  TEST_HMAC_KEY,
  TEST_PARTNER,
  type ScriptedHub,
  type Stack,
} from './helpers/app';

const SESSION_URL = '/api/game/session?game=stellar-sevens';
const RICH_BALANCE_CENTS = 10_000;
const MAX_TOKEN_LENGTH = 128;

describe('the session of a game window', () => {
  let stack: Stack;

  beforeAll(async () => {
    stack = await startStack();
  });

  afterAll(async () => {
    await stack.close();
  });

  afterEach(() => {
    stack.stub.calls.length = 0;
  });

  it('answers the balance of the token in whole cents, taken from the hub', async () => {
    const response = await stack.app.inject({ url: SESSION_URL, headers: bearer('tok-rich') });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ ok: true, balanceCents: RICH_BALANCE_CENTS });
    expect(Number.isInteger(response.json().balanceCents)).toBe(true);
    expect(stack.stub.calls).toHaveLength(1);
    expect(stack.stub.calls[0]).toMatchObject({ leg: 'balance', body: { token: 'tok-rich' } });
  });

  it('shows a deposit made elsewhere at the next call', async () => {
    await fetch(`${stack.stub.url}/deposit/tok-rich-2?cents=250`, { method: 'POST' });

    const response = await stack.app.inject({ url: SESSION_URL, headers: bearer('tok-rich-2') });

    expect(response.json()).toEqual({ ok: true, balanceCents: RICH_BALANCE_CENTS + 250 });
  });

  it.each([
    ['no Authorization header', {}],
    ['a scheme that is not Bearer', { authorization: 'Basic dG9rLXJpY2g=' }],
    ['an empty Bearer token', { authorization: 'Bearer ' }],
    ['a Bearer token with a space inside', { authorization: 'Bearer tok rich' }],
    ['a token longer than the hub accepts', bearer('t'.repeat(MAX_TOKEN_LENGTH + 1))],
  ])('refuses %s with session_expired and calls the hub not at all', async (_name, headers) => {
    const response = await stack.app.inject({ url: SESSION_URL, headers });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toEqual({ ok: false, error: 'session_expired' });
    expect(stack.stub.calls).toHaveLength(0);
  });

  it('refuses every call under /api/game/ that has no token, whatever else is wrong with it', async () => {
    const response = await stack.app.inject({ url: '/api/game/session?game=nope' });

    expect(response.statusCode).toBe(401);
    expect(stack.stub.calls).toHaveLength(0);
  });

  it('answers session_expired when the hub does not know the token', async () => {
    const response = await stack.app.inject({ url: SESSION_URL, headers: bearer('tok-expired') });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toEqual({ ok: false, error: 'session_expired' });
    expect(stack.stub.calls).toHaveLength(1);
  });

  it.each([
    ['an unknown game', '/api/game/session?game=nope'],
    ['no game', '/api/game/session'],
    ['a game given twice', '/api/game/session?game=samurai&game=fairytale'],
    ['a prototype name', '/api/game/session?game=__proto__'],
  ])('answers bad_request to %s and calls the hub not at all', async (_name, url) => {
    const response = await stack.app.inject({ url, headers: bearer('tok-rich') });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({ ok: false, error: 'bad_request' });
    expect(stack.stub.calls).toHaveLength(0);
  });

  it('serves nothing else under /api/', async () => {
    const response = await stack.app.inject({ url: '/api/other', headers: bearer('tok-rich') });

    expect(response.statusCode).toBe(404);
  });
});

describe('the session when the hub gives no usable answer', () => {
  const closers: Array<() => Promise<void>> = [];

  afterEach(async () => {
    await Promise.all(closers.splice(0).map((close) => close()));
  });

  async function sessionAgainst(
    hubBaseUrl: string,
    envOverrides: NodeJS.ProcessEnv = {},
  ): Promise<{ statusCode: number; body: unknown }> {
    const stack = await startStack({ HUB_BASE_URL: hubBaseUrl, ...envOverrides });
    closers.push(stack.close);
    const response = await stack.app.inject({ url: SESSION_URL, headers: bearer('tok-rich') });
    return { statusCode: response.statusCode, body: response.json() };
  }

  async function scripted(status: number, body: string): Promise<ScriptedHub> {
    const hub = await startScriptedHub(status, body);
    closers.push(hub.close);
    return hub;
  }

  async function liveStubUrl(): Promise<string> {
    const live = await startStack();
    closers.push(live.close);
    return live.stub.url;
  }

  const UNAVAILABLE = { statusCode: 503, body: { ok: false, error: 'unavailable' } };

  it('answers unavailable when the hub answers UNAUTHORIZED to a wrong key', async () => {
    const answer = await sessionAgainst(await liveStubUrl(), { HUB_SECRET_KEY: `${TEST_HMAC_KEY}-x` });

    expect(answer).toEqual(UNAVAILABLE);
  });

  it('answers unavailable when the hub does not know the partner (404)', async () => {
    const answer = await sessionAgainst(await liveStubUrl(), { HUB_PARTNER: `${TEST_PARTNER}-x` });

    expect(answer).toEqual(UNAVAILABLE);
  });

  it('answers unavailable when the hub forbids the caller (403)', async () => {
    const hub = await scripted(403, '');

    expect(await sessionAgainst(hub.url)).toEqual(UNAVAILABLE);
  });

  it('answers unavailable when the hub is busy', async () => {
    const hub = await scripted(503, '{"status":"retry","code":"BUSY","message":"wallet is busy"}');

    expect(await sessionAgainst(hub.url)).toEqual(UNAVAILABLE);
  });

  it('answers unavailable when the hub refuses for another reason', async () => {
    const hub = await scripted(422, '{"status":"refused","code":"REFUSED","message":"blocked"}');

    expect(await sessionAgainst(hub.url)).toEqual(UNAVAILABLE);
  });

  it('answers unavailable when the hub answers with something unreadable', async () => {
    const hub = await scripted(200, 'not json');

    expect(await sessionAgainst(hub.url)).toEqual(UNAVAILABLE);
  });

  it('answers unavailable when the port of the hub is closed', async () => {
    expect(await sessionAgainst(await closedPortUrl())).toEqual(UNAVAILABLE);
  });
});
