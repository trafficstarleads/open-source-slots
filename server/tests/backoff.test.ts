import { describe, expect, it } from 'vitest';
import {
  MAX_SWEEP_PAUSE_MS,
  nextRequestPause,
  pauseAfterAttempts,
  REQUEST_FIRST_PAUSE_MS,
  REQUEST_MAX_PAUSE_MS,
} from '../src/spin/backoff';

const SECOND_MS = 1000;
const HOUR_MS = 3_600 * SECOND_MS;

describe('the pause of the sweeper after a failed attempt', () => {
  it.each([
    [1, 5 * SECOND_MS],
    [2, 10 * SECOND_MS],
    [3, 20 * SECOND_MS],
    [4, 40 * SECOND_MS],
    [10, 2_560 * SECOND_MS],
  ])('is %i attempts -> %i ms', (attempts, pauseMs) => {
    expect(pauseAfterAttempts(attempts)).toBe(pauseMs);
  });

  it('never exceeds one hour, however many attempts have failed', () => {
    const pauses = [11, 12, 13, 50, 1_000, 5_000].map(pauseAfterAttempts);

    expect(pauses).toEqual(pauses.map(() => HOUR_MS));
    expect(MAX_SWEEP_PAUSE_MS).toBe(HOUR_MS);
    for (let attempts = 1; attempts < 60; attempts += 1) {
      expect(pauseAfterAttempts(attempts)).toBeLessThanOrEqual(HOUR_MS);
    }
  });

  it('grows with every attempt until it reaches the ceiling', () => {
    for (let attempts = 1; attempts < 11; attempts += 1) {
      expect(pauseAfterAttempts(attempts + 1)).toBeGreaterThan(pauseAfterAttempts(attempts));
    }
  });

  it.each([0, -1, 1.5, Number.NaN])('refuses %s attempts', (attempts) => {
    expect(() => pauseAfterAttempts(attempts)).toThrow(RangeError);
  });
});

describe('the pause between the bet attempts of one spin request', () => {
  it('starts at 0.2 seconds, doubles, and stops growing at 1 second', () => {
    const pauses = [REQUEST_FIRST_PAUSE_MS];
    for (let step = 0; step < 6; step += 1) {
      pauses.push(nextRequestPause(pauses[pauses.length - 1]));
    }

    expect(pauses).toEqual([200, 400, 800, 1000, 1000, 1000, 1000]);
    expect(REQUEST_MAX_PAUSE_MS).toBe(SECOND_MS);
  });
});
