import { mkdtemp, readFile, rm, unlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as grpc from '@grpc/grpc-js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { parse } from 'yaml';
import { runUploadTiles } from '../scripts/upload-tiles';
import { GAMES } from '../src/games/registry';
import {
  DEFAULT_TILES_DIR,
  MAX_TILE_BYTES,
  TILE_IMAGE_KEY,
  TileFileError,
  TileUploadError,
  UploadTilesError,
  uploadTiles,
  type UploadTilesConfig,
} from '../src/tiles/uploadTiles';
import { startFakeCatalogServer, type FakeCatalogServer } from './helpers/fakeCatalogServer';

interface CatalogGame {
  readonly symbol: string;
  readonly identity: string;
}

interface Contract {
  readonly 'x-catalog': { readonly games: { readonly const: readonly CatalogGame[] } };
}

const CONTRACT_URL = new URL(
  '../../tasks/own-slots-or-free-pragmatic/from-origin/contract.openapi.yaml',
  import.meta.url,
);
const FIXTURE_TILE_URL = new URL('./fixtures/tile.webp', import.meta.url);
const CATALOG_KEY = 'cat-key';
const WRONG_KEY = 'wrong';
const EXPECTED_GAMES = 12;
const SYMBOLS = Object.keys(GAMES);

const contract = parse(await readFile(fileURLToPath(CONTRACT_URL), 'utf8')) as Contract;
const contractGames = contract['x-catalog'].games.const;
const knownIdentities = contractGames.map((game) => game.identity);
const fixtureTile = await readFile(fileURLToPath(FIXTURE_TILE_URL));

let hub: FakeCatalogServer;
let scratchDir: string;

function configFor(overrides: Partial<UploadTilesConfig> = {}): UploadTilesConfig {
  return {
    hubAddress: hub.address,
    credentials: grpc.credentials.createInsecure(),
    adminKey: CATALOG_KEY,
    tilesDir: DEFAULT_TILES_DIR,
    ...overrides,
  };
}

function environmentFor(overrides: NodeJS.ProcessEnv = {}): NodeJS.ProcessEnv {
  return {
    CATALOG_GRPC_ADDRESS: hub.address,
    HUB_GRPC_INSECURE: 'true',
    CATALOG_ADMIN_KEY: CATALOG_KEY,
    ...overrides,
  };
}

function tileBytesOf(symbol: string): Buffer {
  return Buffer.concat([fixtureTile, Buffer.from(symbol)]);
}

async function writeScratchTiles(): Promise<void> {
  await Promise.all(SYMBOLS.map((symbol) => writeFile(join(scratchDir, `${symbol}.webp`), tileBytesOf(symbol))));
}

async function rejectionOf(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise;
  } catch (error) {
    return error;
  }
  throw new Error('expected the promise to reject');
}

beforeEach(async () => {
  hub = await startFakeCatalogServer({ adminKey: CATALOG_KEY, knownIdentities });
  scratchDir = await mkdtemp(join(tmpdir(), 'tiles-'));
});

afterEach(async () => {
  hub.close();
  await rm(scratchDir, { recursive: true, force: true });
  vi.restoreAllMocks();
});

