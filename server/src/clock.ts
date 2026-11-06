export interface Clock {
  readonly now: () => Date;
  readonly sleep: (ms: number) => Promise<void>;
}

export const systemClock: Clock = {
  now: () => new Date(),
  sleep: (ms) =>
    new Promise((done) => {
      setTimeout(done, ms);
    }),
};

export function laterBy(from: Date, ms: number): Date {
  return new Date(from.getTime() + ms);
}
