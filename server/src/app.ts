import Fastify, { type FastifyInstance } from 'fastify';
import { systemClock, type Clock } from './clock';
import type { AppConfig } from './config';
import { createPool } from './db/pool';
import { dealRound } from './games/registry';
import { createHubClient } from './hub/client';
import { registerBrowserErrorHandler } from './http/browserError';
import { registerHealthRoute } from './http/health';
import { registerLaunchToken } from './http/launchToken';
import { registerSessionRoute } from './http/session';
import { registerSpinRoute } from './http/spin';
import { registerStaticPages } from './http/static';
import { createSecureRng } from './rng';
import { createSpinService } from './spin/spin';
import { createSweeper, type Sweeper } from './spin/sweeper';

declare module 'fastify' {
  interface FastifyInstance {
    sweeper: Sweeper;
  }
}

const GAME_API_PREFIX = '/api/game';

export function buildApp(config: AppConfig, clock: Clock = systemClock): FastifyInstance {
  const app = Fastify({ logger: { level: config.logLevel } });
  const hub = createHubClient(config.hub, app.log);
  const db = createPool(config.databaseUrl, app.log);
  const rng = createSecureRng();
  const spins = createSpinService({
    db,
    hub,
    deal: (game) => dealRound(game, rng),
    logger: app.log,
    clock,
    retry: {
      budgetMs: config.hub.callTimeoutMs,
      leaseMs: config.sweep.leaseMs,
      alertAfterAttempts: config.sweep.alertAfterAttempts,
    },
  });

  app.decorate('sweeper', createSweeper({ db, spins, clock, leaseMs: config.sweep.leaseMs, logger: app.log }));
  app.addHook('onClose', async () => {
    await db.end();
  });
  registerStaticPages(app, config);
  registerHealthRoute(app, db);
  app.register(
    async (api) => {
      registerBrowserErrorHandler(api);
      registerLaunchToken(api);
      registerSessionRoute(api, hub);
      registerSpinRoute(api, spins);
    },
    { prefix: GAME_API_PREFIX },
  );
  return app;
}