describe('uploadTiles', () => {
  it('sends one call per game of the registry with the hub identity, key 1x1, the tile bytes and the catalogue key', async () => {
    const uploaded = await uploadTiles(configFor());

    expect(hub.calls).toHaveLength(EXPECTED_GAMES);
    for (const [index, [symbol, game]] of Object.entries(GAMES).entries()) {
      const call = hub.calls[index];
      expect(call?.identity).toBe(game.identity);
      expect(call?.key).toBe('IMAGE_KEY_1X1');
      expect(call?.key).toBe(TILE_IMAGE_KEY);
      expect(call?.adminKey).toBe(CATALOG_KEY);
      expect(call?.file.equals(await readFile(join(DEFAULT_TILES_DIR, `${symbol}.webp`)))).toBe(true);
    }
    expect(uploaded.map((tile) => tile.symbol)).toEqual(SYMBOLS);
    expect(uploaded.every((tile) => tile.path.startsWith(`casino/game/${tile.identity}/1x1-`))).toBe(true);
  });

  it('sends the identity of the contract catalog and never the symbol', async () => {
    await uploadTiles(configFor());

    const sent = hub.calls.map((call) => call.identity);
    expect([...sent].sort()).toEqual([...knownIdentities].sort());
    expect(sent).toContain('apexslots_tropic_escape');
    expect(sent.some((identity) => SYMBOLS.includes(identity))).toBe(false);
    for (const game of contractGames) {
      expect(GAMES[game.symbol as keyof typeof GAMES].identity).toBe(game.identity);
    }
  });

  it('reads each tile from <tilesDir>/<symbol>.webp', async () => {
    await writeScratchTiles();

    await uploadTiles(configFor({ tilesDir: scratchDir }));

    for (const [index, symbol] of SYMBOLS.entries()) {
      expect(hub.calls[index]?.file.equals(tileBytesOf(symbol))).toBe(true);
    }
  });

  it('reports every finished upload to the caller as it happens', async () => {
    const seen: string[] = [];

    await uploadTiles(configFor({ onUploaded: (tile) => seen.push(tile.symbol) }));

    expect(seen).toEqual(SYMBOLS);
  });

  it('stops at the first wrong key answered UNAUTHENTICATED and names the symbol', async () => {
    const error = await rejectionOf(uploadTiles(configFor({ adminKey: WRONG_KEY })));

    expect(error).toBeInstanceOf(TileUploadError);
    const refusal = error as TileUploadError;
    expect(refusal.symbol).toBe(SYMBOLS[0]);
    expect(refusal.statusName).toBe('UNAUTHENTICATED');
    expect(refusal.hubCode).toBe('UNAUTHENTICATED');
    expect(refusal.message).toContain(SYMBOLS[0]);
    expect(refusal.message).toContain('UNAUTHENTICATED');
    expect(hub.calls).toHaveLength(1);
  });

  it('stops at the first game the hub does not know and names it', async () => {
    const stopsAt = 2;
    hub.close();
    hub = await startFakeCatalogServer({ adminKey: CATALOG_KEY, knownIdentities: knownIdentities.slice(0, stopsAt) });

    const error = await rejectionOf(uploadTiles(configFor()));

    expect(error).toBeInstanceOf(TileUploadError);
    expect((error as TileUploadError).symbol).toBe(SYMBOLS[stopsAt]);
    expect((error as TileUploadError).statusName).toBe('NOT_FOUND');
    expect(hub.calls).toHaveLength(stopsAt + 1);
  });

  it('stops before any upload when a tile file is missing and names the symbol', async () => {
    await writeScratchTiles();
    const missing = SYMBOLS[EXPECTED_GAMES - 1] as string;
    await unlink(join(scratchDir, `${missing}.webp`));

    const error = await rejectionOf(uploadTiles(configFor({ tilesDir: scratchDir })));

    expect(error).toBeInstanceOf(TileFileError);
    expect((error as TileFileError).symbol).toBe(missing);
    expect((error as TileFileError).message).toContain(missing);
    expect(hub.calls).toHaveLength(0);
  });

  it('stops before any upload when a tile is larger than the hub accepts', async () => {
    await writeScratchTiles();
    const oversized = SYMBOLS[0] as string;
    await writeFile(join(scratchDir, `${oversized}.webp`), Buffer.alloc(MAX_TILE_BYTES + 1));

    const error = await rejectionOf(uploadTiles(configFor({ tilesDir: scratchDir })));

    expect(error).toBeInstanceOf(TileFileError);
    expect((error as TileFileError).symbol).toBe(oversized);
    expect(hub.calls).toHaveLength(0);
  });

  it('stops with UNAVAILABLE and names the symbol when the hub does not answer', async () => {
    hub.close();

    const error = await rejectionOf(uploadTiles(configFor()));

    expect(error).toBeInstanceOf(TileUploadError);
    expect((error as TileUploadError).symbol).toBe(SYMBOLS[0]);
    expect((error as TileUploadError).statusName).toBe('UNAVAILABLE');
    expect((error as TileUploadError).hubCode).toBeUndefined();
  });

  it('makes every failure an UploadTilesError', async () => {
    await expect(uploadTiles(configFor({ adminKey: WRONG_KEY }))).rejects.toBeInstanceOf(UploadTilesError);
    await expect(uploadTiles(configFor({ tilesDir: scratchDir }))).rejects.toBeInstanceOf(UploadTilesError);
  });
});

