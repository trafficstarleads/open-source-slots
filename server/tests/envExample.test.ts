import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { loadUploadSettings } from '../scripts/upload-tiles';
import { loadConfig } from '../src/config';

const EXAMPLE = readFileSync(fileURLToPath(new URL('../.env.example', import.meta.url)), 'utf8');
const ASSIGNMENT = /^#?\s*([A-Z][A-Z0-9_]*)=/gm;
const SERVER_REQUIRED_VALUES: Readonly<Record<string, string>> = {
  FRAME_ANCESTORS: 'https://casino.example.com',
  HUB_SECRET_KEY: 's3cret',
  HUB_BASE_URL: 'https://hub.example.com',
  DATABASE_URL: 'postgres://app@db.example.com:5432/slots',
};
const UPLOAD_REQUIRED_VALUES: Readonly<Record<string, string>> = {
  HUB_GRPC_ADDRESS: 'hub.example.com:9090',
  CATALOG_ADMIN_KEY: 's3cret',
};

function settingsRead(requiredValues: Readonly<Record<string, string>>, load: (env: NodeJS.ProcessEnv) => unknown): string[] {
  const read = new Set<string>();
  const env = new Proxy({} as NodeJS.ProcessEnv, {
    get: (_target, name) => {
      if (typeof name !== 'string') return undefined;
      read.add(name);
      return requiredValues[name];
    },
  });
  load(env);
  return [...read].sort();
}

function namesInExample(): string[] {
  return [...EXAMPLE.matchAll(ASSIGNMENT)].map((match) => match[1] as string).sort();
}

describe('server/.env.example', () => {
  it('names every setting the server and the upload script read, and no other', () => {
    const read = [
      ...settingsRead(SERVER_REQUIRED_VALUES, loadConfig),
      ...settingsRead(UPLOAD_REQUIRED_VALUES, loadUploadSettings),
    ].sort();

    expect(namesInExample()).toEqual(read);
  });
});
