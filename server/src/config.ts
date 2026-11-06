import { resolve } from 'node:path';

export const DEFAULT_PORT = 3000;
const MAX_PORT = 65_535;
const DEFAULT_HUB_PARTNER = 'ownslots';
const DEFAULT_PUBLIC_DIR = 'public';
const DEFAULT_LOG_LEVEL = 'info';
const DEFAULT_HUB_CALL_TIMEOUT_MS = 10_000;
const MAX_HUB_CALL_TIMEOUT_MS = 600_000;
const REQUIRED_SETTINGS = ['FRAME_ANCESTORS', 'HUB_SECRET_KEY', 'HUB_BASE_URL'] as const;
const HUB_URL_PROTOCOLS: readonly string[] = ['http:', 'https:'];
const TRAILING_SLASHES = /\/+$/;
const WHOLE_NUMBER = /^\d+$/;

type RequiredSetting = (typeof REQUIRED_SETTINGS)[number];

export class ConfigError extends Error {}

export interface HubSettings {
  readonly baseUrl: string;
  readonly partner: string;
  readonly secretKey: string;
  readonly callTimeoutMs: number;
}

export interface AppConfig {
  readonly port: number;
  readonly publicDir: string;
  readonly frameAncestors: string;
  readonly logLevel: string;
  readonly hub: HubSettings;
}

function read(env: NodeJS.ProcessEnv, name: string): string | undefined {
  const value = env[name]?.trim();
  return value ? value : undefined;
}

function readRequired(env: NodeJS.ProcessEnv): Readonly<Record<RequiredSetting, string>> {
  const values = {} as Record<RequiredSetting, string>;
  const missing: RequiredSetting[] = [];
  for (const name of REQUIRED_SETTINGS) {
    const value = read(env, name);
    if (value === undefined) {
      missing.push(name);
    } else {
      values[name] = value;
    }
  }
  if (missing.length > 0) {
    throw new ConfigError(`missing required settings: ${missing.join(', ')}`);
  }
  return values;
}

function readWholeNumber(env: NodeJS.ProcessEnv, name: string, fallback: number, min: number, max: number): number {
  const raw = read(env, name);
  if (raw === undefined) {
    return fallback;
  }
  const value = WHOLE_NUMBER.test(raw) ? Number(raw) : Number.NaN;
  if (!(value >= min && value <= max)) {
    throw new ConfigError(`${name} must be a whole number from ${min} to ${max}`);
  }
  return value;
}

function normalizeHubBaseUrl(raw: string): string {
  if (!URL.canParse(raw) || !HUB_URL_PROTOCOLS.includes(new URL(raw).protocol)) {
    throw new ConfigError('HUB_BASE_URL must be an http or https address');
  }
  return raw.replace(TRAILING_SLASHES, '');
}

function loadHubSettings(env: NodeJS.ProcessEnv, required: Readonly<Record<RequiredSetting, string>>): HubSettings {
  return Object.freeze({
    baseUrl: normalizeHubBaseUrl(required.HUB_BASE_URL),
    partner: read(env, 'HUB_PARTNER') ?? DEFAULT_HUB_PARTNER,
    secretKey: required.HUB_SECRET_KEY,
    callTimeoutMs: readWholeNumber(env, 'HUB_CALL_TIMEOUT_MS', DEFAULT_HUB_CALL_TIMEOUT_MS, 1, MAX_HUB_CALL_TIMEOUT_MS),
  });
}

export function loadConfig(env: NodeJS.ProcessEnv): AppConfig {
  const required = readRequired(env);
  return Object.freeze({
    port: readWholeNumber(env, 'PORT', DEFAULT_PORT, 0, MAX_PORT),
    publicDir: resolve(read(env, 'PUBLIC_DIR') ?? DEFAULT_PUBLIC_DIR),
    frameAncestors: required.FRAME_ANCESTORS,
    logLevel: read(env, 'LOG_LEVEL') ?? DEFAULT_LOG_LEVEL,
    hub: loadHubSettings(env, required),
  });
}
