import type { FastifyInstance } from 'fastify';
import type { Database } from '../db/pool';
import { roundBacklog } from '../db/rounds';

export function registerHealthRoute(app: FastifyInstance, db: Database): void {
  app.get('/healthz', () => roundBacklog(db));
}
