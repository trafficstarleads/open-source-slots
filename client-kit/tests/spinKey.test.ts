import { afterEach, describe, expect, it, vi } from 'vitest';
import { createMemoryStore, createSpinKeyStore, sessionStore } from '../src/spinKey';

const GAME = 'stellar-sevens';
const OTHER_GAME = 'nitro-hot';
const TOKEN = 'tk-a';
const OTHER_TOKEN = 'tk-b';
const SPIN = { key: 'key-1', betCents: 60 } as const;

afterEach(() => {
  vi.restoreAllMocks();
});

describe('spin key store', () => {
  it('keeps the key and the bet until it is cleared', () => {
    const spins = createSpinKeyStore(createMemoryStore(), GAME, TOKEN);
    expect(spins.load()).toBeUndefined();

    spins.save(SPIN);
    expect(spins.load()).toEqual(SPIN);
    expect(spins.load()).toEqual(SPIN);

    spins.clear();
    expect(spins.load()).toBeUndefined();
  });

  it('is scoped by game and by token', () => {
    const store = createMemoryStore();
    createSpinKeyStore(store, GAME, TOKEN).save(SPIN);

    expect(createSpinKeyStore(store, OTHER_GAME, TOKEN).load()).toBeUndefined();
    expect(createSpinKeyStore(store, GAME, OTHER_TOKEN).load()).toBeUndefined();
    expect(createSpinKeyStore(store, GAME, TOKEN).load()).toEqual(SPIN);
  });

  it('survives a reload because it lives in the tab storage', () => {
    createSpinKeyStore(sessionStore(window), GAME, TOKEN).save(SPIN);
    expect(createSpinKeyStore(sessionStore(window), GAME, TOKEN).load()).toEqual(SPIN);
    createSpinKeyStore(sessionStore(window), GAME, TOKEN).clear();
  });

  it.each([
    ['text that is not JSON', 'not json'],
    ['a JSON value that is not a spin', '[1]'],
    ['JSON null', 'null'],
    ['a JSON number', '5'],
    ['a spin without a key', JSON.stringify({ betCents: 60 })],
    ['a spin with an empty key', JSON.stringify({ key: '', betCents: 60 })],
    ['a zero bet', JSON.stringify({ key: 'k', betCents: 0 })],
    ['a fractional bet', JSON.stringify({ key: 'k', betCents: 0.5 })],
    ['a bet written as text', JSON.stringify({ key: 'k', betCents: '60' })],
  ])('drops a stored value that is %s', (_name, stored) => {
    const store = createMemoryStore();
    const spins = createSpinKeyStore(store, GAME, TOKEN);
    spins.save(SPIN);
    const storageKey = `apex:spin:${GAME}:${TOKEN}`;
    store.setItem(storageKey, stored);
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    expect(spins.load()).toBeUndefined();
    expect(store.getItem(storageKey)).toBeNull();
  });
});

describe('tab storage', () => {
  it('is the session storage of the window when it works', () => {
    const store = sessionStore(window);
    store.setItem('probe-1', 'x');
    expect(window.sessionStorage.getItem('probe-1')).toBe('x');
    store.removeItem('probe-1');
    expect(window.sessionStorage.getItem('probe-1')).toBeNull();
  });

  it('falls back to memory when the window refuses its session storage', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const blocked = {
      get sessionStorage(): Storage {
        throw new DOMException('blocked', 'SecurityError');
      },
    };

    const store = sessionStore(blocked);
    store.setItem('probe-2', 'y');

    expect(store.getItem('probe-2')).toBe('y');
    expect(warn).toHaveBeenCalled();
  });

  it('falls back to memory when the session storage refuses a write', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const full = {
      getItem: () => null,
      removeItem: () => undefined,
      setItem: () => {
        throw new DOMException('full', 'QuotaExceededError');
      },
    };

    const store = sessionStore({ sessionStorage: full as unknown as Storage });
    store.setItem('probe-3', 'z');

    expect(store.getItem('probe-3')).toBe('z');
    expect(warn).toHaveBeenCalled();
  });

  it('memory store reads null for what it does not hold', () => {
    const store = createMemoryStore();
    expect(store.getItem('nothing')).toBeNull();
    store.setItem('one', '1');
    store.removeItem('one');
    expect(store.getItem('one')).toBeNull();
  });
});
