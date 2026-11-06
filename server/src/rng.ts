import type { RNG } from '../../stellar-sevens/src/engine/rng';

export type FillRandom = (buffer: Uint32Array) => void;

export const RANDOM_BUFFER_LENGTH = 1024;
const UINT32_RANGE = 2 ** 32;

function fillFromCrypto(buffer: Uint32Array): void {
  crypto.getRandomValues(buffer);
}

function* uint32Draws(fill: FillRandom): Generator<number, never, undefined> {
  const buffer = new Uint32Array(RANDOM_BUFFER_LENGTH);
  for (;;) {
    fill(buffer);
    yield* buffer;
  }
}

export function createSecureRng(fill: FillRandom = fillFromCrypto): RNG {
  const draws = uint32Draws(fill);
  return {
    next: () => draws.next().value / UINT32_RANGE,
  };
}
