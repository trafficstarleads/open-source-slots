export type KeyValueStore = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

export interface PendingSpin {
  readonly key: string;
  readonly betCents: number;
}

export interface SpinKeyStore {
  load(): PendingSpin | undefined;
  save(spin: PendingSpin): void;
  clear(): void;
}

const STORAGE_PREFIX = 'apex:spin';
const PROBE_KEY = 'apex:probe';
const PROBE_VALUE = '1';

function isPendingSpin(value: unknown): value is PendingSpin {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const { key, betCents } = value as Record<string, unknown>;
  return typeof key === 'string' && key !== '' && Number.isSafeInteger(betCents) && (betCents as number) > 0;
}

export function createMemoryStore(): KeyValueStore {
  const values = new Map<string, string>();
  return {
    getItem: (name) => values.get(name) ?? null,
    setItem: (name, value) => {
      values.set(name, value);
    },
    removeItem: (name) => {
      values.delete(name);
    },
  };
}

export function sessionStore(owner: Pick<Window, 'sessionStorage'>): KeyValueStore {
  try {
    const store = owner.sessionStorage;
    store.setItem(PROBE_KEY, PROBE_VALUE);
    store.removeItem(PROBE_KEY);
    return store;
  } catch (error) {
    console.warn('The tab storage is not available, the spin key is kept in memory only.', error);
    return createMemoryStore();
  }
}

export function createSpinKeyStore(store: KeyValueStore, game: string, token: string): SpinKeyStore {
  const storageKey = `${STORAGE_PREFIX}:${game}:${token}`;
  return {
    load() {
      const stored = store.getItem(storageKey);
      if (stored === null) {
        return undefined;
      }
      try {
        const spin: unknown = JSON.parse(stored);
        if (isPendingSpin(spin)) {
          return { key: spin.key, betCents: spin.betCents };
        }
      } catch (error) {
        console.warn('The stored spin key is unreadable and is dropped.', error);
      }
      store.removeItem(storageKey);
      return undefined;
    },
    save(spin) {
      store.setItem(storageKey, JSON.stringify(spin));
    },
    clear() {
      store.removeItem(storageKey);
    },
  };
}