describe('runUploadTiles', () => {
  it('uploads the twelve tiles and exits 0', async () => {
    const lines: string[] = [];

    const exitCode = await runUploadTiles(environmentFor(), (line) => lines.push(line));

    expect(exitCode).toBe(0);
    expect(hub.calls).toHaveLength(EXPECTED_GAMES);
    expect(lines).toHaveLength(EXPECTED_GAMES + 1);
    expect(lines[0]).toContain(`${SYMBOLS[0]} as ${GAMES[SYMBOLS[0] as keyof typeof GAMES].identity}`);
  });

  it('exits non-zero naming the symbol when the catalogue key is wrong', async () => {
    const lines: string[] = [];

    const exitCode = await runUploadTiles(environmentFor({ CATALOG_ADMIN_KEY: WRONG_KEY }), (line) => lines.push(line));

    expect(exitCode).not.toBe(0);
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain(SYMBOLS[0]);
    expect(lines[0]).toContain('UNAUTHENTICATED');
    expect(hub.calls).toHaveLength(1);
  });

  it('exits non-zero before any upload when a tile file is missing', async () => {
    const lines: string[] = [];

    const exitCode = await runUploadTiles(environmentFor({ TILES_DIR: scratchDir }), (line) => lines.push(line));

    expect(exitCode).not.toBe(0);
    expect(lines[0]).toContain(SYMBOLS[0]);
    expect(hub.calls).toHaveLength(0);
  });

  it('exits non-zero naming every missing setting and calls nobody', async () => {
    const lines: string[] = [];

    const exitCode = await runUploadTiles({}, (line) => lines.push(line));

    expect(exitCode).not.toBe(0);
    expect(lines[0]).toContain('CATALOG_GRPC_ADDRESS');
    expect(lines[0]).toContain('CATALOG_ADMIN_KEY');
    expect(hub.calls).toHaveLength(0);
  });

  it('treats HUB_GRPC_ADDRESS alone as a missing CATALOG_GRPC_ADDRESS', async () => {
    const lines: string[] = [];

    const exitCode = await runUploadTiles(
      environmentFor({ CATALOG_GRPC_ADDRESS: undefined, HUB_GRPC_ADDRESS: hub.address }),
      (line) => lines.push(line),
    );

    expect(exitCode).not.toBe(0);
    expect(lines[0]).toContain('CATALOG_GRPC_ADDRESS');
    expect(lines[0]).not.toContain('CATALOG_ADMIN_KEY');
    expect(hub.calls).toHaveLength(0);
  });

  it('expects TLS unless HUB_GRPC_INSECURE is true', async () => {
    const lines: string[] = [];

    const exitCode = await runUploadTiles(environmentFor({ HUB_GRPC_INSECURE: undefined }), (line) => lines.push(line));

    expect(exitCode).not.toBe(0);
    expect(lines[0]).toContain(SYMBOLS[0]);
    expect(hub.calls).toHaveLength(0);
  });

  it('writes its lines to stderr by default', async () => {
    const written: string[] = [];
    vi.spyOn(process.stderr, 'write').mockImplementation((chunk: string | Uint8Array) => {
      written.push(String(chunk));
      return true;
    });

    const exitCode = await runUploadTiles(environmentFor({ TILES_DIR: scratchDir }));

    expect(exitCode).not.toBe(0);
    expect(written.join('')).toContain(SYMBOLS[0]);
  });

  it('lets an error that is not an upload failure escape', async () => {
    await expect(runUploadTiles(environmentFor({ CATALOG_ADMIN_KEY: 'ключ' }), () => undefined)).rejects.toThrow();
    expect(hub.calls).toHaveLength(0);
  });
});
