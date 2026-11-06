import { createHmac } from 'node:crypto';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { startDevStack, type RecordedCall } from '../dev/stub-hub';
import { createHubClient } from '../src/hub/client';
import { signBody } from '../src/hub/sign';
import { loadConfig } from '../src/config';
import {
  closedPortUrl,
  startScriptedHub,
  startSilentHub,
  startStack,
  testEnv,
  TEST_GAME_ORIGIN,
  TEST_HMAC_KEY,
  TEST_PARTNER,
  TEST_PUBLIC_DIR,
  type ScriptedHub,
  type Stack,
} from './helpers/app';

const SIGNATURE_PATTERN = /^[0-9a-f]{64}$/;
const BALANCE_PATH = `/webhook/${TEST_PARTNER}/balance`;
const SHORT_CALL_TIMEOUT_MS = 100;

function independentSignature(rawBody: string | Buffer): string {
  return createHmac('sha256', TEST_HMAC_KEY).update(rawBody).digest('hex');
}

function silentLogger() {
  return { warn: vi.fn<(fields: object, message: string) => void>() };
}

describe('signBody', () => {
  it('is the lower-case hexadecimal HMAC-SHA256 of the body (RFC 4231 case 2)', () => {
    expect(signBody('Jefe', 'what do ya want for nothing?')).toBe(
      '5bdcc146bf60754e6a042426089575c75a003f089d2739839dec58b964ec3843',
    );
  });

  it('signs bytes and the same text alike', () => {
    expect(signBody(TEST_HMAC_KEY, Buffer.from('{"a":"é"}'))).toBe(signBody(TEST_HMAC_KEY, '{"a":"é"}'));
  });
});

