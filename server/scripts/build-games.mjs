import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = fileURLToPath(new URL('../../', import.meta.url));
const OUTPUT_DIR_SETTING = 'GAMES_OUTPUT_DIR';
const OUTPUT_ROOT = process.env[OUTPUT_DIR_SETTING]
  ? resolve(process.env[OUTPUT_DIR_SETTING])
  : fileURLToPath(new URL('../public/play/', import.meta.url));
const ARGUMENT_SEPARATOR = '--';
const ENGINE_ENTRY = join('src', 'engine', 'index.ts');
const VITE_CONFIG = 'vite.config.ts';
const VITE_BIN = join('node_modules', 'vite', 'bin', 'vite.js');
const TSC_BIN = join('node_modules', 'typescript', 'bin', 'tsc');

function gameSymbols() {
  return readdirSync(REPO_ROOT, { withFileTypes: true })
    .filter(
      (entry) =>
        entry.isDirectory() &&
        existsSync(join(REPO_ROOT, entry.name, VITE_CONFIG)) &&
        existsSync(join(REPO_ROOT, entry.name, ENGINE_ENTRY)),
    )
    .map((entry) => entry.name)
    .sort();
}

function requestedSymbols(available) {
  const named = process.argv.slice(2).filter((argument) => argument !== ARGUMENT_SEPARATOR);
  if (named.length === 0) {
    return available;
  }
  const unknown = named.filter((symbol) => !available.includes(symbol));
  if (unknown.length > 0) {
    throw new Error(`not a game folder: ${unknown.join(', ')}; games are ${available.join(', ')}`);
  }
  return named;
}

function runInGame(symbol, script, args, env) {
  const gameDir = join(REPO_ROOT, symbol);
  const scriptPath = join(gameDir, script);
  if (!existsSync(scriptPath)) {
    throw new Error(`${symbol} has no installed dependencies: run npm --prefix ${symbol} ci`);
  }
  const { status } = spawnSync(process.execPath, [scriptPath, ...args], {
    cwd: gameDir,
    stdio: 'inherit',
    env: { ...process.env, ...env },
  });
  if (status !== 0) {
    throw new Error(`${symbol}: ${script} ended with status ${status}`);
  }
}

function buildGame(symbol) {
  const outDir = join(OUTPUT_ROOT, symbol);
  runInGame(symbol, TSC_BIN, ['--noEmit'], {});
  runInGame(symbol, VITE_BIN, ['build', '--outDir', outDir, '--emptyOutDir'], { GAME_BASE: `/play/${symbol}/` });
  console.log(`built ${symbol} into ${outDir}`);
}

requestedSymbols(gameSymbols()).forEach(buildGame);
