import type { FastifyReply } from 'fastify';

export type BrowserErrorCode =
  | 'session_expired'
  | 'insufficient_funds'
  | 'bet_refused'
  | 'bad_request'
  | 'busy'
  | 'unavailable';

const STATUS_OF: Readonly<Record<BrowserErrorCode, number>> = {
  session_expired: 401,
  bad_request: 400,
  insufficient_funds: 422,
  bet_refused: 422,
  busy: 503,
  unavailable: 503,
};

export function sendError(reply: FastifyReply, code: BrowserErrorCode): FastifyReply {
  return reply.code(STATUS_OF[code]).send({ ok: false, error: code });
}
