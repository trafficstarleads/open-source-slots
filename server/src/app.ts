import Fastify, { type FastifyInstance } from 'fastify';
import type { AppConfig } from './config';
import { createHubClient } from './hub/client';
import { registerLaunchToken } from './http/launchToken';
import { registerSessionRoute } from './http/session';
import { registerStaticPages } from './http/static';

const GAME_API_PREFIX = '/api/game';

export function buildApp(config: AppConfig): FastifyInstance {
  const app = Fastify({ logger: { level: config.logLevel } });
  const hub = createHubClient(config.hub, app.log);

  registerStaticPages(app, config);
  app.register(
    async (api) => {
      registerLaunchToken(api);
      registerSessionRoute(api, hub);
    },
    { prefix: GAME_API_PREFIX },
  );
  return app;
}
