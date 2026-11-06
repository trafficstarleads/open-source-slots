import type { FastifyInstance } from 'fastify';
import { sendError } from './browserError';

declare module 'fastify' {
  interface FastifyRequest {
    launchToken: string;
  }
}

const MAX_LAUNCH_TOKEN_LENGTH = 128;
const BEARER_TOKEN = new RegExp(`^Bearer (\\S{1,${MAX_LAUNCH_TOKEN_LENGTH}})$`);
const NO_LAUNCH_TOKEN = '';

export function registerLaunchToken(api: FastifyInstance): void {
  api.decorateRequest('launchToken', NO_LAUNCH_TOKEN);
  api.addHook('onRequest', async (request, reply) => {
    const match = BEARER_TOKEN.exec(request.headers.authorization ?? '');
    if (match === null) {
      return sendError(reply, 'session_expired');
    }
    request.launchToken = match[1];
    return undefined;
  });
}
