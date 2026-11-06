import { afterEach, describe, expect, it, vi } from 'vitest';
import { RANDOM_BUFFER_LENGTH, createSecureRng } from '../src/rng';

const LARGEST_UINT32 = 0xffffffff;
const UINT32_RANGE = 2 ** 32;
const SAMPLE_SIZE = 5000;

function fillWith(value: number): (buffer: Uint32Array) => void {
  return (buffer) => {
    buffer.fill(value);
  };
}

describe('createSecureRng', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('yields a number below 1 when the source returns the largest 32-bit value', () => {
    const rng = createSecureRng(fillWith(LARGEST_UINT32));

    expect(rng.next()).toBe(LARGEST_UINT32 / UINT32_RANGE);
    expect(rng.next()).toBeLessThan(1);
  });

  it('yields 0 when the source returns 0', () => {
    expect(createSecureRng(fillWith(0)).next()).toBe(0);
  });

  it('asks the source for a fresh buffer only after the previous one is used up', () => {
    const fill = vi.fn(fillWith(1));
    const rng = createSecureRng(fill);

    for (let draw = 0; draw < RANDOM_BUFFER_LENGTH; draw++) rng.next();
    expect(fill).toHaveBeenCalledTimes(1);

    rng.next();
    expect(fill).toHaveBeenCalledTimes(2);
  });

  it('hands the source a buffer of the declared length', () => {
    const lengths: number[] = [];
    const rng = createSecureRng((buffer) => {
      lengths.push(buffer.length);
    });

    rng.next();

    expect(lengths).toEqual([RANDOM_BUFFER_LENGTH]);
  });

  it('draws from crypto.getRandomValues by default and stays inside [0, 1)', () => {
    const getRandomValues = vi.spyOn(crypto, 'getRandomValues');
    const rng = createSecureRng();

    const draws = Array.from({ length: SAMPLE_SIZE }, () => rng.next());

    expect(getRandomValues).toHaveBeenCalled();
    expect(draws.every((draw) => draw >= 0 && draw < 1)).toBe(true);
    expect(new Set(draws).size).toBeGreaterThan(SAMPLE_SIZE - 10);
  });
});
