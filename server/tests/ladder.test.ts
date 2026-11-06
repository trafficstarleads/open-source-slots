import { describe, expect, it } from 'vitest';
import { BET_LADDER_CENTS, isOnLadder } from '../src/games/ladder';

const EXPECTED_LADDER_CENTS = [
  10, 20, 40, 60, 80, 100, 120, 140, 160, 180, 200, 300, 400, 500, 600, 700, 800, 900, 1000,
];

describe('bet ladder', () => {
  it('holds 0.10 to 2.00 in the published steps and 3.00 to 10.00 in steps of 1.00, in whole cents', () => {
    expect(BET_LADDER_CENTS).toEqual(EXPECTED_LADDER_CENTS);
  });

  it('is ascending with every bet unique', () => {
    expect([...BET_LADDER_CENTS].sort((a, b) => a - b)).toEqual([...BET_LADDER_CENTS]);
    expect(new Set(BET_LADDER_CENTS).size).toBe(BET_LADDER_CENTS.length);
  });

  it.each(EXPECTED_LADDER_CENTS)('accepts %i cents', (betCents) => {
    expect(isOnLadder(betCents)).toBe(true);
  });

  it('reads bet 0.60 as 60 cents and not 59 or 61', () => {
    expect(isOnLadder(60)).toBe(true);
    expect(isOnLadder(59)).toBe(false);
    expect(isOnLadder(61)).toBe(false);
  });

  it.each([
    { bet: '0.05', betCents: 5 },
    { bet: '10.10', betCents: 1010 },
    { bet: '15.00', betCents: 1500 },
    { bet: '0', betCents: 0 },
    { bet: '10.01', betCents: 1001 },
    { bet: '-0.10', betCents: -10 },
    { bet: '1.50', betCents: 150 },
  ])('refuses bet $bet', ({ betCents }) => {
    expect(isOnLadder(betCents)).toBe(false);
  });

  it.each([
    { what: 'a string', value: '60' },
    { what: 'not a number', value: Number.NaN },
    { what: 'a fraction of a cent', value: 60.5 },
    { what: 'null', value: null },
    { what: 'undefined', value: undefined },
    { what: 'an object', value: { betCents: 60 } },
  ])('refuses $what', ({ value }) => {
    expect(isOnLadder(value)).toBe(false);
  });
});
