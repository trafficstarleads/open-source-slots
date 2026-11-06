import { createHash } from 'node:crypto';
import * as grpc from '@grpc/grpc-js';
import { ADMIN_KEY_METADATA, ERROR_CODE_METADATA, loadGameService } from '../../src/tiles/uploadTiles';

const LOOPBACK_ANY_PORT = '127.0.0.1:0';
const UNSPECIFIED_IMAGE_KEY = 'IMAGE_KEY_UNSPECIFIED';
const PATH_DIGEST_LENGTH = 12;
const IMAGE_KEY_LABEL = '1x1';

export interface FakeCatalogCall {
  readonly identity: string;
  readonly key: string;
  readonly file: Buffer;
  readonly adminKey: string | undefined;
}

export interface FakeCatalogOptions {
  readonly adminKey: string;
  readonly knownIdentities: readonly string[];
}

export interface FakeCatalogServer {
  readonly address: string;
  readonly calls: FakeCatalogCall[];
  readonly close: () => void;
}

interface UpdateImageRequest {
  readonly identity: string;
  readonly key: string;
  readonly file: Buffer;
}

interface UpdateImageResponse {
  readonly path: string;
}

function refusal(code: grpc.status, hubCode: string, details: string): grpc.ServiceError {
  const metadata = new grpc.Metadata();
  metadata.set(ERROR_CODE_METADATA, hubCode);
  return Object.assign(new Error(details), { code, details, metadata });
}

function presentedKey(metadata: grpc.Metadata): string | undefined {
  const [value] = metadata.get(ADMIN_KEY_METADATA);
  return typeof value === 'string' ? value : undefined;
}

export async function startFakeCatalogServer(options: FakeCatalogOptions): Promise<FakeCatalogServer> {
  const calls: FakeCatalogCall[] = [];
  const server = new grpc.Server();

  const updateImage: grpc.handleUnaryCall<UpdateImageRequest, UpdateImageResponse> = (call, callback) => {
    const { identity, key, file } = call.request;
    const adminKey = presentedKey(call.metadata);
    calls.push({ identity, key, file, adminKey });

    if (adminKey !== options.adminKey) {
      callback(refusal(grpc.status.UNAUTHENTICATED, 'UNAUTHENTICATED', 'operator not recognised'));
    } else if (key === UNSPECIFIED_IMAGE_KEY || file.length === 0) {
      callback(refusal(grpc.status.INVALID_ARGUMENT, 'BAD_REQUEST', 'image key or file is not set'));
    } else if (!options.knownIdentities.includes(identity)) {
      callback(refusal(grpc.status.NOT_FOUND, 'NOT_FOUND', `no game ${identity}`));
    } else {
      const digest = createHash('sha256').update(file).digest('hex').slice(0, PATH_DIGEST_LENGTH);
      callback(null, { path: `casino/game/${identity}/${IMAGE_KEY_LABEL}-${digest}.webp` });
    }
  };

  server.addService(loadGameService().service, { UpdateImage: updateImage });

  const port = await new Promise<number>((resolve, reject) => {
    server.bindAsync(LOOPBACK_ANY_PORT, grpc.ServerCredentials.createInsecure(), (error, boundPort) => {
      if (error === null) resolve(boundPort);
      else reject(error);
    });
  });

  return { address: `127.0.0.1:${port}`, calls, close: () => server.forceShutdown() };
}
