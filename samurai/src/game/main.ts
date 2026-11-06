// The live CSP on apexslots.eu has no 'unsafe-eval': this import MUST come
// first or Pixi hangs on boot when served from the site.
import 'pixi.js/unsafe-eval';
import { Application } from 'pixi.js';
import type { Grid, RoundResult } from '../engine';
import { Board, BOARD_H, BOARD_W, loadSymbolTextures } from './board';
import { Hud } from './hud';
import { initFit } from './fit';
import {
  creditedShare,
  fromCents,
  postDeposit,
  roundView,
  toCents,
  wallet,
  type Failure,
  type RoundView,
  type ServerRound,
} from './wallet';

const IDLE_GRID: Grid = [
  ['SAMURAI', 'KING', 'TIGER'],
  ['DRAGON', 'ACE', 'QUEEN'],
  ['ONI', 'JACK', 'TEN'],
  ['KING', 'HELMET', 'FAN'],
  ['ACE', 'QUEEN', 'JACK'],
];
const BIG_WIN_BET_MULTIPLE = 20;
const FREE_GAME_COUNT_MS = 350;

function loaderProgress(pct: number): void {
  const fill = document.querySelector<HTMLElement>('.loader-fill');
  if (fill) fill.style.width = `${pct}%`;
}

async function boot(): Promise<void> {
  initFit();
  loaderProgress(15);

  const app = new Application();
  await app.init({
    width: BOARD_W,
    height: BOARD_H,
    backgroundAlpha: 0,
    antialias: true,
    powerPreference: 'high-performance',
    resolution: Math.min(window.devicePixelRatio || 1, 2),
    autoDensity: true,
  });
  // autoDensity writes inline width/height styles; clear both so the
  // responsive #stage canvas CSS rules control the displayed size.
  app.canvas.style.width = '';
  app.canvas.style.height = '';
  document.getElementById('stage')!.appendChild(app.canvas);
  loaderProgress(45);

  const board = new Board(app, await loadSymbolTextures());
  loaderProgress(75);

  const session = await wallet.session();
  loaderProgress(90);

  let busy = false;

  const hud = new Hud(document.getElementById('ui')!, {
    onSpin: () => {
      if (busy) {
        board.hurry();
        return;
      }
      void play();
    },
    onDeposit: () => postDeposit(window.parent),
  });
  hud.lockBet(wallet.pendingBetCents());
  if (session.kind === 'ready') {
    hud.setBalance(fromCents(session.balanceCents));
  } else {
    showFailure(session.failure);
  }

  board.land(IDLE_GRID);

  function showFailure(failure: Failure): void {
    if (failure.offersDeposit) {
      hud.offerDeposit(failure.message);
    } else {
      hud.message(failure.message);
    }
    if (failure.balanceCents !== undefined) {
      hud.setBalance(fromCents(failure.balanceCents));
    }
  }

  function finish(): void {
    hud.lockBet(wallet.pendingBetCents());
    busy = false;
    hud.setBusy(false);
  }

  async function playOutBonus(
    round: RoundResult,
    baseCents: number,
    bonusCents: number,
    creditPending: boolean,
  ): Promise<void> {
    const bonus = round.bonus!;
    hud.resetSkip();
    await hud.bonusIntro();

    let remaining = round.baseSpin.freeSpinsWon;
    let wonUnits = 0;
    hud.setFreeSpins(remaining);

    for (let i = 0; i < bonus.spins.length; i++) {
      const spin = bonus.spins[i];
      remaining--;
      if (spin.freeSpinsWon > 0) remaining += spin.freeSpinsWon;
      wonUnits += spin.totalWin;
      const shownCents = baseCents + creditedShare(bonusCents, wonUnits, bonus.totalWin);

      if (hud.skipping) {
        if (i === bonus.spins.length - 1) {
          board.land(spin.grid);
          hud.setFreeSpins(remaining);
          hud.setWin(fromCents(shownCents));
        }
        continue;
      }

      hud.setFreeSpins(remaining);
      await board.spin(spin.grid, true);
      if (spin.freeSpinsWon > 0) await hud.retriggerFlash();
      if (spin.totalWin > 0) {
        const show = board.presentWins(spin, true);
        await hud.countWin(fromCents(shownCents), FREE_GAME_COUNT_MS);
        await show;
      }
    }

    hud.setFreeSpins(null);
    await hud.bonusEnd(fromCents(bonusCents), creditPending);
  }

  async function presentRound(served: ServerRound<RoundResult>, view: RoundView, bet: number): Promise<void> {
    const { round, winCents } = served;
    await board.spin(round.baseSpin.grid);

    const win = view.winAmount;
    if (win > 0) hud.setCreditPending(view.creditPending);

    const baseCents = creditedShare(winCents, round.baseSpin.totalWin, round.totalWin);
    if (round.baseSpin.totalWin > 0) {
      const show = board.presentWins(round.baseSpin);
      await hud.countWin(fromCents(baseCents));
      await show;
    }

    if (round.bonus) await playOutBonus(round, baseCents, winCents - baseCents, view.creditPending);

    if (win > 0) {
      hud.setWin(win);
      if (win >= bet * BIG_WIN_BET_MULTIPLE) await hud.bigWin(win);
      hud.message(`WIN ${win.toFixed(2)}`);
    }
  }

  async function play(): Promise<void> {
    const bet = hud.bet;
    const betCents = toCents(bet);

    busy = true;
    hud.setBusy(true);
    hud.setWin(0);
    hud.setCreditPending(false);
    hud.message('');

    const clearance = await wallet.clearToSpin(toCents(hud.balance), betCents);
    if (clearance.kind === 'refused') {
      showFailure(clearance.failure);
      finish();
      return;
    }
    if (clearance.balanceCents !== undefined) {
      hud.setBalance(fromCents(clearance.balanceCents));
    }

    board.prime();
    const outcome = await wallet.spin(betCents);
    if (outcome.kind === 'failed') {
      showFailure(outcome.failure);
      await board.abort();
      finish();
      return;
    }

    const view = roundView(outcome.round);
    hud.setBalance(fromCents(view.balanceAfterBetCents));
    try {
      await presentRound(outcome.round, view, bet);
    } catch (error) {
      console.warn('The round could not be presented.', error);
      hud.message('Something went wrong. Reload to re-sync.');
    }
    hud.setBalance(fromCents(view.finalBalanceCents));
    finish();
  }

  const resumeUnfinishedSpin = (): void => {
    if (wallet.pendingBetCents() !== undefined) void play();
  };

  // loader away, then the intro waits for its click
  loaderProgress(100);
  await new Promise((r) => setTimeout(r, 350));
  const loader = document.getElementById('loader');
  if (loader) {
    loader.classList.add('done');
    setTimeout(() => loader.remove(), 600);
  }

  const intro = document.getElementById('intro');
  if (intro) {
    const dismiss = (): void => {
      intro.classList.add('done');
      setTimeout(() => intro.remove(), 500);
      window.removeEventListener('keydown', onKey, true);
      resumeUnfinishedSpin();
    };
    const onKey = (e: KeyboardEvent): void => {
      if (e.code === 'Space' || e.code === 'Enter') {
        e.preventDefault();
        e.stopPropagation();
        dismiss();
      }
    };
    intro.addEventListener('click', dismiss, { once: true });
    window.addEventListener('keydown', onKey, true);
  } else {
    resumeUnfinishedSpin();
  }
}

void boot();
