import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { parse } from 'yaml';
import { createWallet, DEPOSIT_MESSAGE_TYPE, postDeposit, type WalletEnvironment } from '../src';
import { createMemoryStore } from '../src/spinKey';

const REPO_ROOT = resolve(import.meta.dirname, '..', '..');
const CONTRACT_PATH = join(REPO_ROOT, 'tasks', 'own-slots-or-free-pragmatic', 'from-origin', 'contract.openapi.yaml');
const FIXTURE_PATH = join(REPO_ROOT, 'server', 'tests', 'fixtures', 'deposit_message.json');

interface DepositSchema {
  readonly required: readonly string[];
  readonly properties: { readonly type: { readonly const: string } };
}

function depositSchema(): DepositSchema {
  const contract = parse(readFileSync(CONTRACT_PATH, 'utf8')) as {
    components: { schemas: { DepositMessage: DepositSchema } };
  };
  return contract.components.schemas.DepositMessage;
}

function postedMessage(): unknown {
  const parent = { postMessage: vi.fn() };
  postDeposit(parent);
  return parent.postMessage.mock.calls[0]?.[0];
}

afterEach(() => {
  vi.restoreAllMocks();
  window.history.replaceState(null, '', '/');
});

describe('deposit message', () => {
  it('posts the type of the contract to every origin', () => {
    const parent = { postMessage: vi.fn() };

    postDeposit(parent);

    expect(parent.postMessage).toHaveBeenCalledTimes(1);
    expect(parent.postMessage).toHaveBeenCalledWith({ type: 'apex:deposit' }, '*');
  });

  it('validates against the DepositMessage schema of the contract', () => {
    const schema = depositSchema();
    const message = postedMessage() as Record<string, unknown>;

    schema.required.forEach((field) => expect(message).toHaveProperty(field));
    expect(message.type).toBe(schema.properties.type.const);
    expect(DEPOSIT_MESSAGE_TYPE).toBe(schema.properties.type.const);
  });

  it('equals the fixture the server tests check against the contract', () => {
    expect(postedMessage()).toEqual(JSON.parse(readFileSync(FIXTURE_PATH, 'utf8')));
  });

  it.each([
    ['empty', ''],
    ['a path', 'https://casino.example.com/lobby/page'],
    ['a www host', 'https://www.example.com'],
    ['the address of the frame itself', 'http://localhost:3000/play/stellar-sevens'],
  ])('goes to target origin * when lobby is %s', (_name, lobby) => {
    window.history.replaceState(null, '', `/?token=tk-a&lobby=${encodeURIComponent(lobby)}`);
    const parent = { postMessage: vi.fn() };

    postDeposit(parent);

    expect(parent.postMessage).toHaveBeenCalledWith({ type: 'apex:deposit' }, '*');
  });

  it('is not posted by a refusal for low balance alone', async () => {
    const post = vi.spyOn(window, 'postMessage').mockImplementation(() => undefined);
    const environment: WalletEnvironment = {
      search: '?token=tk-a',
      store: createMemoryStore(),
      send: () => Promise.resolve(Response.json({ ok: true, balanceCents: 5 })),
      sleep: () => Promise.resolve(),
      newKey: () => 'key-1',
    };
    const wallet = createWallet('stellar-sevens', environment);

    const clearance = await wallet.clearToSpin(5, 100);

    expect(clearance.kind).toBe('refused');
    expect(post).not.toHaveBeenCalled();
  });
});
