import { readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as grpc from '@grpc/grpc-js';
import * as protoLoader from '@grpc/proto-loader';
import { GAMES } from '../games/registry';

export const CATALOG_PROTO_PATH = fileURLToPath(new URL('../../proto/catalog.proto', import.meta.url));
export const DEFAULT_TILES_DIR = fileURLToPath(new URL('../../../tiles', import.meta.url));
export const ADMIN_KEY_METADATA = 'x-catalog-admin-key';
export const ERROR_CODE_METADATA = 'x-error-code';
export const TILE_IMAGE_KEY = 'IMAGE_KEY_1X1';
export const TILE_EXTENSION = '.webp';
export const MAX_TILE_BYTES = 10 * 1024 * 1024;
export const UPLOAD_DEADLINE_MS = 30_000;

export interface UploadTilesConfig {
  readonly hubAddress: string;
  readonly credentials: grpc.ChannelCredentials;
  readonly adminKey: string;
  readonly tilesDir: string;
  readonly onUploaded?: (tile: UploadedTile) => void;
}

export interface UploadedTile {
  readonly symbol: string;
  readonly identity: string;
  readonly path: string;
}

interface Tile {
  readonly symbol: string;
  readonly identity: string;
  readonly file: Buffer;
}

interface UpdateGameImageRequest {
  readonly identity: string;
  readonly key: typeof TILE_IMAGE_KEY;
  readonly file: Buffer;
}

interface UpdateImageResponse {
  readonly path: string;
}

interface GameImageClient {
  close(): void;
  UpdateImage(
    request: UpdateGameImageRequest,
    metadata: grpc.Metadata,
    options: grpc.CallOptions,
    callback: (error: grpc.ServiceError | null, response: UpdateImageResponse) => void,
  ): void;
}

export class UploadTilesError extends Error {}

export class TileFileError extends UploadTilesError {
  constructor(
    readonly symbol: string,
    reason: string,
  ) {
    super(`tile of ${symbol} cannot be uploaded: ${reason}`);
  }
}

export class TileUploadError extends UploadTilesError {
  constructor(
    readonly symbol: string,
    readonly identity: string,
    readonly statusName: string,
    readonly hubCode: string | undefined,
    details: string,
  ) {
    super(`upload of the tile of ${symbol} (${identity}) failed: ${statusName}${hubCode === undefined ? '' : ` ${hubCode}`}: ${details}`);
  }
}

interface CatalogPackage {
  readonly gamehub: { readonly v1: { readonly GameService: grpc.ServiceClientConstructor } };
}

export function loadGameService(): grpc.ServiceClientConstructor {
  const definition = protoLoader.loadSync(CATALOG_PROTO_PATH, { keepCase: true, enums: String, defaults: true });
  return (grpc.loadPackageDefinition(definition) as unknown as CatalogPackage).gamehub.v1.GameService;
}

function fileFailureReason(error: unknown): string {
  return error instanceof Error && 'code' in error && typeof error.code === 'string' ? error.code : 'unreadable';
}

async function readTile(tilesDir: string, symbol: string, identity: string): Promise<Tile> {
  const path = join(tilesDir, `${symbol}${TILE_EXTENSION}`);
  try {
    const { size } = await stat(path);
    if (size > MAX_TILE_BYTES) throw new TileFileError(symbol, `${path} is ${size} bytes, the hub takes at most ${MAX_TILE_BYTES}`);
    return { symbol, identity, file: await readFile(path) };
  } catch (error) {
    if (error instanceof TileFileError) throw error;
    throw new TileFileError(symbol, `${path} cannot be read (${fileFailureReason(error)})`);
  }
}

function sendTile(client: GameImageClient, tile: Tile, metadata: grpc.Metadata): Promise<UploadedTile> {
  const request: UpdateGameImageRequest = { identity: tile.identity, key: TILE_IMAGE_KEY, file: tile.file };
  const options: grpc.CallOptions = { deadline: Date.now() + UPLOAD_DEADLINE_MS };
  return new Promise((resolve, reject) => {
    client.UpdateImage(request, metadata, options, (error, response) => {
      if (error === null) {
        resolve({ symbol: tile.symbol, identity: tile.identity, path: response.path });
        return;
      }
      const [hubCode] = error.metadata.get(ERROR_CODE_METADATA);
      reject(
        new TileUploadError(
          tile.symbol,
          tile.identity,
          grpc.status[error.code] ?? String(error.code),
          typeof hubCode === 'string' ? hubCode : undefined,
          error.details,
        ),
      );
    });
  });
}

export async function uploadTiles(config: UploadTilesConfig): Promise<readonly UploadedTile[]> {
  const tiles: Tile[] = [];
  for (const [symbol, game] of Object.entries(GAMES)) {
    tiles.push(await readTile(config.tilesDir, symbol, game.identity));
  }
  const metadata = new grpc.Metadata();
  metadata.set(ADMIN_KEY_METADATA, config.adminKey);
  const GameServiceClient = loadGameService();
  const client = new GameServiceClient(config.hubAddress, config.credentials) as unknown as GameImageClient;
  const uploaded: UploadedTile[] = [];
  try {
    for (const tile of tiles) {
      const result = await sendTile(client, tile, metadata);
      uploaded.push(result);
      config.onUploaded?.(result);
    }
  } finally {
    client.close();
  }
  return uploaded;
}
