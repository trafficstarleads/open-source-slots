import type { FastifyLoggerOptions, FastifyRequest } from 'fastify';

const QUERY_START = '?';

function pathOf(url: string): string {
  return url.split(QUERY_START, 1)[0];
}

function requestWithoutQuery(request: FastifyRequest): Record<string, unknown> {
  return {
    method: request.method,
    url: pathOf(request.url),
    host: request.host,
    remoteAddress: request.ip,
    remotePort: request.socket.remotePort,
  };
}

export function appLoggerOptions(level: string): FastifyLoggerOptions {
  return { level, serializers: { req: requestWithoutQuery } };
}
