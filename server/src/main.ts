import type { FastifyInstance } from 'fastify';
import { buildApp } from './app';
import { loadConfig } from './config';
import { isEntryPoint } from './entry';
import { startSweepLoop } from './spin/sweeper';

const LISTEN_HOST = '0.0.0.0';

export async function start(env: NodeJS.ProcessEnv): Promise<FastifyInstance> {
  const config = loadConfig(env);
  const app = buildApp(config);
  const stopSweeping = startSweepLoop(app.sweeper, config.sweep.intervalMs, app.log);
  app.addHook('onClose', async () => {
    await stopSweeping();
  });
  await app.listen({ port: config.port, host: LISTEN_HOST });
  return app;
}

if (isEntryPoint(import.meta.url)) await start(process.env);
