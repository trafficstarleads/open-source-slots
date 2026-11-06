function isWholePositive(value: number): boolean {
  return Number.isSafeInteger(value) && value > 0;
}

function isValidRound(betCents: number, totalWin: number, lines: number): boolean {
  return isWholePositive(betCents) && isWholePositive(lines) && Number.isFinite(totalWin) && totalWin >= 0;
}

export function winCents(betCents: number, totalWin: number, lines: number): number {
  if (!isValidRound(betCents, totalWin, lines)) {
    throw new RangeError(`winCents: bet ${betCents}, total win ${totalWin} and lines ${lines} are not a valid round`);
  }
  const lineUnits = Math.round(totalWin * lines);
  const cents = Math.floor((betCents * lineUnits * 2 + lines) / (2 * lines));
  if (!Number.isSafeInteger(cents)) {
    throw new RangeError(`winCents: ${lineUnits} line units at ${betCents} cents leave the integer range`);
  }
  return cents;
}
