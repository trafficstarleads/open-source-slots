import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';
import { GAMES, dealRound, isGameSymbol } from '../src/games/registry';
import { createSecureRng } from '../src/rng';

interface CatalogGame {
  readonly symbol: string;
  readonly name: string;
  readonly identity: string;
}

interface Contract {
  readonly 'x-catalog': { readonly games: { readonly const: readonly CatalogGame[] } };
}

const CONTRACT_URL = new URL(
  '../../tasks/own-slots-or-free-pragmatic/from-origin/contract.openapi.yaml',
  import.meta.url,
);
const REPO_ROOT_URL = new URL('../../', import.meta.url);
const ROUNDS_PER_GAME = 200;
const LINE_UNIT_TOLERANCE = 1e-6;

const EXPECTED_LINES: Readonly<Record<string, number>> = {
  'tropic-escape': 9,
  'stellar-sevens': 5,
  'bumper-crop': 25,
  'golden-papyrus': 10,
  'nitro-hot': 5,
  'scorching-hot': 5,
  'pearl-reef': 10,
  'discovery-voyage': 10,
  'house-of-ra': 10,
  fairytale: 10,
  samurai: 20,
  'the-dynasty': 20,
};

function contractCatalog(): readonly CatalogGame[] {
  const contract = parse(readFileSync(fileURLToPath(CONTRACT_URL), 'utf8')) as Contract;
  return contract['x-catalog'].games.const;
}

function gameFolders(): readonly string[] {
  const repoRoot = fileURLToPath(REPO_ROOT_URL);
  return readdirSync(repoRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && existsSync(`${repoRoot}${entry.name}/src/engine`))
    .map((entry) => entry.name);
}

const registered = Object.entries(GAMES).map(([symbol, game]) => ({ symbol, game }));

describe('game registry', () => {
  it('holds exactly the game folders of the repository and no other symbol', () => {
    expect(Object.keys(GAMES).sort()).toEqual([...gameFolders()].sort());
    expect(Object.keys(GAMES)).toHaveLength(12);
  });

  it('equals x-catalog.games of the contract in symbol, name and identity, entry by entry', () => {
    const registry = registered.map(({ symbol, game }) => ({
      symbol,
      name: game.name,
      identity: game.identity,
    }));
    const catalog = contractCatalog().map(({ symbol, name, identity }) => ({ symbol, name, identity }));

    expect(registry).toEqual(catalog);
  });

  it('takes the line count of each game from its engine', () => {
    expect(Object.fromEntries(registered.map(({ symbol, game }) => [symbol, game.lines]))).toEqual(
      EXPECTED_LINES,
    );
  });

  it('recognises the twelve symbols and nothing else', () => {
    for (const symbol of Object.keys(GAMES)) expect(isGameSymbol(symbol)).toBe(true);
    for (const other of ['nope', '', 'toString', '__proto__', 'Stellar-Sevens', 'constructor']) {
      expect(isGameSymbol(other)).toBe(false);
    }
  });

  describe.each(registered)('$symbol', ({ symbol, game }) => {
    it(`settles ${ROUNDS_PER_GAME} secure rounds to whole line units`, () => {
      if (!isGameSymbol(symbol)) throw new Error(`${symbol} is not registered`);
      const rng = createSecureRng();

      for (let round = 0; round < ROUNDS_PER_GAME; round++) {
        const dealt = dealRound(symbol, rng);
        const lineUnits = dealt.totalWin * game.lines;

        expect(dealt.totalWin).toBeGreaterThanOrEqual(0);
        expect(Math.abs(lineUnits - Math.round(lineUnits))).toBeLessThan(LINE_UNIT_TOLERANCE);
      }
    });
  });

  it('returns the whole round of the engine, which survives a trip through JSON', () => {
    const dealt = dealRound('stellar-sevens', createSecureRng());

    expect(JSON.parse(JSON.stringify(dealt))).toEqual(dealt);
  });
});