describe('the signature of a hub call', () => {
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

  it('is 64 lower-case hexadecimal characters of the HMAC-SHA256 of the exact bytes sent', async () => {
    const client = createHubClient(stack.config.hub, silentLogger());

    await client.balance('tok-rich');

    const [call] = stack.stub.calls;
    expect(call?.signature).toMatch(SIGNATURE_PATTERN);
    expect(call?.rawBody).toBe('{"token":"tok-rich"}');
    expect(call?.signature).toBe(independentSignature(Buffer.from(call?.rawBody ?? '', 'utf8')));
  });

  it('is sent with every call of a session, each for its own body', async () => {
    const client = createHubClient(stack.config.hub, silentLogger());

    await client.balance('tok-rich');
    await client.balance('tok-rich-2');

    expect(stack.stub.calls.map((call) => call.signature)).toEqual([
      independentSignature('{"token":"tok-rich"}'),
      independentSignature('{"token":"tok-rich-2"}'),
    ]);
  });

  describe('as the stub checks it', () => {
    const rawBody = '{"token":"tok-rich"}';

    function post(body: string, signature: string | undefined): Promise<Response> {
      return fetch(`${stack.stub.url}${BALANCE_PATH}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...(signature ? { 'x-signature': signature } : {}) },
        body,
      });
    }

    it('accepts the body it was signed for', async () => {
      const response = await post(rawBody, independentSignature(rawBody));

      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ status: 'ok', balanceCents: 10_000, currency: 'USD' });
    });

    it('refuses a body changed by one byte with 401 UNAUTHORIZED and records no call', async () => {
      const changed = '{"token":"tok-rich2"}';

      const response = await post(changed, independentSignature(rawBody));

      expect(response.status).toBe(401);
      expect(await response.json()).toEqual({ status: 'refused', code: 'UNAUTHORIZED', message: 'bad signature' });
      expect(stack.stub.calls).toHaveLength(0);
    });

    it('refuses a missing signature and an upper-case one', async () => {
      const missing = await post(rawBody, undefined);
      const upperCase = await post(rawBody, independentSignature(rawBody).toUpperCase());

      expect([missing.status, upperCase.status]).toEqual([401, 401]);
    });

    it('answers a plain-text 404 to a partner it does not know', async () => {
      const response = await fetch(`${stack.stub.url}/webhook/other/balance`, {
        method: 'POST',
        headers: { 'x-signature': independentSignature(rawBody) },
        body: rawBody,
      });

      expect(response.status).toBe(404);
    });

    it.each([
      ['a body that is not JSON', 'not json'],
      ['a field the contract does not have', '{"token":"tok-rich","extra":1}'],
      ['an empty token', '{"token":""}'],
      ['a token over 128 characters', `{"token":"${'t'.repeat(129)}"}`],
      ['a token that is not text', '{"token":5}'],
    ])('answers 422 BAD_REQUEST to %s even when it is signed', async (_name, body) => {
      const response = await post(body, independentSignature(body));

      expect(response.status).toBe(422);
      expect(await response.json()).toMatchObject({ status: 'refused', code: 'BAD_REQUEST' });
    });
  });
});

describe('what the hub client makes of the hub answers', () => {
  const closers: Array<() => Promise<void>> = [];

  afterEach(async () => {
    await Promise.all(closers.splice(0).map((close) => close()));
  });

  async function clientAgainst(hub: Pick<ScriptedHub, 'url'>, callTimeoutMs?: number) {
    const logger = silentLogger();
    const config = loadConfig(
      testEnv(hub.url, callTimeoutMs === undefined ? {} : { HUB_CALL_TIMEOUT_MS: String(callTimeoutMs) }),
    );
    return { client: createHubClient(config.hub, logger), logger };
  }

  async function scripted(status: number, body: string): Promise<ScriptedHub> {
    const hub = await startScriptedHub(status, body);
    closers.push(hub.close);
    return hub;
  }

  it('reads an accepted call as the balance in cents', async () => {
    const hub = await scripted(200, '{"status":"ok","balanceCents":14900,"currency":"USD"}');
    const { client } = await clientAgainst(hub);

    expect(await client.balance('tok-rich')).toEqual({ kind: 'accepted', balanceCents: 14_900 });
  });

  it('reads a definite refusal with its code', async () => {
    const hub = await scripted(422, '{"status":"refused","code":"SESSION_NOT_FOUND","message":"gone"}');
    const { client } = await clientAgainst(hub);

    expect(await client.balance('tok-rich')).toEqual({ kind: 'refused', code: 'SESSION_NOT_FOUND' });
  });

  it('reads BUSY and INTERNAL as a retry', async () => {
    const busy = await scripted(503, '{"status":"retry","code":"BUSY","message":"wallet is busy"}');
    const internal = await scripted(503, '{"status":"retry","code":"INTERNAL","message":"oops"}');

    expect(await (await clientAgainst(busy)).client.balance('tok-rich')).toEqual({ kind: 'retry', code: 'BUSY' });
    expect(await (await clientAgainst(internal)).client.balance('tok-rich')).toEqual({
      kind: 'retry',
      code: 'INTERNAL',
    });
  });

  it.each([401, 403, 404])('reads %i as a rejection, whatever the body', async (status) => {
    const hub = await scripted(status, 'plain text');
    const { client } = await clientAgainst(hub);

    expect(await client.balance('tok-rich')).toEqual({ kind: 'rejected', status });
  });

  it.each([
    ['a 200 that is not JSON', 200, 'not json'],
    ['a 200 without a status', 200, '{"balanceCents":1}'],
    ['a 200 with a balance that is not whole cents', 200, '{"status":"ok","balanceCents":1.5,"currency":"USD"}'],
    ['a 200 with a negative balance', 200, '{"status":"ok","balanceCents":-1,"currency":"USD"}'],
    ['a 422 with a code the contract does not have', 422, '{"status":"refused","code":"NOPE","message":"x"}'],
    ['a 503 with a code the contract does not have', 503, '{"status":"retry","code":"NOPE","message":"x"}'],
    ['a 500', 500, '{"status":"retry","code":"INTERNAL","message":"x"}'],
    ['a 200 with an array', 200, '[]'],
  ])('reads %s as no answer and logs it', async (_name, status, body) => {
    const hub = await scripted(status, body);
    const { client, logger } = await clientAgainst(hub);

    expect(await client.balance('tok-rich')).toEqual({ kind: 'no_answer' });
    expect(logger.warn).toHaveBeenCalledOnce();
  });

  it('reads a closed port as no answer and logs it', async () => {
    const { client, logger } = await clientAgainst({ url: await closedPortUrl() });

    expect(await client.balance('tok-rich')).toEqual({ kind: 'no_answer' });
    expect(logger.warn).toHaveBeenCalledOnce();
  });

  it('gives up on a hub that never answers once the call timeout has passed', async () => {
    const hub = await startSilentHub();
    closers.push(hub.close);
    const { client, logger } = await clientAgainst(hub, SHORT_CALL_TIMEOUT_MS);

    const started = Date.now();
    const answer = await client.balance('tok-rich');

    expect(answer).toEqual({ kind: 'no_answer' });
    expect(Date.now() - started).toBeLessThan(SHORT_CALL_TIMEOUT_MS * 20);
    expect(logger.warn).toHaveBeenCalledOnce();
  });
});

describe('the stub hub', () => {
  let stack: Stack;

  beforeAll(async () => {
    stack = await startStack();
  });

  afterAll(async () => {
    await stack.close();
  });

  it('lists the calls it received in order, with the signature of each', async () => {
    stack.stub.calls.length = 0;
    const client = createHubClient(stack.config.hub, silentLogger());
    await client.balance('tok-rich');
    await client.balance('tok-expired');

    const listed = (await (await fetch(`${stack.stub.url}/calls`)).json()) as RecordedCall[];

    expect(listed).toEqual([
      expect.objectContaining({ leg: 'balance', body: { token: 'tok-rich' } }),
      expect.objectContaining({ leg: 'balance', body: { token: 'tok-expired' } }),
    ]);
    expect(listed[0].signature).toMatch(SIGNATURE_PATTERN);
  });

  it('adds a deposit to a wallet and refuses a deposit that is not a whole positive number of cents', async () => {
    const ok = await fetch(`${stack.stub.url}/deposit/tok-rich?cents=5`, { method: 'POST' });
    const unknown = await fetch(`${stack.stub.url}/deposit/tok-nobody?cents=5`, { method: 'POST' });
    const noCents = await fetch(`${stack.stub.url}/deposit/tok-rich`, { method: 'POST' });
    const fraction = await fetch(`${stack.stub.url}/deposit/tok-rich?cents=1.5`, { method: 'POST' });
    const zero = await fetch(`${stack.stub.url}/deposit/tok-rich?cents=0`, { method: 'POST' });

    expect(ok.status).toBe(200);
    expect(await ok.json()).toEqual({ balanceCents: 10_005 });
    expect([unknown.status, noCents.status, fraction.status, zero.status]).toEqual([404, 400, 400, 400]);
  });

  it('serves the host page of a game, which frames the game server and logs what the frame posts', async () => {
    const response = await fetch(`${stack.stub.url}/host/stellar-sevens?token=tok-rich`);
    const page = await response.text();

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('text/html');
    expect(page).toContain(TEST_GAME_ORIGIN);
    expect(page).toContain('iframe');
    expect(page).not.toContain('__GAME_ORIGIN__');
  });

  it('does not serve a host page for a game that is not one of the twelve', async () => {
    const response = await fetch(`${stack.stub.url}/host/nope`);

    expect(response.status).toBe(404);
  });
});

describe('the development stack', () => {
  it('runs the stub hub and the game server together, signed and framed for each other', async () => {
    const dev = await startDevStack({ PORT: '0', STUB_PORT: '0', PUBLIC_DIR: TEST_PUBLIC_DIR, LOG_LEVEL: 'silent' });
    try {
      const session = await fetch(`${dev.gameUrl}/api/game/session?game=stellar-sevens`, {
        headers: { authorization: 'Bearer tok-rich' },
      });
      const page = await fetch(`${dev.gameUrl}/play/stellar-sevens`);

      expect(await session.json()).toEqual({ ok: true, balanceCents: 10_000 });
      expect(page.headers.get('content-security-policy')).toContain(`frame-ancestors http://localhost:${dev.stubPort}`);
      expect(dev.stub.calls).toHaveLength(1);
    } finally {
      await dev.close();
    }
  });
});
