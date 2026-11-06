import type { FastifyInstance } from 'fastify';
import { isGameSymbol } from '../games/registry';
import type { HubClient } from '../hub/client';
import { sendError } from './browserError';

export function registerSessionRoute(api: FastifyInstance, hub: HubClient): void {
  api.get<{ Querystring: { game?: unknown } }>('/session', async (request, reply) => {
    const { game } = request.query;
    if (typeof game !== 'string' || !isGameSymbol(game)) {
      return sendError(reply, 'bad_request');
    }
    const answer = await hub.balance(request.launchToken);
    if (answer.kind === 'accepted') {
      return { ok: true, balanceCents: answer.balanceCents };
    }
    if (answer.kind === 'refused' && answer.code === 'SESSION_NOT_FOUND') {
      return sendError(reply, 'session_expired');
    }
    request.log.warn({ answer }, 'session_unavailable');
    return sendError(reply, 'unavailable');
  });
}
