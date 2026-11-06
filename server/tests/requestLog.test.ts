import { Writable } from 'node:stream';
import Fastify from 'fastify';
import { describe, expect, it } from 'vitest';
import { appLoggerOptions } from '../src/http/requestLog';

const PLAYER_LAUNCH_KEY = 'tok-launch-secret';
const PAGE_PATH = '/play/stellar-sevens';

function captureLines(): { readonly stream: Writable; readonly lines: string[] } {
  const lines: string[] = [];
  const stream = new Writable({
    write(chunk: Buffer, _encoding, done) {
      lines.push(...chunk.toString('utf8').split('\n').filter((line) => line !== ''));
      done();
    },
  });
  return { stream, lines };
}

describe('the request log', () => {
  it('logs the path of a page load without the launch token of its address', async () => {
    const { stream, lines } = captureLines();
    const app = Fastify({ logger: { ...appLoggerOptions('info'), stream } });
    app.get('/play/:symbol', () => 'page');

    await app.inject({ method: 'GET', url: `${PAGE_PATH}?token=${PLAYER_LAUNCH_KEY}&lang=en` });
    await app.close();

    const incoming = lines.map((line) => JSON.parse(line) as { req?: { url?: string } }).find((entry) => entry.req);
    expect(incoming?.req?.url).toBe(PAGE_PATH);
    expect(lines.join('\n')).not.toContain(PLAYER_LAUNCH_KEY);
  });
});
