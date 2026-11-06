import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';

const SERVER_ROOT = fileURLToPath(new URL('.', import.meta.url));
const DEFAULT_ENTRY = 'src/main.ts';
const OUTPUT_FILE = 'dist/server.mjs';
const NODE_TARGET = 'node22';

const entry = process.argv[2] ?? DEFAULT_ENTRY;

await build({
  absWorkingDir: SERVER_ROOT,
  entryPoints: [entry],
  outfile: OUTPUT_FILE,
  bundle: true,
  packages: 'external',
  platform: 'node',
  format: 'esm',
  target: NODE_TARGET,
  sourcemap: true,
  logLevel: 'info',
});
