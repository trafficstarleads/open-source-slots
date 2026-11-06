import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  BUILD_TIMEOUT_MS,
  buildGames,
  buildWithBase,
  GAME_SYMBOLS,
  pathProblems,
  playBase,
  scriptProblems,
  titleProblems,
  type BuiltGames,
} from './helpers/builtGames';

const BUILT_SYMBOL = 'stellar-sevens';
const WRONG_BASES = [
  { name: 'unset', base: undefined },
  { name: 'the site root', base: '/' },
  { name: 'another game', base: playBase('nitro-hot') },
  { name: 'a path of the lobby', base: `/games/${BUILT_SYMBOL}/` },
] as const;

describe('the twelve built bundles', () => {
  let built: BuiltGames;

  beforeAll(async () => {
    built = await buildGames();
  }, BUILD_TIMEOUT_MS);

  afterAll(async () => {
    await built?.dispose();
  });

  it.each(GAME_SYMBOLS)('%s: every file of the page lives under its own /play/<symbol>/ and is in the bundle', async (symbol) => {
    expect(await pathProblems(symbol, built.playDir(symbol))).toEqual([]);
  });

  it.each(GAME_SYMBOLS)('%s: the scripts carry the art credit and talk to the server', async (symbol) => {
    expect(await scriptProblems(built.playDir(symbol))).toEqual([]);
  });

  it.each(GAME_SYMBOLS)('%s: the title says nothing of a demo', async (symbol) => {
    expect(await titleProblems(built.playDir(symbol))).toEqual([]);
  });
});

describe('a bundle built with the wrong GAME_BASE', () => {
  const builds: BuiltGames[] = [];

  afterAll(async () => {
    await Promise.all(builds.map((build) => build.dispose()));
  });

  it.each(WRONG_BASES)('is found when GAME_BASE is $name', async ({ base }) => {
    const wrong = await buildWithBase(BUILT_SYMBOL, base);
    builds.push(wrong);

    const problems = await pathProblems(BUILT_SYMBOL, wrong.playDir(BUILT_SYMBOL));

    expect(problems.length).toBeGreaterThan(0);
    expect(problems.join('\n')).toContain(playBase(BUILT_SYMBOL));
  }, BUILD_TIMEOUT_MS);
});
