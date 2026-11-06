import type { FastifyInstance } from 'fastify';
import { isOnLadder } from '../games/ladder';
import { isGameSymbol } from '../games/registry';
import type { SpinCommand, SpinService } from '../spin/spin';
import { sendError } from './browserError';

const MAX_SPIN_KEY_LENGTH = 128;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseSpinCommand(body: unknown, token: string): SpinCommand | null {
  if (!isRecord(body)) {
    return null;
  }
  const { game, key, betCents } = body;
  if (typeof game !== 'string' || !isGameSymbol(game) || !isOnLadder(betCents)) {
    return null;
  }
  if (typeof key !== 'string' || key.length < 1 || key.length > MAX_SPIN_KEY_LENGTH) {
    return null;
  }
  return { token, game, key, betCents };
}

export function registerSpinRoute(api: FastifyInstance, spins: SpinService): void {
  api.post('/spin', async (request, reply) => {
    const command = parseSpinCommand(request.body, request.launchToken);
    if (command === null) {
      return sendError(reply, 'bad_request');
    }
    const outcome = await spins.play(command);
    return outcome.ok ? outcome : sendError(reply, outcome.error, outcome.balanceCents);
  });
}
