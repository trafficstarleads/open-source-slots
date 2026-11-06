/**
 * The control bar and money meters, plain DOM under the Pixi frame: balance,
 * bet stepper, win meter, the SPIN button and the message line, plus the
 * BIG WIN plaque.
 */
import { sound } from './audio';
import { countUp } from './tween';
import { GameInfo } from './gameinfo';
import { CREDIT_PENDING_LABEL, DEPOSIT_LABEL, toCents } from './wallet';

const BETS = [
  0.1, 0.2, 0.4, 0.6, 0.8, 1, 1.2, 1.4, 1.6, 1.8, 2, 3, 4, 5, 6, 7, 8, 9, 10,
];

export interface HudCallbacks {
  /** manual spin, and the quick-stop while the reels roll */
  onSpin: () => void;
  onDeposit: () => void;
}

export class Hud {
  private betIndex = BETS.indexOf(1);
  private busy = false;
  private betLocked = false;
  private balanceValue = 0;

  private readonly balanceEl: HTMLElement;
  private readonly winEl: HTMLElement;
  private readonly creditPendingEl: HTMLElement;
  private readonly betEl: HTMLElement;
  private readonly messageEl: HTMLElement;
  private readonly depositBtn: HTMLButtonElement;
  private readonly spinBtn: HTMLButtonElement;
  private readonly betUp: HTMLButtonElement;
  private readonly betDown: HTMLButtonElement;
  private readonly bigwinEl: HTMLElement;
  private readonly info: GameInfo;

  constructor(root: HTMLElement, cb: HudCallbacks) {
    root.innerHTML = `
      <div id="hud-bar">
        <button id="info-btn" type="button" aria-label="Game info">i</button>
        <button id="sound-btn" type="button" aria-label="Toggle sound"></button>
        <div class="meter"><span class="meter-label">BALANCE</span><span id="m-balance">0.00</span></div>
        <div class="bet-stepper">
          <button id="bet-down" type="button" aria-label="Lower bet">-</button>
          <div class="meter"><span class="meter-label">TOTAL BET</span><span id="m-bet"></span></div>
          <button id="bet-up" type="button" aria-label="Raise bet">+</button>
        </div>
        <button id="spin-btn" type="button" aria-label="Spin">
          <svg viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round">
            <path d="M 40 24 A 16 16 0 1 1 33 11" />
            <path d="M 33 3 L 33 12 L 42 12" stroke-linejoin="round"/>
          </svg>
        </button>
        <div class="meter"><span class="meter-label">WIN</span><span id="m-win">0.00</span><span class="credit-pending" hidden>${CREDIT_PENDING_LABEL}</span></div>
        <div id="hud-message"></div>
        <button id="deposit-btn" type="button" hidden>${DEPOSIT_LABEL}</button>
      </div>
      <div id="bigwin" hidden><div class="bigwin-title">BIG WIN</div><div class="bigwin-amount">0.00</div></div>
    `;
    this.balanceEl = root.querySelector('#m-balance')!;
    this.winEl = root.querySelector('#m-win')!;
    this.creditPendingEl = root.querySelector('.credit-pending')!;
    this.betEl = root.querySelector('#m-bet')!;
    this.messageEl = root.querySelector('#hud-message')!;
    this.depositBtn = root.querySelector('#deposit-btn')!;
    this.spinBtn = root.querySelector('#spin-btn')!;
    this.betUp = root.querySelector('#bet-up')!;
    this.betDown = root.querySelector('#bet-down')!;
    this.bigwinEl = root.querySelector('#bigwin')!;
    this.info = new GameInfo(() => this.bet);

    const soundBtn = root.querySelector<HTMLButtonElement>('#sound-btn')!;
    const speaker = (muted: boolean): string =>
      `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M4 9.5 L8 9.5 L13 5 L13 19 L8 14.5 L4 14.5 Z" fill="currentColor" stroke="none"/>
        ${muted ? '<path d="M16.5 9.5 L21 14.5 M21 9.5 L16.5 14.5"/>' : '<path d="M16 9 Q18.5 12 16 15 M18.5 6.5 Q22.5 12 18.5 17.5"/>'}
      </svg>`;
    soundBtn.innerHTML = speaker(sound.muted);
    const toggleSound = (): void => {
      soundBtn.innerHTML = speaker(sound.toggle());
      sound.click();
    };
    soundBtn.addEventListener('click', toggleSound);

    this.spinBtn.addEventListener('click', cb.onSpin);
    this.depositBtn.addEventListener('click', cb.onDeposit);
    this.betUp.addEventListener('click', () => {
      sound.click();
      this.stepBet(1);
    });
    this.betDown.addEventListener('click', () => {
      sound.click();
      this.stepBet(-1);
    });
    root.querySelector('#info-btn')!.addEventListener('click', () => {
      sound.click();
      this.info.open();
    });
    window.addEventListener('keydown', (e) => {
      if (e.code === 'KeyS' && !e.repeat) {
        toggleSound();
        return;
      }
      if (e.code === 'Space' && !e.repeat) {
        e.preventDefault();
        if (this.info.isOpen) return;
        cb.onSpin();
      }
    });

    this.renderBet();
    this.refresh();
  }

  get bet(): number {
    return BETS[this.betIndex];
  }

  get balance(): number {
    return this.balanceValue;
  }

  setBalance(v: number): void {
    this.balanceValue = v;
    this.balanceEl.textContent = v.toFixed(2);
  }

  setWin(v: number): void {
    this.winEl.textContent = v.toFixed(2);
  }

  setCreditPending(pending: boolean): void {
    this.creditPendingEl.hidden = !pending;
  }

  lockBet(betCents: number | undefined): void {
    this.betLocked = betCents !== undefined;
    const index = BETS.findIndex((bet) => toCents(bet) === betCents);
    if (index >= 0) {
      this.betIndex = index;
      this.renderBet();
    }
    this.refresh();
  }

  /** Animate the win meter counting up to `v`, with the classic beeping. */
  async countWin(v: number, ms = 700): Promise<void> {
    sound.countStart();
    await countUp(ms, 0, v, (n) => (this.winEl.textContent = n.toFixed(2)));
    sound.countStop();
  }

  /** The BIG WIN plaque with its own count-up; resolves when it fades. */
  async bigWin(v: number): Promise<void> {
    const amount = this.bigwinEl.querySelector('.bigwin-amount')!;
    sound.bigwin();
    this.bigwinEl.hidden = false;
    this.bigwinEl.classList.add('show');
    await countUp(1400, 0, v, (n) => (amount.textContent = n.toFixed(2)));
    await new Promise((r) => setTimeout(r, 700));
    this.bigwinEl.classList.remove('show');
    await new Promise((r) => setTimeout(r, 350));
    this.bigwinEl.hidden = true;
  }

  message(text: string): void {
    this.messageEl.textContent = text;
    this.depositBtn.hidden = true;
  }

  offerDeposit(text: string): void {
    this.message(text);
    this.depositBtn.hidden = false;
  }

  setBusy(busy: boolean): void {
    this.busy = busy;
    this.refresh();
  }

  private stepBet(dir: number): void {
    if (this.busy || this.betLocked) return;
    this.betIndex = Math.min(BETS.length - 1, Math.max(0, this.betIndex + dir));
    this.renderBet();
    this.refresh();
  }

  private renderBet(): void {
    this.betEl.textContent = this.bet.toFixed(2);
  }

  private refresh(): void {
    const frozen = this.busy || this.betLocked;
    this.betUp.disabled = frozen || this.betIndex === BETS.length - 1;
    this.betDown.disabled = frozen || this.betIndex === 0;
  }
}
