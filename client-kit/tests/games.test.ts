import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { BET_LADDER_CENTS } from '../../server/src/games/ladder';
import { toCents } from '../src';
import { MIGRATED_GAMES } from './migratedGames';

const REPO_ROOT = resolve(import.meta.dirname, '..', '..');
const ART_CREDIT = 'Art by APEXSLOTS (apexslots.eu), CC BY 4.0';
const KIT_IMPORT = "'../../../client-kit/src'";
const TOP_BET_CENTS = 1_000;
const BET_LIST = /const BETS(?::[^=]+)? = \[([^\]]*)\]/;

function gameFile(game: string, relativePath: string): string {
  return readFileSync(join(REPO_ROOT, game, relativePath), 'utf8');
}

function gameSources(game: string): readonly { readonly name: string; readonly text: string }[] {
  const folder = join(REPO_ROOT, game, 'src', 'game');
  return readdirSync(folder)
    .filter((name) => name.endsWith('.ts'))
    .map((name) => ({ name, text: readFileSync(join(folder, name), 'utf8') }));
}

function betsOf(hud: string): readonly number[] {
  const list = BET_LIST.exec(hud)?.[1];
  if (list === undefined) {
    throw new Error('hud.ts has no const BETS list');
  }
  return list.split(',').map((item) => item.trim()).filter((item) => item !== '').map(Number);
}

describe('the list of migrated games', () => {
  it('names game folders once each', () => {
    expect(MIGRATED_GAMES.length).toBeGreaterThan(0);
    expect(new Set(MIGRATED_GAMES).size).toBe(MIGRATED_GAMES.length);
    MIGRATED_GAMES.forEach((game) => expect(existsSync(join(REPO_ROOT, game, 'src', 'game', 'main.ts'))).toBe(true));
  });
});

describe.each(MIGRATED_GAMES)('game window %s', (game) => {
  it('reaches the kit through its wallet.ts and names itself', () => {
    const wallet = gameFile(game, 'src/game/wallet.ts');

    expect(wallet).toContain(KIT_IMPORT);
    expect(wallet).toContain(`export const GAME = '${game}';`);
  });

  it('has no local play: no engine dealer, no seed, no demo switch, no call outside the kit', () => {
    const sources = gameSources(game);

    sources.forEach(({ name, text }) => {
      expect(text, `${name} plays a round`).not.toMatch(/\b(playRound|mulberry32|randomSeed)\b/);
      expect(text, `${name} knows a demo`).not.toMatch(/\bREAL\b|\bDEMO\b|tellLowBalance/);
      expect(text, `${name} calls the server by itself`).not.toMatch(/\bfetch\(|\/api\/game\//);
      expect(text, `${name} posts the old message`).not.toContain('apex:low-balance');
      expect(text, `${name} reads held or pending`).not.toMatch(/\.(held|pending)\b/);
    });
    expect(gameFile(game, 'src/game/main.ts')).not.toMatch(/Math\.random|deliver/);
  });

  it('plays only through the wallet, shows the credited win and posts the deposit message', () => {
    const main = gameFile(game, 'src/game/main.ts');

    expect(main).toContain('wallet.clearToSpin(');
    expect(main).toContain('wallet.spin(');
    expect(main).toContain('roundView(');
    expect(main).toContain('postDeposit(');
    expect(main).not.toMatch(/totalWin\s*\*/);
  });

  it('offers the bets of the server ladder up to 10.00 and not 15', () => {
    const bets = betsOf(gameFile(game, 'src/game/hud.ts'));
    const cents = bets.map(toCents);

    expect(bets).toContain(10);
    expect(bets).not.toContain(15);
    expect(Math.max(...cents)).toBe(TOP_BET_CENTS);
    cents.forEach((bet) => expect(BET_LADDER_CENTS).toContain(bet));
  });

  it('shows the art credit once on the information screen', () => {
    const info = gameFile(game, 'src/game/gameinfo.ts');

    expect(info.split(ART_CREDIT)).toHaveLength(2);
  });

  it('has a title without Demo', () => {
    const title = /<title>([^<]*)<\/title>/.exec(gameFile(game, 'index.html'))?.[1];

    expect(title).toBeDefined();
    expect(title).not.toMatch(/demo/i);
  });

  it('styles the deposit button and the credit-pending marker', () => {
    const style = gameFile(game, 'src/game/style.css');

    expect(style).toContain('#deposit-btn');
    expect(style).toContain('.credit-pending');
  });
});
