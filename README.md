# Open Source Slots

Complete slot machine games with proven maths, a game server that draws their rounds, and a game window for each.

Slot maths is usually a closed box. The [slotopol](https://github.com/slotopol/server) project opened the first half of it by publishing reel strips and paytables for hundreds of games. This collection gives the other half: finished slots built on that maths, each with its own art, sound and client, and a simulator that checks the published RTP.

You can read every line of it, check the numbers yourself, and use it as the starting point for your own. Code and sound are MIT, art is CC BY. New games join the list as they are finished.

## The games

| | Game | Layout | RTP | Original site | Source |
|---|---|---|---|---|
| <img src="tiles/tropic-escape.webp" width="96" alt="TROPIC ESCAPE"> | **TROPIC ESCAPE**<br>A beach slot. The banana is wild, doubles the wins it completes and is the top symbol. Suitcases pay anywhere and three start 45 free games on their own reels, which carry more bananas and more suitcases, and three more there add 45 again. | 5x3, 9 lines | 95.36% | [Play](https://apexslots.eu/games/tropic-escape/) | [Code](tropic-escape/) |
| <img src="tiles/stellar-sevens.webp" width="96" alt="STELLAR SEVENS"> | **STELLAR SEVENS**<br>A classic fruit slot on three reels. No wild, no scatter, no free games, only three of a kind pays. Sevens are the top symbol and a full screen of them fills all five lines for the top win. | 3x3, 5 lines | 95.50% | [Play](https://apexslots.eu/games/stellar-sevens/) | [Code](stellar-sevens/) |
| <img src="tiles/bumper-crop.webp" width="96" alt="BUMPER CROP"> | **BUMPER CROP**<br>A farm slot with avalanches. Winning symbols are harvested, the rest fall and fresh ones drop in, for as long as the field pays. Three tractors pay and open a five-floor barn ladder of prizes and multipliers. | 5x3, 25 lines | 95.55% | [Play](https://apexslots.eu/games/bumper-crop/) | [Code](bumper-crop/) |
| <img src="tiles/golden-papyrus.webp" width="96" alt="GOLDEN PAPYRUS"> | **GOLDEN PAPYRUS**<br>An Egyptian book slot. The papyrus is wild and the scatter. Three start 10 free games on their own reels with one symbol drawn to expand: enough of it anywhere pays on all 10 lines at once. | 5x3, 10 lines | 95.11% | [Play](https://apexslots.eu/games/golden-papyrus/) | [Code](golden-papyrus/) |
| <img src="tiles/nitro-hot.webp" width="96" alt="NITRO HOT"> | **NITRO HOT**<br>A classic fruit slot on three reels. No wild, no scatter, only three of a kind pays. A full screen of plums, oranges, lemons or cherries doubles every line. | 3x3, 5 lines | 95.66% | [Play](https://apexslots.eu/games/nitro-hot/) | [Code](nitro-hot/) |
| <img src="tiles/scorching-hot.webp" width="96" alt="SCORCHING HOT"> | **SCORCHING HOT**<br>A classic fruit slot. No wild, no free games. Sevens are the top symbol, cherries pay from 2, and three or more stars anywhere pay the total bet on top of the lines. | 5x3, 5 lines | 95.66% | [Play](https://apexslots.eu/games/scorching-hot/) | [Code](scorching-hot/) |
| <img src="tiles/pearl-reef.webp" width="96" alt="PEARL REEF"> | **PEARL REEF**<br>A reef slot. The turtle is wild, doubles the wins it completes and is the top symbol. Clams pay anywhere and three start 15 free games on their own reels, where every win pays triple. | 5x3, 10 lines | 95.13% | [Play](https://apexslots.eu/games/pearl-reef/) | [Code](pearl-reef/) |
| <img src="tiles/discovery-voyage.webp" width="96" alt="DISCOVERY VOYAGE"> | **DISCOVERY VOYAGE**<br>A voyage slot. The captain is wild and the top symbol. Three galleons start 10 free games on their own reels, where the galleon is wild as well. | 5x3, 10 lines | 95.02% | [Play](https://apexslots.eu/games/discovery-voyage/) | [Code](discovery-voyage/) |
| <img src="tiles/house-of-ra.webp" width="96" alt="HOUSE OF RA"> | **HOUSE OF RA**<br>An Egyptian slot. The sun disc is wild and the scatter. Three start 10 free games on their own reels where the best way on the screen expands over its reels and pays on every line. | 5x3, 10 lines | 95.18% | [Play](https://apexslots.eu/games/house-of-ra/) | [Code](house-of-ra/) |
| <img src="tiles/fairytale.webp" width="96" alt="FAIRYTALE"> | **FAIRYTALE**<br>A storybook slot. The enchantress is wild and the top symbol. Three lanterns start 10 free games where, before every spin, one symbol is drawn and covers the first two or three reels whole, so every free game pays. | 5x3, 10 lines | 95.57% | [Play](https://apexslots.eu/games/fairytale/) | [Code](fairytale/) |
| <img src="tiles/samurai.webp" width="96" alt="SAMURAI"> | **SAMURAI**<br>A warrior slot. The samurai is wild and the top symbol. Three gongs pay and start 10 free games on their own reels, where a samurai anywhere on a reel turns the whole reel wild. | 5x3, 20 lines | 95.39% | [Play](https://apexslots.eu/games/samurai/) | [Code](samurai/) |
| <img src="tiles/the-dynasty.webp" width="96" alt="THE DYNASTY"> | **THE DYNASTY**<br>A royal court. The monarch is wild and doubles the wins it completes. Two heirs call 25 to 45 free games on their own reels, where the other heir is crowned wild. | 5x3, 20 lines | 94.14% | [Play](https://apexslots.eu/games/the-dynasty/) | [Code](the-dynasty/) |

The original, stand-alone versions of these games are playable at [apexslots.eu](https://apexslots.eu). The game windows in this repository are different: they play only through the game server below, and there is no demo or guest play.

## How it fits together

    casino site ──frames──▶ game window (browser, /play/<symbol>?token=…)
                                  │  /api/game/session, /api/game/spin   (Authorization: Bearer <launch token>)
                                  ▼
                            game server (server/)  ──signed balance / bet / win──▶  game hub (holds the balances)
                                  │
                                  ▼
                               Postgres (every round, kept without expiry)

- The casino launches a game at `{playUrl}/play/<symbol>?token=<launch token>`. The game server serves the page of that game at `/play/<symbol>` and its files under `/play/<symbol>/assets/`. Any other symbol or path is 404.
- The server draws every round itself, with the game's engine from `<game>/src/engine` (imported unchanged) and Web Crypto as the random source. The browser sends only the game, a spin key and a bet from that game's ladder (0.10 to 10.00); it never decides an outcome, a bet or a win.
- The server saves the round, then calls the hub's `bet`, and only after the hub accepts the bet answers the browser with the outcome and credits the whole win of the round with one `win` call (transaction ids `<roundId>:bet` and `<roundId>:win`). Money is whole cents everywhere in the server. The hub holds no rounds, the server holds no balances.
- Every call to the hub is signed with HMAC-SHA256 over the raw body under the partner's secret key and sent in the header `X-Signature`.
- Every call under `/api/game/` without a launch token is refused with `401 session_expired`.

## Run the game server

You need Node 22.12 or newer (below 23), Postgres, and the dependencies of the server and of the twelve games. All commands run from the repository root.

    npm --prefix server ci
    for g in bumper-crop discovery-voyage fairytale golden-papyrus house-of-ra nitro-hot pearl-reef samurai scorching-hot stellar-sevens the-dynasty tropic-escape; do npm --prefix $g ci; done

1. Build the twelve windows. `build:games` type-checks each game and builds it with `GAME_BASE=/play/<symbol>/` into `server/public/play/<symbol>/`; name symbols after `--` to build only those (`npm --prefix server run build:games -- tropic-escape`). Set `GAMES_OUTPUT_DIR` to write the folders somewhere else.

        npm --prefix server run build:games

2. Build the server. It bundles `server/src` together with the twelve engines into `server/dist/server.mjs`.

        npm --prefix server run build

3. Create the settings file and edit it ([settings](#settings) below).

        cp server/.env.example server/.env

4. Create the tables. The server never migrates itself, so a failed migration cannot take a running replica down.

        cd server
        DATABASE_URL=postgres://… npm run migrate

5. Start it from `server/` (the default `PUBLIC_DIR` is relative to the working directory).

        node --env-file=.env dist/server.mjs

`GET /healthz` answers without a token once the server is up. Only the build step needs the dev dependencies (`esbuild`); `dist/server.mjs` loads its other packages from `server/node_modules`.

## Run a window against the stub hub

To see a window work without a real hub, run the game server together with a stub hub:

    npm --prefix server run build:games
    npm --prefix server run dev:stub

Then open `http://localhost:9100/host/tropic-escape?token=tok-rich`. The host page stands in for the casino site: it frames `/play/tropic-escape/` from the game server on port 3000 and logs every message the window posts, such as `{type: 'apex:deposit'}`.

`dev:stub` starts the stub hub on `STUB_PORT` (9100) and the game server on `PORT` (3000) with the migrations applied. It needs Postgres at `DATABASE_URL`, which defaults to the test container:

    docker run -d --name slots-test-pg -e POSTGRES_PASSWORD=test -p 5434:5432 postgres:17

The stub keeps one wallet per token:

| Token | Behaviour |
|---|---|
| `tok-rich`, `tok-rich-2` | balance 100.00, every call is accepted |
| `tok-poor` | balance 0.05, a bet is refused for insufficient funds |
| `tok-expired` | every call is refused as an unknown session |
| `tok-limit` | a bet is refused as over the limit |
| `tok-slow`, `tok-medium` | the bet is answered after 12 and 3 seconds |
| `tok-busy-once`, `tok-bet-internal`, `tok-forbidden` | the bet is answered busy once, always with an internal error, always with 403 |
| `tok-pending-win`, `tok-win-busy`, `tok-win-conflict` | the win is accepted on the third call, never accepted (busy), refused as a conflict |

`GET /calls` on the stub lists the calls it received; `POST /deposit/<token>?cents=N` adds N cents to a wallet, as a deposit made elsewhere would.

A window cannot be run on its own. `npm run dev` inside a game folder is not supported: the window imports `../client-kit`, which the Vite dev server of the game does not serve, and the window plays only through the game server, so a bundle built by `build:games` and served by the game server (with the stub hub for local play) is the one way to run it.

## Settings

The server reads its settings from the environment; `server/.env.example` lists every one with a sample value. A missing required setting stops the start and names it.

| Setting | Default | Meaning |
|---|---|---|
| `DATABASE_URL` | required | Postgres of the game server |
| `FRAME_ANCESTORS` | required | origins allowed to frame a window, sent as `Content-Security-Policy: frame-ancestors` (pages also carry `Referrer-Policy: no-referrer`, because the launch token is in the address) |
| `HUB_BASE_URL` | required | the hub's address, `http` or `https` |
| `HUB_SECRET_KEY` | required | the partner's secret key at the hub, used to sign every call |
| `HUB_PARTNER` | `ownslots` | partner name in the hub's path `/webhook/<partner>/…` |
| `PORT` | `3000` | listening port |
| `PUBLIC_DIR` | `public` | folder that holds `play/<symbol>/`, relative to the working directory |
| `LOG_LEVEL` | `info` | log level; logs are one JSON object per line |
| `HUB_CALL_TIMEOUT_MS` | `10000` | timeout of one hub call, and the time a spin waits for its bet to be answered; longer than the hub's own 8 second wait for a busy wallet |
| `SWEEP_LEASE_MS` | `HUB_CALL_TIMEOUT_MS` + 2000 | how long the sweeper holds a round while it repeats a call; must exceed `HUB_CALL_TIMEOUT_MS` |
| `SWEEP_INTERVAL_MS` | `1000` | pause between sweeper passes |
| `ALERT_AFTER_ATTEMPTS` | `5` | failed attempts after which every further attempt logs an alert |

`dev:stub` also reads `STUB_PORT` (stub hub, 9100). The upload script has its own settings, below. The hub's secret key and the catalogue admin key live in the secret store of the deployment, never in the repository.

## Unfinished rounds, the sweeper and the alert

A round whose bet or win the hub did not answer definitely is not lost.

- A bet with no definite answer (`BUSY`, `INTERNAL`, a timeout) is repeated with the same transaction id: inside the spin request every 0.2 seconds growing to 1 second while the 10 second budget lasts, afterwards by the in-process sweeper. The browser gets `busy` and repeats the same spin key.
- A win that is not credited at once is repeated by the sweeper with the same transaction id and the round's own launch token, at pauses growing from 5 seconds to a ceiling of 1 hour. The browser meanwhile shows the outcome marked "BEING CREDITED". Only a round the hub answers `CONFLICT` or `BAD_REQUEST` is parked, for an operator.
- The sweeper claims a round with a lease of `SWEEP_LEASE_MS` before each call, so no two callers repeat one call.
- After `ALERT_AFTER_ATTEMPTS` failed attempts every further attempt logs an error line, `bet_pending_alert` or `win_pending_alert`. Put a pager on these two events; the bet alert matters most, because a bet that ended in `INTERNAL` may already be debited.
- `GET /healthz` returns `{waitingBet, waitingWin, parked, oldestWaitingSeconds}` as integers: rounds waiting for a bet, rounds waiting for a win, parked rounds, and the age in seconds of the oldest waiting round.
- A repeated spin key returns the first answer for that key and never draws, debits or credits again.

## Upload the game tiles

`tiles/<symbol>.webp` holds the lobby tile of each game. The upload script sends the twelve tiles to the hub's `GameService.UpdateImage` under each game's hub identity (for example `apexslots_tropic_escape`), image key `1x1`. Run it once after the hub's catalogue sync:

    CATALOG_GRPC_ADDRESS=hub.example.com:9090 CATALOG_ADMIN_KEY=… npm --prefix server run upload-tiles

| Setting | Default | Meaning |
|---|---|---|
| `CATALOG_GRPC_ADDRESS` | required | the hub's gRPC address, `host:port` |
| `CATALOG_ADMIN_KEY` | required | catalogue admin key, sent as the metadata `x-catalog-admin-key` |
| `HUB_GRPC_INSECURE` | unset | `true` for a plaintext connection (a local hub); anything else uses TLS |
| `TILES_DIR` | `tiles/` at the repository root | folder with the twelve `<symbol>.webp` files |

The script checks all twelve files first, then uploads them one by one, and exits with 0 when all twelve are uploaded and with 1 on the first failure, naming the symbol and the hub's error.

## The shared module and the twelve windows

`client-kit/` is the browser module every window uses to talk to the server. A window reaches it through `<game>/src/game/wallet.ts`, which keeps the game's own `GAME` constant and re-exports the kit. The kit has no runtime dependency and covers:

- the launch token, read from `?token=` and sent as `Authorization: Bearer` on every call;
- the session call (the balance in whole cents) and the spin call, with the failure codes `session_expired`, `insufficient_funds`, `bet_refused`, `bad_request`, `busy`, `unavailable` and a lost connection, each with its English message;
- the spin key and bet of an unfinished spin, kept in the tab's session storage until a definite answer arrives, so a reload or a press of SPIN after a lost connection sends the same key with the same bet;
- the deposit message `{type: 'apex:deposit'}`, posted to the parent window when the player presses DEPOSIT.

All twelve windows are migrated: bumper-crop, discovery-voyage, fairytale, golden-papyrus, house-of-ra, nitro-hot, pearl-reef, samurai, scorching-hot, stellar-sevens, the-dynasty and tropic-escape. In each:

- no local play: the demo balance, the local round and the `DEMO` label are gone, and every round shown is the one the server answered;
- nothing is shown before the server has accepted the bet; the balance after the bet is shown while the animation runs and the win is added when it ends; the win figure is the credited amount in cents;
- the bets are those of the game's own ladder, 0.10 to 10.00;
- when the balance, checked once more with the server, is below the bet, the window shows "NOT ENOUGH FUNDS" and a DEPOSIT button;
- a win that is not yet credited is marked "BEING CREDITED", and an expired session shows "SESSION EXPIRED. REOPEN THE GAME.";
- the information screen carries the art credit.

The credit line shown on the information screen of every game is:

    Art by APEXSLOTS (apexslots.eu), CC BY 4.0

## What is in every game

| Folder | What it is |
|---|---|
| `src/engine/` | The maths: reel strips, paytable, bet lines, the evaluator and the round. No graphics in here. The game server imports it unchanged. |
| `src/game/` | The PixiJS client: reels, HUD, win presentation, game info screen, and the sound. Every game's soundtrack is synthesised in WebAudio, there are no audio files. It talks to the game server through `client-kit`. |
| `src/sim/` | The proofs: exact enumeration and Monte Carlo in every game, and in most a closed-form par sheet and a reel strip check against the source yaml. |
| `tests/` | Vitest tests of the engine. |
| `slotopol/` | The reference maths the game was ported from, as published by slotopol (MIT), with their licence. The earliest ports carry no copy and name the slotopol file in their README instead. |
| `public/` | The art. |

Each game's own README has its paytable, rules, RTP and the exact commands that reproduce the figure, such as `npm run sim:exact` (the RTP proof the game server relies on).

## Tests

    npm --prefix server ci
    npm --prefix server test
    cd client-kit && npm ci && npx vitest run
    npm --prefix <game> test

- The server tests use Postgres: start the container above, or point `TEST_DATABASE_URL` elsewhere.
- `server/tests/games-built.test.ts` and `server/tests/e2e.test.ts` build the twelve bundles into a temporary folder with `build:games`, so the twelve games need `npm ci` first; each file takes a minute or more. They check that every bundle is served at `/play/<symbol>` with its files under `/play/<symbol>/assets/`, carries the credit line and no demo title, that a build with `GAME_BASE` unset or wrong is caught, and that every game completes a spin through the application against the stub hub.
- `client-kit/tests/games.test.ts` reads the sources of the twelve windows and fails on local play, a demo label, a bet off the ladder or a missing credit line.
- `npm --prefix server run codegen:check` fails when the generated hub types differ from the hub contract.

## Licence

- Code: [MIT](LICENSE).
- Art (everything under each game's `public/`, and `tiles/`): [CC BY 4.0](LICENSE-ART.md). Use it anywhere, credit APEXSLOTS.
- Reference maths under a game's `slotopol/` folder, or a slotopol data file kept beside a game's code: MIT, copyright schwarzlichtbezirk, see the licence file next to it.

## Credits

The maths of these games was ported from [slotopol/server](https://github.com/slotopol/server) by schwarzlichtbezirk, MIT. The reel strips and paytables are theirs. The games, art, sound, clients and simulators are ours.
