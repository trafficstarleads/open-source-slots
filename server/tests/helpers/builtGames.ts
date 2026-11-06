import { execFile } from 'node:child_process';
import { access, mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { GAMES, type GameSymbol } from '../../src/games/registry';

const run = promisify(execFile);

export const GAME_SYMBOLS = Object.keys(GAMES) as readonly GameSymbol[];
export const CREDIT_LINE = 'Art by APEXSLOTS (apexslots.eu), CC BY 4.0';
export const BUILD_TIMEOUT_MS = 900_000;
const BUILD_CONCURRENCY = 4;
const BUILD_OUTPUT_LIMIT_BYTES = 64 * 1024 * 1024;
const REPO_ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const BUILD_SCRIPT = fileURLToPath(new URL('../../scripts/build-games.mjs', import.meta.url));
const VITE_BIN = join('node_modules', 'vite', 'bin', 'vite.js');
const OUTPUT_DIR_SETTING = 'GAMES_OUTPUT_DIR';
const LOCAL_REFERENCE = /(?:src|href)="(?!data:|https?:)([^"]+)"/g;
const PAGE_TITLE = /<title>([^<]*)<\/title>/;
const DEMO_WORD = /demo/i;
const SPIN_CALL = '/api/game/spin';
const DELIVER_CALL = '/api/game/deliver';
const DEMO_TITLE_SUFFIX = '- Demo';

export interface BuiltGames {
  readonly publicDir: string;
  readonly playDir: (symbol: GameSymbol) => string;
  readonly dispose: () => Promise<void>;
}

export function playBase(symbol: GameSymbol): string {
  return `/play/${symbol}/`;
}

async function inBatches<T>(items: readonly T[], size: number, work: (item: T) => Promise<unknown>): Promise<void> {
  for (let start = 0; start < items.length; start += size) {
    await Promise.all(items.slice(start, start + size).map(work));
  }
}

async function openOutput(): Promise<BuiltGames> {
  const publicDir = await mkdtemp(join(tmpdir(), 'slots-bundles-'));
  return {
    publicDir,
    playDir: (symbol) => join(publicDir, 'play', symbol),
    dispose: () => rm(publicDir, { recursive: true, force: true }),
  };
}

async function failedWith<T>(started: Promise<T>, output: BuiltGames): Promise<T> {
  try {
    return await started;
  } catch (error) {
    await output.dispose();
    throw error;
  }
}

export async function buildGames(symbols: readonly GameSymbol[] = GAME_SYMBOLS): Promise<BuiltGames> {
  const output = await openOutput();
  const env = { ...process.env, [OUTPUT_DIR_SETTING]: join(output.publicDir, 'play') };
  const building = inBatches(symbols, BUILD_CONCURRENCY, (symbol) =>
    run(process.execPath, [BUILD_SCRIPT, symbol], { env, maxBuffer: BUILD_OUTPUT_LIMIT_BYTES, timeout: BUILD_TIMEOUT_MS }),
  );
  await failedWith(building, output);
  return output;
}

export async function buildWithBase(symbol: GameSymbol, base: string | undefined): Promise<BuiltGames> {
  const output = await openOutput();
  const { GAME_BASE: _inherited, ...inherited } = process.env;
  const env = base === undefined ? inherited : { ...inherited, GAME_BASE: base };
  const building = run(
    process.execPath,
    [join(REPO_ROOT, symbol, VITE_BIN), 'build', '--outDir', output.playDir(symbol), '--emptyOutDir'],
    { cwd: join(REPO_ROOT, symbol), env, maxBuffer: BUILD_OUTPUT_LIMIT_BYTES, timeout: BUILD_TIMEOUT_MS },
  );
  await failedWith(building, output);
  return output;
}

async function readPage(playDir: string): Promise<string> {
  return readFile(join(playDir, 'index.html'), 'utf8');
}

export function localReferences(page: string): readonly string[] {
  return [...page.matchAll(LOCAL_REFERENCE)].map((match) => match[1] as string);
}

async function exists(path: string): Promise<boolean> {
  return access(path).then(
    () => true,
    () => false,
  );
}

export async function pathProblems(symbol: GameSymbol, playDir: string): Promise<readonly string[]> {
  const base = playBase(symbol);
  const references = localReferences(await readPage(playDir));
  const problems: string[] = [];
  if (!references.some((reference) => reference.startsWith(`${base}assets/`))) {
    problems.push(`the page references nothing under ${base}assets/`);
  }
  for (const reference of references) {
    if (!reference.startsWith(base)) {
      problems.push(`${reference} is outside ${base}`);
    } else if (!(await exists(join(playDir, reference.slice(base.length))))) {
      problems.push(`${reference} is not in the bundle`);
    }
  }
  return problems;
}

export async function titleProblems(playDir: string): Promise<readonly string[]> {
  const title = PAGE_TITLE.exec(await readPage(playDir))?.[1];
  if (title === undefined) {
    return ['the page has no title'];
  }
  return DEMO_WORD.test(title) ? [`the title "${title}" says demo`] : [];
}

async function scriptText(playDir: string): Promise<string> {
  const assetsDir = join(playDir, 'assets');
  const files = (await readdir(assetsDir)).filter((file) => file.endsWith('.js'));
  const sources = await Promise.all(files.map((file) => readFile(join(assetsDir, file), 'utf8')));
  return sources.join('\n');
}

export async function scriptProblems(playDir: string): Promise<readonly string[]> {
  const scripts = await scriptText(playDir);
  const problems: string[] = [];
  if (!scripts.includes(CREDIT_LINE)) {
    problems.push(`the scripts do not contain "${CREDIT_LINE}"`);
  }
  if (!scripts.includes(SPIN_CALL)) {
    problems.push(`the scripts never call ${SPIN_CALL}`);
  }
  if (scripts.includes(DELIVER_CALL)) {
    problems.push(`the scripts still call ${DELIVER_CALL}`);
  }
  if (scripts.includes(DEMO_TITLE_SUFFIX)) {
    problems.push(`the scripts still carry "${DEMO_TITLE_SUFFIX}"`);
  }
  return problems;
}
