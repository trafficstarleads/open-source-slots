import { describe, expect, it } from 'vitest';
import { winCents } from '../src/money';

describe('winCents', () => {
  it.each([
    { game: 'The Dynasty', betCents: 10, lineUnits: 5, lines: 20, expected: 3 },
    { game: 'Tropic Escape', betCents: 100, lineUnits: 5, lines: 9, expected: 56 },
    { game: 'Bumper Crop', betCents: 10, lineUnits: 1, lines: 25, expected: 0 },
    { game: 'Stellar Sevens', betCents: 60, lineUnits: 5, lines: 5, expected: 60 },
    { game: 'a win of nothing', betCents: 1000, lineUnits: 0, lines: 10, expected: 0 },
  ])(
    '$game with $lineUnits line units at $betCents cents pays $expected',
    ({ betCents, lineUnits, lines, expected }) => {
      expect(winCents(betCents, lineUnits / lines, lines)).toBe(expected);
    },
  );

  it('rounds exact halves up and whole cents stay as they are', () => {
    expect(winCents(10, 1 / 20, 20)).toBe(1);
    expect(winCents(10, 3 / 20, 20)).toBe(2);
    expect(winCents(10, 4 / 20, 20)).toBe(2);
    expect(winCents(10, 5 / 20, 20)).toBe(3);
    expect(winCents(10, 7 / 20, 20)).toBe(4);
  });

  it('does not cap the total: 10 000 times a 10.00 bet is 10 000 000 cents', () => {
    expect(winCents(1000, 10_000, 10)).toBe(10_000_000);
    expect(winCents(1000, 10_000, 25)).toBe(10_000_000);
    expect(winCents(1000, 1_000_000, 20)).toBe(1_000_000_000);
  });

  it('returns whole numbers for every line count of the twelve games', () => {
    for (const lines of [5, 9, 10, 20, 25]) {
      for (let lineUnits = 0; lineUnits <= 400; lineUnits++) {
        const cents = winCents(60, lineUnits / lines, lines);
        expect(Number.isSafeInteger(cents)).toBe(true);
      }
    }
  });

  it.each([
    { what: 'a zero bet', betCents: 0, totalWin: 1, lines: 10 },
    { what: 'a fractional bet', betCents: 10.5, totalWin: 1, lines: 10 },
    { what: 'a negative win', betCents: 10, totalWin: -1, lines: 10 },
    { what: 'a win that is not a number', betCents: 10, totalWin: Number.NaN, lines: 10 },
    { what: 'an infinite win', betCents: 10, totalWin: Number.POSITIVE_INFINITY, lines: 10 },
    { what: 'zero lines', betCents: 10, totalWin: 1, lines: 0 },
    { what: 'a fractional line count', betCents: 10, totalWin: 1, lines: 2.5 },
  ])('refuses $what', ({ betCents, totalWin, lines }) => {
    expect(() => winCents(betCents, totalWin, lines)).toThrow(RangeError);
  });

  it('refuses a total that would leave the safe integer range', () => {
    expect(() => winCents(1000, 1e15, 10)).toThrow(RangeError);
  });
});
