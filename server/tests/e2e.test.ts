import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { bearer, postSpin, SPIN_BET_CENTS, spinPayload, startStack, TEST_FRAME_ANCESTORS, type Stack } from './helpers/app';
import { BUILD_TIMEOUT_MS, buildGames, GAME_SYMBOLS, localReferences, playBase, type BuiltGames } from './helpers/builtGames';

const RICH_TOKEN = 'tok-rich';
const EXPIRED_TOKEN = 'tok-expired';
const SESSION_URL = '/api/game/session';
const NOT_SERVED = [
  '/play',
  '/play/',
  '/play/nope',
  '/play/nope/index.html',
  '/play/Stellar-Sevens',
  '/play/stellar-sevens/missing.js',
  '/play/stellar-sevens/assets/missing.js',
  '/play/stellar-sevens/%2e%2e/%2e%2e/package.json',
  '/play/stellar-sevens/..%2f..%2fpackage.json',
] as const;

async function rowsOfRounds(stack: Stack): Promise<number> {
  const { rows } = await stack.database.pool.query<{ count: number }>('select count(*)::int as count from rounds');
  return rows[0]?.count ?? 0;
}

describe('the twelve games through the application', () => {
  let built: BuiltGames;
  let stack: Stack;

  beforeAll(async () => {
    built = await buildGames();
    stack = await startStack({ PUBLIC_DIR: built.publicDir });
  }, BUILD_TIMEOUT_MS);

  afterAll(async () => {
    await stack?.close();
    await built?.dispose();
  });

  describe.each(GAME_SYMBOLS)('%s', (symbol) => {
    it('serves its page at /play/<symbol> and its files under /play/<symbol>/assets/', async () => {
      const page = await stack.app.inject({ url: `/play/${symbol}?token=${RICH_TOKEN}&lang=en` });

      expect(page.statusCode).toBe(200);
      expect(page.headers['content-type']).toContain('text/html');
      expect(page.headers['content-security-policy']).toBe(`frame-ancestors ${TEST_FRAME_ANCESTORS}`);
      const references = localReferences(page.body);
      const script = references.find((reference) => reference.endsWith('.js'));
      expect(script?.startsWith(`${playBase(symbol)}assets/`)).toBe(true);
      for (const reference of references) {
        const file = await stack.app.inject({ url: reference });
        expect(file.statusCode, reference).toBe(200);
      }
    });

    it('opens a session for a launch token', async () => {
      const response = await stack.app.inject({ url: `${SESSION_URL}?game=${symbol}`, headers: bearer(RICH_TOKEN) });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({ ok: true, balanceCents: expect.any(Number) });
    });

    it('answers a spin with a round that has a totalWin and books it with the hub', async () => {
      const answer = await postSpin(stack.app, RICH_TOKEN, spinPayload({ game: symbol }));

      expect(answer.statusCode).toBe(200);
      expect(answer.body).toMatchObject({
        ok: true,
        costCents: SPIN_BET_CENTS,
        round: { totalWin: expect.any(Number) },
        winCents: expect.any(Number),
      });
      const booked = stack.stub.calls.filter((call) => (call.body as { roundId?: string }).roundId === answer.body.roundId);
      expect(booked.map((call) => call.leg)).toEqual(answer.body.winCents === 0 ? ['bet'] : ['bet', 'win']);
    });
  });

  it.each(NOT_SERVED)('answers 404 to %s', async (url) => {
    const response = await stack.app.inject({ url });

    expect(response.statusCode).toBe(404);
  });

  describe('without a launch token', () => {
    it('refuses the session, the spin of every game and an unknown token, and plays nothing', async () => {
      const callsBefore = stack.stub.calls.length;
      const roundsBefore = await rowsOfRounds(stack);

      const session = await stack.app.inject({ url: `${SESSION_URL}?game=${GAME_SYMBOLS[0]}` });
      const spins = await Promise.all(
        GAME_SYMBOLS.map((symbol) =>
          stack.app.inject({ method: 'POST', url: '/api/game/spin', payload: spinPayload({ game: symbol }) }),
        ),
      );

      expect([session.statusCode, ...spins.map((spin) => spin.statusCode)]).toEqual(Array(GAME_SYMBOLS.length + 1).fill(401));
      expect(session.json()).toEqual({ ok: false, error: 'session_expired' });
      expect(await rowsOfRounds(stack)).toBe(roundsBefore);
      expect(stack.stub.calls).toHaveLength(callsBefore);
    });

    it('refuses a token the hub does not know and sends no outcome', async () => {
      const answer = await postSpin(stack.app, EXPIRED_TOKEN);

      expect(answer.statusCode).toBe(401);
      expect(answer.body).toEqual({ ok: false, error: 'session_expired' });
    });

    it.each(['/api/game/demo', '/api/game/guest', '/api/game/deliver'])('serves no %s', async (url) => {
      const response = await stack.app.inject({ method: 'POST', url, payload: {} });

      expect(response.statusCode).toBe(404);
    });
  });
});
