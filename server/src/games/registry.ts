import type { components } from '../hub/generated';
import type { RNG } from '../../../stellar-sevens/src/engine/rng';
import * as bumperCrop from '../../../bumper-crop/src/engine';
import * as discoveryVoyage from '../../../discovery-voyage/src/engine';
import * as fairytale from '../../../fairytale/src/engine';
import * as goldenPapyrus from '../../../golden-papyrus/src/engine';
import * as houseOfRa from '../../../house-of-ra/src/engine';
import * as nitroHot from '../../../nitro-hot/src/engine';
import * as pearlReef from '../../../pearl-reef/src/engine';
import * as samurai from '../../../samurai/src/engine';
import * as scorchingHot from '../../../scorching-hot/src/engine';
import * as stellarSevens from '../../../stellar-sevens/src/engine';
import * as theDynasty from '../../../the-dynasty/src/engine';
import * as tropicEscape from '../../../tropic-escape/src/engine';

export type GameSymbol = components['schemas']['GameSymbol'];

export interface DealtRound {
  readonly totalWin: number;
}

export interface Game {
  readonly name: string;
  readonly identity: string;
  readonly lines: number;
  readonly deal: (rng: RNG) => DealtRound;
}

export const GAMES: Readonly<Record<GameSymbol, Game>> = {
  'tropic-escape': {
    name: 'Tropic Escape',
    identity: 'apexslots_tropic_escape',
    lines: tropicEscape.LINES,
    deal: tropicEscape.playRound,
  },
  'stellar-sevens': {
    name: 'Stellar Sevens',
    identity: 'apexslots_stellar_sevens',
    lines: stellarSevens.LINES,
    deal: stellarSevens.playRound,
  },
  'bumper-crop': {
    name: 'Bumper Crop',
    identity: 'apexslots_bumper_crop',
    lines: bumperCrop.LINES,
    deal: bumperCrop.playRound,
  },
  'golden-papyrus': {
    name: 'Golden Papyrus',
    identity: 'apexslots_golden_papyrus',
    lines: goldenPapyrus.LINES,
    deal: goldenPapyrus.playRound,
  },
  'nitro-hot': {
    name: 'Nitro Hot',
    identity: 'apexslots_nitro_hot',
    lines: nitroHot.LINES,
    deal: nitroHot.playRound,
  },
  'scorching-hot': {
    name: 'Scorching Hot',
    identity: 'apexslots_scorching_hot',
    lines: scorchingHot.LINES,
    deal: scorchingHot.playRound,
  },
  'pearl-reef': {
    name: 'Pearl Reef',
    identity: 'apexslots_pearl_reef',
    lines: pearlReef.LINES,
    deal: pearlReef.playRound,
  },
  'discovery-voyage': {
    name: 'Discovery Voyage',
    identity: 'apexslots_discovery_voyage',
    lines: discoveryVoyage.LINES,
    deal: discoveryVoyage.playRound,
  },
  'house-of-ra': {
    name: 'House of Ra',
    identity: 'apexslots_house_of_ra',
    lines: houseOfRa.LINES,
    deal: houseOfRa.playRound,
  },
  fairytale: {
    name: 'Fairytale',
    identity: 'apexslots_fairytale',
    lines: fairytale.LINES,
    deal: fairytale.playRound,
  },
  samurai: {
    name: 'Samurai',
    identity: 'apexslots_samurai',
    lines: samurai.LINES,
    deal: samurai.playRound,
  },
  'the-dynasty': {
    name: 'The Dynasty',
    identity: 'apexslots_the_dynasty',
    lines: theDynasty.LINES,
    deal: theDynasty.playRound,
  },
};

export function isGameSymbol(value: string): value is GameSymbol {
  return Object.hasOwn(GAMES, value);
}

export function dealRound(symbol: GameSymbol, rng: RNG): DealtRound {
  return GAMES[symbol].deal(rng);
}
