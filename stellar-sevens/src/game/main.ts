// The live CSP on apexslots.eu has no 'unsafe-eval': this import MUST come
// first or Pixi hangs on boot when served from the site.
import 'pixi.js/unsafe-eval';
import { Application } from 'pixi.js';
import type { Grid } from '../engine';
import { Board, BOARD_H, BOARD_W, loadSymbolTextures } from './board';
import { Hud } from './hud';
import { initFit } from './fit';
import { fromCents, postDeposit, roundView, showFailure, toCents, wallet } from './wallet';

const IDLE_GRID: Grid = [
  ['CHERRY', 'LEMON', 'PLUM'],
  ['BELL', 'ORANGE', 'GRAPES'],
  ['MELON', 'STAR', 'SEVEN'],
];
const BIG_WIN_BET_MULTIPLE = 20;

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
    showFailure(hud, session.failure);
  }

  board.land(IDLE_GRID);

  function finish(): void {
    hud.lockBet(wallet.pendingBetCents());
    busy = false;
    hud.setBusy(false);
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
      showFailure(hud, clearance.failure);
      finish();
      return;
    }
    if (clearance.balanceCents !== undefined) {
      hud.setBalance(fromCents(clearance.balanceCents));
    }

    board.prime();
    const outcome = await wallet.spin(betCents);
    if (outcome.kind === 'failed') {
      showFailure(hud, outcome.failure);
      await board.abort();
      finish();
      return;
    }

    const view = roundView(outcome.round);
    hud.setBalance(fromCents(view.balanceAfterBetCents));
    await board.spin(outcome.round.round.baseSpin.grid);

    const win = view.winAmount;
    if (win > 0) {
      hud.setCreditPending(view.creditPending);
      const show = board.presentWins(outcome.round.round.baseSpin);
      await hud.countWin(win);
      if (win >= bet * BIG_WIN_BET_MULTIPLE) await hud.bigWin(win);
      await show;
      hud.message(`WIN ${win.toFixed(2)}`);
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
