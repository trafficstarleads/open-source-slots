import { randomUUID } from 'node:crypto';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { startStack, type Stack } from './helpers/app';

const HEALTH_URL = '/healthz';
const OLDEST_WAITING_SECONDS = 600;
const SLACK_SECONDS = 30;

async function insertRound(stack: Stack, status: string, ageSeconds: number): Promise<void> {
  await stack.database.pool.query(
    `insert into rounds (id, game, token, spin_key, bet_cents, result, win_cents, status, refusal_code, created_at)
     values ($1, 'stellar-sevens', 'tok-health', $2, 10, '{"totalWin":0}', 0, $3, $4, now() - ($5 || ' seconds')::interval)`,
    [randomUUID(), randomUUID(), status, status === 'refused' ? 'REFUSED' : null, String(ageSeconds)],
  );
}

describe('GET /healthz', () => {
  let stack: Stack;

  beforeAll(async () => {
    stack = await startStack();
  });

  afterAll(async () => {
    await stack.close();
  });

  afterEach(async () => {
    await stack.database.pool.query('delete from rounds');
  });

  it('counts the rounds waiting for a bet, waiting for a win and parked, and the age of the oldest waiting one', async () => {
    await insertRound(stack, 'bet_pending', 30);
    await insertRound(stack, 'bet_pending', 120);
    await insertRound(stack, 'win_pending', OLDEST_WAITING_SECONDS);
    await insertRound(stack, 'parked', 5_000);
    await insertRound(stack, 'settled', 9_000);
    await insertRound(stack, 'refused', 9_500);

    const response = await stack.app.inject({ url: HEALTH_URL });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body).toMatchObject({ waitingBet: 2, waitingWin: 1, parked: 1 });
    expect(body.oldestWaitingSeconds).toBeGreaterThanOrEqual(OLDEST_WAITING_SECONDS);
    expect(body.oldestWaitingSeconds).toBeLessThan(OLDEST_WAITING_SECONDS + SLACK_SECONDS);
  });

  it('writes every count as a JSON number, not as text', async () => {
    await insertRound(stack, 'bet_pending', 60);
    await insertRound(stack, 'win_pending', 90);
    await insertRound(stack, 'parked', 120);

    const response = await stack.app.inject({ url: HEALTH_URL });

    expect(response.body).toMatch(/"waitingBet":1,"waitingWin":1,"parked":1,"oldestWaitingSeconds":\d+\}/);
    expect(Object.keys(response.json())).toEqual(['waitingBet', 'waitingWin', 'parked', 'oldestWaitingSeconds']);
  });

  it('does not count a parked round in the age: it waits for an operator, not for a call', async () => {
    await insertRound(stack, 'bet_pending', 45);
    await insertRound(stack, 'parked', 90_000);

    const body = (await stack.app.inject({ url: HEALTH_URL })).json();

    expect(body.parked).toBe(1);
    expect(body.oldestWaitingSeconds).toBeLessThan(45 + SLACK_SECONDS);
  });

  it('reports zeros for a journal that owes nothing', async () => {
    await insertRound(stack, 'settled', 100);

    const response = await stack.app.inject({ url: HEALTH_URL });

    expect(response.json()).toEqual({ waitingBet: 0, waitingWin: 0, parked: 0, oldestWaitingSeconds: 0 });
  });

  it('asks for no launch token and is not part of the game API', async () => {
    const open = await stack.app.inject({ url: HEALTH_URL });
    const underGameApi = await stack.app.inject({ url: '/api/game/healthz' });

    expect(open.statusCode).toBe(200);
    expect(underGameApi.statusCode).toBe(404);
  });
});
