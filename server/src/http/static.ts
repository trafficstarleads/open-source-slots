import fastifyStatic from '@fastify/static';
import type { FastifyInstance, FastifyReply } from 'fastify';
import type { AppConfig } from '../config';
import { isGameSymbol } from '../games/registry';

const PAGE_FILE = 'index.html';
const PARENT_SEGMENT_OR_NULL_BYTE = /(?:^|[\\/])\.\.(?:[\\/]|$)|\0/;

function sendGameFile(reply: FastifyReply, symbol: string, file: string): FastifyReply {
  if (!isGameSymbol(symbol) || PARENT_SEGMENT_OR_NULL_BYTE.test(file)) {
    reply.callNotFound();
    return reply;
  }
  return reply.sendFile(`play/${symbol}/${file}`);
}

export function registerStaticPages(app: FastifyInstance, config: Pick<AppConfig, 'publicDir' | 'frameAncestors'>): void {
  app.register(fastifyStatic, { root: config.publicDir, serve: false });
  app.register(async (pages) => {
    pages.addHook('onRequest', async (_request, reply) => {
      reply.header('content-security-policy', `frame-ancestors ${config.frameAncestors}`);
      reply.header('referrer-policy', 'no-referrer');
    });
    pages.get<{ Params: { symbol: string } }>('/play/:symbol', async (request, reply) =>
      sendGameFile(reply, request.params.symbol, PAGE_FILE),
    );
    pages.get<{ Params: { symbol: string; '*': string } }>('/play/:symbol/*', async (request, reply) =>
      sendGameFile(reply, request.params.symbol, request.params['*'] || PAGE_FILE),
    );
  });
}
