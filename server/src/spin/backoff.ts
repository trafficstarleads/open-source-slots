const FIRST_SWEEP_PAUSE_MS = 5_000;
export const MAX_SWEEP_PAUSE_MS = 3_600_000;
export const REQUEST_FIRST_PAUSE_MS = 200;
export const REQUEST_MAX_PAUSE_MS = 1_000;
const PAUSE_GROWTH_FACTOR = 2;

export function pauseAfterAttempts(attempts: number): number {
  if (!Number.isInteger(attempts) || attempts < 1) {
    throw new RangeError(`attempts must be a whole number from 1, got ${attempts}`);
  }
  return Math.min(FIRST_SWEEP_PAUSE_MS * PAUSE_GROWTH_FACTOR ** (attempts - 1), MAX_SWEEP_PAUSE_MS);
}

export function nextRequestPause(pauseMs: number): number {
  return Math.min(pauseMs * PAUSE_GROWTH_FACTOR, REQUEST_MAX_PAUSE_MS);
}
