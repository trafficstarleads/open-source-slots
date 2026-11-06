export const BET_LADDER_CENTS = [
  10, 20, 40, 60, 80, 100, 120, 140, 160, 180, 200, 300, 400, 500, 600, 700, 800, 900, 1000,
] as const;

export type LadderBetCents = (typeof BET_LADDER_CENTS)[number];

const LADDER_LOOKUP: ReadonlySet<unknown> = new Set<unknown>(BET_LADDER_CENTS);

export function isOnLadder(betCents: unknown): betCents is LadderBetCents {
  return LADDER_LOOKUP.has(betCents);
}
