import type { Clock } from '../../src/clock';

export class ManualClock implements Clock {
  readonly sleeps: number[] = [];
  private currentMs: number;

  constructor(startMs: number = Date.now()) {
    this.currentMs = startMs;
  }

  readonly now = (): Date => new Date(this.currentMs);

  readonly sleep = async (ms: number): Promise<void> => {
    this.sleeps.push(ms);
    this.currentMs += ms;
  };

  advance(ms: number): void {
    this.currentMs += ms;
  }

  advanceTo(date: Date): void {
    this.currentMs = date.getTime();
  }
}
