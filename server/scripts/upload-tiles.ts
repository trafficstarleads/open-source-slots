import * as grpc from '@grpc/grpc-js';
import { isEntryPoint } from '../src/entry';
import {
  DEFAULT_TILES_DIR,
  UploadTilesError,
  uploadTiles,
  type UploadTilesConfig,
} from '../src/tiles/uploadTiles';

const EXIT_OK = 0;
const EXIT_FAILED = 1;
const PLAINTEXT_FLAG = 'true';
const REQUIRED_SETTINGS = ['HUB_GRPC_ADDRESS', 'CATALOG_ADMIN_KEY'] as const;

export class UploadSettingsError extends UploadTilesError {}

export function loadUploadSettings(env: NodeJS.ProcessEnv): UploadTilesConfig {
  const { HUB_GRPC_ADDRESS: hubAddress, CATALOG_ADMIN_KEY: adminKey } = env;
  if (!hubAddress || !adminKey) {
    const missing = REQUIRED_SETTINGS.filter((name) => !env[name]);
    throw new UploadSettingsError(`missing settings: ${missing.join(', ')}`);
  }

  return {
    hubAddress,
    adminKey,
    credentials: env.HUB_GRPC_INSECURE === PLAINTEXT_FLAG ? grpc.credentials.createInsecure() : grpc.credentials.createSsl(),
    tilesDir: env.TILES_DIR || DEFAULT_TILES_DIR,
  };
}

export function writeStderrLine(line: string): void {
  process.stderr.write(`${line}\n`);
}

export async function runUploadTiles(
  env: NodeJS.ProcessEnv,
  report: (line: string) => void = writeStderrLine,
): Promise<number> {
  try {
    const uploaded = await uploadTiles({
      ...loadUploadSettings(env),
      onUploaded: (tile) => report(`uploaded ${tile.symbol} as ${tile.identity}: ${tile.path}`),
    });
    report(`uploaded ${uploaded.length} tiles`);
    return EXIT_OK;
  } catch (error) {
    if (!(error instanceof UploadTilesError)) throw error;
    report(error.message);
    return EXIT_FAILED;
  }
}

if (isEntryPoint(import.meta.url)) process.exitCode = await runUploadTiles(process.env);
