import type { FastifyError, FastifyInstance, FastifyReply } from 'fastify';

export const BROWSER_ERROR_CODES = [
  'session_expired',
  'insufficient_funds',
  'bet_refused',
  'bad_request',
  'busy',
  'unavailable',
] as const;

export type BrowserErrorCode = (typeof BROWSER_ERROR_CODES)[number];

const STATUS_OF: Readonly<Record<BrowserErrorCode, number>> = {
  session_expired: 401,
  bad_request: 400,
  insufficient_funds: 422,
  bet_refused: 422,
  busy: 503,
  unavailable: 503,
};

const FIRST_SERVER_ERROR_STATUS = 500;

export function sendError(reply: FastifyReply, code: BrowserErrorCode, balanceCents?: number): FastifyReply {
  return reply.code(STATUS_OF[code]).send({ ok: false, error: code, balanceCents });
}

export function registerBrowserErrorHandler(api: FastifyInstance): void {
  api.setErrorHandler((error: FastifyError, request, reply) => {
    if (error.statusCode !== undefined && error.statusCode < FIRST_SERVER_ERROR_STATUS) {
      return sendError(reply, 'bad_request');
    }
    request.log.error({ err: error }, 'browser_request_failed');
    return sendError(reply, 'busy');
  });
}
