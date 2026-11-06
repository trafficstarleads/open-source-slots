# own-slots-or-free-pragmatic — the game server and the twelve game windows of the own slots

## Targets

| repo | path | stack | its half | base | branch |
|---|---|---|---|---|---|
| Casino-Game-Aggregator | `C:\Users\GamePC\Desktop\projects\alexpay\own-slots-or-free-pragmatic\Casino-Game-Aggregator` | Rust (tonic, axum, sqlx, Redis) | origin of the contract: vendor `OWNSLOTS`, signed `balance`/`bet`/`win` webhook | main | feature/own-slots-or-free-pragmatic |
| slots-server | `C:\Users\GamePC\Desktop\projects\alexpay\own-slots-or-free-pragmatic\slots-server` | Node 22, TypeScript, Fastify, Postgres, PixiJS (this repo, consumer) | the game server (`server/`), the shared browser module (`client-kit/`) and the twelve patched game windows | main | feature/own-slots-or-free-pragmatic |
| vip90-bet-core | `C:\Users\GamePC\Desktop\projects\alexpay\own-slots-or-free-pragmatic\vip90-bet-core` | Node 22, Express, MongoDB, React 19 | lobby row, hidden "Original" tiles, the deposit jump (consumer) | main | feature/own-slots-or-free-pragmatic |

This repo is a local clone of `github.com/Z1000k/open-source-slots` (remote `origin` = Z1000k, MIT code, CC BY art). The fork under `trafficstarleads` and its remote are created only on the user's separate go-ahead at build time. The task folder and its worktrees are the origin's; the base is `origin/main` at `e4d379c`.

## Requirements

Defined in `from-origin/feature.md` (`R*`). This half numbers its own `FR*`, each naming the `R*` it serves.

- FR1. WHEN a browser requests `/play/<symbol>` for one of the twelve symbols, THE SYSTEM SHALL serve that game's page, and for any other symbol or path THE SYSTEM SHALL answer 404. (R4)
- FR2. WHEN the game window asks for its session with a launch token, THE SYSTEM SHALL call the hub `balance` with that token and answer the balance in whole cents. (R4)
- FR3. WHEN the hub answers `SESSION_NOT_FOUND` to the balance call or to the bet call of a new spin, THE SYSTEM SHALL answer the browser `session_expired` and SHALL NOT start a round for that token; a bet refused this way, live or repeated by the sweeper, ends its round `refused`. (R19)
- FR4. IF a spin names a game outside the twelve or a bet that is not on that game's ladder between 0.10 and 10.00 in whole cents, THEN THE SYSTEM SHALL refuse it with `bad_request`, draw nothing and call the hub not at all. (R8)
- FR5. WHEN a valid spin arrives, THE SYSTEM SHALL draw the round on the server with a cryptographically secure random source, save it under a round id the server mints, and only then call the hub `bet`, and SHALL NOT take an outcome, a bet or a win from the browser. (R7)
- FR6. WHEN the hub accepts the bet, THE SYSTEM SHALL answer the browser with the outcome and, in the same request, credit the whole win of the round with one `win` call carrying transaction ids `<roundId>:bet` and `<roundId>:win`; a round with no win ends with the bet call alone, sent with `roundClose` true. (R5, R11)
- FR7. THE SYSTEM SHALL sign the raw body of every call to the hub with HMAC-SHA256 under the partner's secret key and send it in the header `X-Signature`. (R18)
- FR8. IF the hub refuses the bet with `INSUFFICIENT_FUNDS`, THEN THE SYSTEM SHALL answer `insufficient_funds`, send no outcome, mark the round refused, delete its drawn result and never repeat that bet. (R6)
- FR9. IF the hub refuses the bet with another definite refusal (`LIMIT_EXCEEDED`, `REFUSED`, `CONFLICT`, `BAD_REQUEST`), THEN THE SYSTEM SHALL answer `bet_refused`, send no outcome, mark the round refused and never repeat that bet. (R11)
- FR10. WHEN a spin key arrives again with the same token, THE SYSTEM SHALL answer the first answer for that key, a round that still owes its win or is parked answering its outcome marked `creditPending`, and SHALL NOT draw, debit or credit again. (R9)
- FR11. THE SYSTEM SHALL turn the engine's total win and the bet into whole cents rounded to the nearest cent, in integer arithmetic, SHALL credit that whole total in the one `win` call free games and bonus steps included, and SHALL NOT cap it. (R12, R13)
- FR12. IF the hub gives no definite answer to a bet (`BUSY`, `INTERNAL`, no answer), THEN THE SYSTEM SHALL repeat the same call with the same transaction id until it is answered, within the spin request every 0.2 seconds growing to 1 second while 8 seconds last and afterwards by the sweeper, and SHALL answer the browser `busy` after those 8 seconds so that the browser can repeat the same spin key. (R11)
- FR13. IF the win is not credited at once (`BUSY`, `INTERNAL`, no answer, or any refusal except `CONFLICT` and `BAD_REQUEST`), THEN THE SYSTEM SHALL answer the outcome marked `creditPending` and keep the round `win_pending`, and SHALL repeat the win call with the same transaction id and the round's own launch token at pauses growing from 5 seconds to a ceiling of 1 hour until it is accepted, parking only a round the hub answers `CONFLICT` or `BAD_REQUEST` for an operator. (R10)
- FR14. THE SYSTEM SHALL keep every round, with its bet, outcome, win, status and launch token, without expiry. (R17)
- FR15. WHEN a bet call or a win call has failed more than 5 times for a round, THE SYSTEM SHALL log an error line `bet_pending_alert` or `win_pending_alert` for every further attempt, and `GET /healthz` SHALL report how many rounds wait for a bet or a win, how many are parked and the age of the oldest. (R10)
- FR16. THE SYSTEM SHALL NOT offer demo play or guest play: every call under `/api/game/` without a launch token is refused, and no game window plays a round without the server. (R3)
- FR17. WHEN the upload script runs, THE SYSTEM SHALL send the tile image of each of the twelve games to the hub's `GameService.UpdateImage` under the game's symbol, image key `1x1` and the shared catalogue key. (R1)
- FR18. WHEN a game window opens with `?token=` in its address, THE SYSTEM SHALL keep the token, send it as `Authorization: Bearer` on every call to the server, and show the balance the session answer returns. (R4)
- FR19. THE SYSTEM SHALL NOT let the browser decide an outcome, a bet or a win: no game window contains local play, and every round it shows is the one the server answered. (R7)
- FR20. WHEN the player spins, THE SYSTEM SHALL show no outcome before the server has accepted the bet, show the balance after the bet while the animation runs, and add the win to the shown balance when the animation ends. (R5)
- FR21. THE SYSTEM SHALL show the total win of a round as the credited amount in cents, whatever the animation does. (R13)
- FR22. THE SYSTEM SHALL offer in each game only the bets of that game's own ladder from 0.10 to 10.00. (R8)
- FR23. IF the balance shown is below the bet and the balance the server returns when asked is below the bet too, THEN THE SYSTEM SHALL refuse the spin without moving the reels, show "NOT ENOUGH FUNDS" and a DEPOSIT button, and WHEN the player presses the button THE SYSTEM SHALL post `{type: 'apex:deposit'}` to the parent window. (R6)
- FR24. WHEN the server answers `session_expired`, THE SYSTEM SHALL show "SESSION EXPIRED. REOPEN THE GAME." and SHALL NOT send a spin. (R19)
- FR25. WHEN a spin answer is marked `creditPending`, THE SYSTEM SHALL show the outcome with the win marked "BEING CREDITED". (R10)
- FR26. WHEN a spin is sent, THE SYSTEM SHALL keep its key and bet in the tab's session storage until a definite answer arrives, and WHEN the window is reloaded or SPIN is pressed after a lost connection THE SYSTEM SHALL send that same key with that same bet, show that bet and lock the bet controls until a definite answer arrives, and show the round it returns. (R9)
- FR27. THE SYSTEM SHALL show on the information screen of every game the credit "Art by APEXSLOTS (apexslots.eu), CC BY 4.0". (R14)
- FR28. WHEN the server answers `busy`, `bet_refused` or `unavailable`, THE SYSTEM SHALL show the matching message, reveal no outcome and leave SPIN usable, a `busy` answer keeping the stored spin key and a `bet_refused` or `unavailable` answer clearing it. (R5)
- FR29. IF the hub answers a bet with 401, 403 or 404 (nothing moved), THEN THE SYSTEM SHALL answer `unavailable`, mark the round refused and never repeat that bet. (R11)
- FR30. WHEN the sweeper repeats a leg, THE SYSTEM SHALL claim the round with a lease in a short transaction before the call, make the call outside any transaction, and write the outcome only if the round still has the status it claimed, and a round saved by a spin request SHALL NOT be due before that request's 8 seconds have passed, so that no two callers repeat one leg. (R11)

## Decisions

| decision | chosen | alternatives considered | why |
|---|---|---|---|
| Where the code lives | `server/` (game server) and `client-kit/` (shared browser module) inside this fork, beside the twelve game folders | A separate repository for the server; the server inside one game | settled with user (origin Q12 "server beside the games"); the server must import the twelve engines and serve their built bundles (R4, R7) |
| How the engines reach the server | Imported in place from `../<game>/src/engine`, bundled with esbuild; the engines are not edited | Copies of the engines in `server/` | settled with user (Q10). The engines import extensionless and load only through a bundler or `tsx`; copies would drift from the games the client animates (R7) |
| Stack | Node 22, TypeScript strict, Fastify, `pg` with plain SQL, `node-pg-migrate` SQL migrations, vitest, `tsx`, esbuild | Express; an ORM; Jest | settled with user (Q13). Fastify `inject` drives the production application without a socket; vitest is already the games' runner |
| Types of the hub wire | Generated from `from-origin/contract.openapi.yaml` by `openapi-typescript` (`--check` is the conformance command) | Hand-written types with ajv-validated fixtures | settled with user (Q9). The compiler then catches a drift of the wire |
| Round flow | Draw and save, then `bet`, then `win` only when the win is above zero, all inside one spin request; the browser gets the outcome after the bet is accepted | Bet first and draw after; one call with bet and win | settled with user in the origin (two calls, draw first): the hub books a win before a bet when both arrive together (R5, R6, R11). The refused bet drops the saved result, so R6's "without drawing an outcome" holds for everything the player or the journal keeps |
| Round store | Postgres of the game server, table `rounds`, no expiry, status `bet_pending`, `win_pending`, `settled`, `refused`, `parked`; the launch token is stored in clear because a repeat must carry it | Redis with a TTL; the token hashed | settled with user in the origin (R17); the hub restores a lapsed session only for the round's own token, so the token must be sendable again (R10, R19) |
| Spin identity | Unique `(token, spin key)`; the round id is minted by the server (UUID v4) per accepted key | The client's key as the round id; a key unique per game only | the hub finds a round by partner and external id and never compares the player, so a client-chosen id could book into another player's round (origin Decisions, round ids) (R9, R11) |
| One request in flight per key | The first request inserts the round; a repeat of the key that finds a round still `bet_pending` takes the round over from the stored state, a repeat that finds it `settled`, `win_pending`, `parked` or `refused` answers it (`win_pending` and `parked` with `creditPending`) | A lock per key | the unique index makes the first insert the owner; the hub's own idempotency by transaction id makes a repeated bet harmless (R9) |
| Wait for the bet | The spin request waits at most `HUB_CALL_TIMEOUT_MS` (8 000) for the bet and repeats a `BUSY` answer inside that budget every 0.2 s growing to 1 s, then answers `busy`; the sweeper keeps repeating the bet with the same transaction id | Answer `busy` at the first `BUSY`; wait without a bound; void the round | settled with user (Q18). The hub answers `BUSY` to any second call of the same player (`Casino-Game-Aggregator/crates/engine/src/spin.rs:468-477`), so a stuck win or a second window would show "busy" on ordinary spins; a drawn round is never voided (origin business rule) (R11) |
| Retry of unfinished legs | An in-process sweeper over `rounds` by `next_attempt_at`, pauses 5 s doubling to 1 h, repeating the bet of a `bet_pending` round and the win of a `win_pending` round; a round is claimed by a lease (`next_attempt_at = now() + lease` in a short transaction using `FOR UPDATE SKIP LOCKED`), the hub call runs outside any transaction, and the outcome is written `WHERE status = <claimed status>`; a round saved by a spin request starts with `next_attempt_at = now() + 8 s + margin` | A transaction held open across the hub call; a separate worker process; a queue | settled with user (Q17). An external call inside a transaction is ruled out by `~/.claude/ARCHITECTURE.md` §External effects and pins a pool connection for up to 8 s; the lease keeps two replicas and the live request apart, and the conditional write keeps a late sweeper from reverting `settled` (R10, R11) |
| A bet refused for good by the hub's configuration | 401, 403 and 404 on a bet end the round `refused` (nothing moved), answer `unavailable` and clear the window's key; `SESSION_NOT_FOUND` on a bet ends it `refused` and answers `session_expired` | Keep the round and let the sweeper repeat the bet "later" | settled with user (Q16). A bet repeated hours after the player was told the game was unavailable would debit a round they never saw; the contract's "retried later" is the right rule for a win and is clarified for a bet by amendment A3 (R11, R19) |
| Alert | An error log line `bet_pending_alert` or `win_pending_alert` per attempt after the fifth and `GET /healthz` counts; no pager integration here | Telegram; a metrics exporter; the bet leg left to `/healthz` | settled with user (Q15, Q21). A bet answered `INTERNAL` may already have debited the player; the channel is chosen at deploy |
| Stale balance in the window | When the shown balance is below the bet the window first asks `GET /api/game/session` and refuses with NOT ENOUGH FUNDS only if the fresh balance is below the bet too | Refuse on the shown balance; always send the spin | settled with user (Q19). After a deposit in another tab a window that trusts its own balance sends nothing and never refreshes it (R6) |
| Bet of a kept spin | While a spin key is stored, the window shows the stored bet and locks the bet controls until a definite answer | Free controls with the stored bet shown only in the replayed round | settled with user (Q20). Otherwise the screen reads 5.00 while 1.00 is charged (R9) |
| Cents | `units = Math.round(totalWin * LINES)`, `winCents = floor((betCents * units * 2 + LINES) / (2 * LINES))` in integers (round half up) | Round the float `totalWin * betCents` | all paytable values are integers, so `totalWin * LINES` is an integer; floats misround the half cents of The Dynasty at bet 0.10 and the thirds of Tropic Escape (R12) |
| Random source | An adapter of the engines' `RNG` over `crypto.getRandomValues` with a `Uint32Array(1024)` buffer (the adapter the sims already use), never `randomSeed()` or `mulberry32` | `crypto.randomInt` per draw (does not fit the `next()` float interface) | 32-bit granularity gives a bias of about 2^-25 for the reel lengths in use; the adapter is the one the source already proves (R7) |
| Browser API | Keep the shape the clients already speak: `GET /api/game/session`, `POST /api/game/spin`; failures are `{ok: false, error: <code>}` with codes `session_expired`, `insufficient_funds`, `bet_refused`, `bad_request`, `busy`, `unavailable`; `/api/game/deliver` is not served and the clients drop it; the server never sends `held` or `pending` | A new protocol | the clients already consume the full round object; the win is credited at the spin, so `deliver` has nothing to do (R5, R13) |
| Token in the browser | Read from `?token=`, kept in `sessionStorage`, sent as `Authorization: Bearer`; the address bar keeps the token so a reload of the frame still opens the game | A cookie; stripping the token from the address | the game runs in a frame on another origin where cookies are partitioned (origin Decisions, launch URL) (R4) |
| Client changes | One shared module `client-kit/` (token, authorised calls, spin key, error codes, deposit message); each game's `wallet.ts` keeps its `GAME` constant and re-exports the kit | Patch the three `wallet.ts` variants in place | settled with user (Q11). Three variants patched separately triple the places a mistake lives (R6, R9, R19) |
| Demo in the clients | Removed: the local branch of `main.ts`, the `DEMO` label, the title suffix `- Demo`; the idle first grid is a constant | A demo behind a build flag | settled with user (Q12). R3 and R7 leave no browser that plays alone |
| Language | English only; `lang` is read and ignored; the new messages are English in the house style (upper case, no dashes) | Translate the new messages; translate everything | settled with user (Q7, also in the origin's `author-qa.md`) |
| After a lost connection | The key and bet of an unfinished spin stay in `sessionStorage` per game and token and are replayed at the next SPIN and at boot | A new key per press | settled with user (Q6, in the origin's `author-qa.md`): the player sees what they were paid for (R9) |
| Deposit button | Posts `{type: 'apex:deposit'}` on the press only, to the origin of the `lobby` address, to any origin when `lobby` is empty; the existing `apex:low-balance` is dropped | Keep posting `apex:low-balance` before the spin | settled with user (Q8). The old message targets the game's own origin and never reaches a parent on another origin (R6). The message, the twelve symbols and the end of a bet on 403/404 go to the hub as contract amendments A1, A2 and A3 |
| Tile upload | A script with `@grpc/grpc-js` and `@grpc/proto-loader` over a vendored copy of the hub's `catalog.proto`, image key `1x1` from `tiles/<symbol>.webp`, the key from `CATALOG_ADMIN_KEY` | The proto read from the hub's checkout at run time | the hub's `UpdateImage` is unchanged by this task and not in the contract; a vendored copy needs no sibling checkout (R1) |
| Framing and referrer | `FRAME_ANCESTORS` is required and sent as `Content-Security-Policy: frame-ancestors`; `Referrer-Policy: no-referrer` | Any ancestor allowed | default. The token is in the address (R4, R18) |
| Static serving | The game server serves `public/play/<symbol>/` built by a script with `GAME_BASE=/play/<symbol>/`; `index.html` at `/play/<symbol>` without a trailing slash | A separate static host | the launch address of the contract is `{playUrl}/play/{symbol}?token=…` on the game server's own address (R4) |
| Migrations | Run by `npm run migrate` before the start; the application does not migrate itself | Migrate on start | a failed migration must not take a running replica down |
| Conformance with the hub's symbols | The registry holds the twelve symbols of the hub catalog; a test compares the registry with the folder names of the repo. The comparison with the contract waits for amendment A2 | A test against the contract now | the contract does not list the symbols yet |
| Sources that disagree | R6 says "without drawing an outcome", the origin's order of one spin draws first: the plan keeps the order and deletes the drawn result of a refused bet | Draw after the bet | no actor sees the difference; the drawn-first order lets a repeated bet resume the same outcome after a crash (origin business rule) |

## Seams

| seam | what it covers | existing / new |
|---|---|---|
| S1 — the application factory `buildApp(config)` of `server/src/app.ts` with its production wiring, driven through Fastify `inject`, against a real Postgres (`TEST_DATABASE_URL`) and a stub hub (a local HTTP server that checks the HMAC and every body against the contract) | session, spin, refusals, idempotent repeat, pending win, bet retry, sweeper (called directly with a controllable clock), health, static pages and headers | new — this is also the app seam: only the hub is faked |
| S2 — `dealRound(symbol, rng)` and `winCents(...)` of `server/src/games/registry.ts` and `server/src/money.ts` over the twelve games | bets only on the ladder, win in whole cents, the total win of every game as an integer number of line units, the secure random adapter | new |
| S3 — the module `client-kit` (vitest with jsdom, `fetch` faked) plus the guard test `client-kit/tests/games.test.ts` over the migrated games' sources, plus a walk of the real window in a browser with `ui-verify` against a running server with the stub hub | token, calls, spin key, messages, deposit message; per game: no local play, ladder, credit line, title; the screens | new |
| S4 — `uploadTiles(config)` of `server/src/tiles/uploadTiles.ts` against a local gRPC server that implements `GameService.UpdateImage` and checks the key | the twelve uploads | new |

## Critical files

| file | what changes |
|---|---|
| `CLAUDE.md` | stand and test commands of the repo: Postgres for the tests, per-package scripts, the contract `Check:` |
| `.gitignore` | also ignores the built bundles `server/public/` and `.env` files |
| `server/package.json` | scripts (`codegen`, `codegen:check`, `build`, `build:games`, `migrate`, `dev:stub`, `upload-tiles`, `test`) and dependencies |
| `server/package-lock.json` | resolves the server's dependencies |
| `server/tsconfig.json` | strict TypeScript of the server; resolves the games' engines by the bundler rule |
| `server/vitest.config.ts` | test setup of the server: `TEST_DATABASE_URL`, serial files that share one database |
| `server/src/hub/generated.ts` | types generated from `from-origin/contract.openapi.yaml` by `openapi-typescript` |
| `server/tests/hub-contract.test.ts` | every example of the contract equals its fixture; each fixture is typed by the generated types |
| `server/tests/fixtures/balance_ok.json` | balance call and its answer, from the contract |
| `server/tests/fixtures/bet_ok.json` | bet call and its answer, from the contract |
| `server/tests/fixtures/bet_refused.json` | refused bet and its answer, from the contract |
| `server/tests/fixtures/win_ok.json` | win call and its answer, from the contract |
| `server/src/rng.ts` | adapter of the engines' `RNG` over `crypto.getRandomValues` |
| `server/src/money.ts` | `winCents(betCents, totalWin, lines)` in integer arithmetic, round half up |
| `server/src/games/ladder.ts` | the bet ladder 0.10 to 10.00 in whole cents and its check |
| `server/src/games/registry.ts` | the twelve games: symbol, name, lines, `dealRound` over each engine |
| `server/build.mjs` | esbuild bundle of the server together with the twelve engines |
| `server/tests/rng.test.ts` | range and source of the random adapter |
| `server/tests/money.test.ts` | cents arithmetic cases, no cap |
| `server/tests/ladder.test.ts` | which bets pass |
| `server/tests/registry.test.ts` | twelve symbols equal to the repo's folders; rounds of every game settle to whole line units |
| `server/src/config.ts` | settings read from the environment, required ones fail the start |
| `server/src/app.ts` | `buildApp(config)`: routes, headers, wiring of the hub client, the journal and the sweeper |
| `server/src/main.ts` | starts the application and the sweeper timer |
| `server/src/hub/client.ts` | typed `balance`, `bet`, `win` calls to the hub with the call timeout |
| `server/src/hub/sign.ts` | HMAC-SHA256 hex of the raw body |
| `server/src/http/session.ts` | `GET /api/game/session` |
| `server/src/http/static.ts` | `/play/<symbol>` pages from `PUBLIC_DIR`, path-safe, with the framing and referrer headers |
| `server/dev/stub-hub.ts` | stub hub: signed `balance`/`bet`/`win` with wallets and the test tokens; serves `host.html` |
| `server/dev/host.html` | host page that frames a game and logs the messages it posts, standing in for the casino site |
| `server/scripts/build-games.mjs` | builds each game (or the symbols named after `--`) with `GAME_BASE=/play/<symbol>/` into `server/public/play/<symbol>/` |
| `server/tests/helpers/app.ts` | builds the test application with the stub hub |
| `server/tests/session.test.ts` | session endpoint through the application |
| `server/tests/sign.test.ts` | signature of the hub calls |
| `server/tests/static.test.ts` | pages, 404s, path traversal and headers |
| `server/tests/fixtures/play/stellar-sevens/index.html` | page served by the static tests |
| `server/migrations/001_rounds.sql` | table `rounds` |
| `server/src/db/pool.ts` | Postgres pool |
| `server/src/db/rounds.ts` | queries over `rounds`: insert by key, transitions, due rounds with `SKIP LOCKED` |
| `server/src/spin/spin.ts` | the spin: draw, save, bet, win, refusals, repeat of a key |
| `server/src/spin/outcome.ts` | the answer shapes of a spin |
| `server/src/http/spin.ts` | `POST /api/game/spin` and the mapping of outcomes to browser codes |
| `server/tests/helpers/db.ts` | fresh schema per test file on `TEST_DATABASE_URL` |
| `server/tests/spin.test.ts` | bet, win and zero-win rounds through the application |
| `server/tests/spin-refused.test.ts` | refused bets and invalid spins |
| `server/tests/spin-idempotency.test.ts` | repeat of a key, the keys of two players |
| `server/migrations/002_round_retry.sql` | retry columns and the sweeper index of `rounds` |
| `server/src/spin/sweeper.ts` | repeats unfinished bets and wins; parking; the alert |
| `server/src/spin/backoff.ts` | pause after an attempt: 5 s doubling to 1 h |
| `server/src/http/health.ts` | `GET /healthz` |
| `server/tests/sweeper.test.ts` | sweeper with a controllable clock |
| `server/tests/backoff.test.ts` | growth and ceiling of the pause |
| `server/tests/health.test.ts` | `/healthz` counts and the alert line |
| `server/tests/spin-pending.test.ts` | answers while a win or a bet is unfinished |
| `server/src/tiles/uploadTiles.ts` | uploads the twelve tiles over gRPC |
| `server/scripts/upload-tiles.ts` | command line of the upload |
| `server/proto/catalog.proto` | copy of the hub's `proto/gamehub/v1/catalog.proto` |
| `server/tests/uploadTiles.test.ts` | the twelve uploads, a wrong key, a missing file |
| `server/tests/helpers/fakeCatalogServer.ts` | local gRPC server that implements `GameService.UpdateImage` |
| `server/tests/fixtures/tile.webp` | small image for the upload test |
| `client-kit/package.json` | package of the shared browser module |
| `client-kit/package-lock.json` | resolves its dependencies |
| `client-kit/tsconfig.json` | strict TypeScript with DOM |
| `client-kit/vitest.config.ts` | jsdom environment |
| `client-kit/src/index.ts` | public surface of the kit |
| `client-kit/src/wallet.ts` | `createWallet(game)`: token, authorised calls, error codes, session and spin |
| `client-kit/src/spinKey.ts` | key and bet of the unfinished spin in `sessionStorage` |
| `client-kit/src/messages.ts` | the English texts of the new messages |
| `client-kit/src/deposit.ts` | `apex:deposit` post to the parent |
| `client-kit/tests/wallet.test.ts` | calls, token, codes with `fetch` faked |
| `client-kit/tests/spinKey.test.ts` | keep, replay, clear |
| `client-kit/tests/deposit.test.ts` | target origin of the message |
| `client-kit/tests/games.test.ts` | guard over the migrated games' sources |
| `client-kit/tests/migratedGames.ts` | the list of games the guard checks |
| `stellar-sevens/src/game/wallet.ts` | shrinks to the `GAME` constant and the wallet made by `client-kit` |
| `stellar-sevens/src/game/main.ts` | local play, demo balance and `deliver` removed; boot, spin, error, deposit and resume paths use the kit |
| `stellar-sevens/src/game/hud.ts` | bet ladder capped at 10.00, `DEMO` label gone, DEPOSIT button and the credit-pending marker |
| `stellar-sevens/src/game/gameinfo.ts` | credit line `Art by APEXSLOTS (apexslots.eu), CC BY 4.0` on the information screen |
| `stellar-sevens/src/game/style.css` | styles of the DEPOSIT button and the credit-pending marker |
| `stellar-sevens/index.html` | title without the suffix `- Demo` |
| `nitro-hot/src/game/wallet.ts` | shrinks to the `GAME` constant and the wallet made by `client-kit` |
| `nitro-hot/src/game/main.ts` | local play, demo balance and `deliver` removed; boot, spin, error, deposit and resume paths use the kit |
| `nitro-hot/src/game/hud.ts` | bet ladder capped at 10.00, `DEMO` label gone, DEPOSIT button and the credit-pending marker |
| `nitro-hot/src/game/gameinfo.ts` | credit line `Art by APEXSLOTS (apexslots.eu), CC BY 4.0` on the information screen |
| `nitro-hot/src/game/style.css` | styles of the DEPOSIT button and the credit-pending marker |
| `nitro-hot/index.html` | title without the suffix `- Demo` |
| `scorching-hot/src/game/wallet.ts` | shrinks to the `GAME` constant and the wallet made by `client-kit` |
| `scorching-hot/src/game/main.ts` | local play, demo balance and `deliver` removed; boot, spin, error, deposit and resume paths use the kit |
| `scorching-hot/src/game/hud.ts` | bet ladder capped at 10.00, `DEMO` label gone, DEPOSIT button and the credit-pending marker |
| `scorching-hot/src/game/gameinfo.ts` | credit line `Art by APEXSLOTS (apexslots.eu), CC BY 4.0` on the information screen |
| `scorching-hot/src/game/style.css` | styles of the DEPOSIT button and the credit-pending marker |
| `scorching-hot/index.html` | title without the suffix `- Demo` |
| `discovery-voyage/src/game/wallet.ts` | shrinks to the `GAME` constant and the wallet made by `client-kit` |
| `discovery-voyage/src/game/main.ts` | local play, demo balance and `deliver` removed; boot, spin, error, deposit and resume paths use the kit |
| `discovery-voyage/src/game/hud.ts` | bet ladder capped at 10.00, `DEMO` label gone, DEPOSIT button and the credit-pending marker |
| `discovery-voyage/src/game/gameinfo.ts` | credit line `Art by APEXSLOTS (apexslots.eu), CC BY 4.0` on the information screen |
| `discovery-voyage/src/game/style.css` | styles of the DEPOSIT button and the credit-pending marker |
| `discovery-voyage/index.html` | title without the suffix `- Demo` |
| `fairytale/src/game/wallet.ts` | shrinks to the `GAME` constant and the wallet made by `client-kit` |
| `fairytale/src/game/main.ts` | local play, demo balance and `deliver` removed; boot, spin, error, deposit and resume paths use the kit |
| `fairytale/src/game/hud.ts` | bet ladder capped at 10.00, `DEMO` label gone, DEPOSIT button and the credit-pending marker |
| `fairytale/src/game/gameinfo.ts` | credit line `Art by APEXSLOTS (apexslots.eu), CC BY 4.0` on the information screen |
| `fairytale/src/game/style.css` | styles of the DEPOSIT button and the credit-pending marker |
| `fairytale/index.html` | title without the suffix `- Demo` |
| `house-of-ra/src/game/wallet.ts` | shrinks to the `GAME` constant and the wallet made by `client-kit` |
| `house-of-ra/src/game/main.ts` | local play, demo balance and `deliver` removed; boot, spin, error, deposit and resume paths use the kit |
| `house-of-ra/src/game/hud.ts` | bet ladder capped at 10.00, `DEMO` label gone, DEPOSIT button and the credit-pending marker |
| `house-of-ra/src/game/gameinfo.ts` | credit line `Art by APEXSLOTS (apexslots.eu), CC BY 4.0` on the information screen |
| `house-of-ra/src/game/style.css` | styles of the DEPOSIT button and the credit-pending marker |
| `house-of-ra/index.html` | title without the suffix `- Demo` |
| `pearl-reef/src/game/wallet.ts` | shrinks to the `GAME` constant and the wallet made by `client-kit` |
| `pearl-reef/src/game/main.ts` | local play, demo balance and `deliver` removed; boot, spin, error, deposit and resume paths use the kit |
| `pearl-reef/src/game/hud.ts` | bet ladder capped at 10.00, `DEMO` label gone, DEPOSIT button and the credit-pending marker |
| `pearl-reef/src/game/gameinfo.ts` | credit line `Art by APEXSLOTS (apexslots.eu), CC BY 4.0` on the information screen |
| `pearl-reef/src/game/style.css` | styles of the DEPOSIT button and the credit-pending marker |
| `pearl-reef/index.html` | title without the suffix `- Demo` |
| `samurai/src/game/wallet.ts` | shrinks to the `GAME` constant and the wallet made by `client-kit` |
| `samurai/src/game/main.ts` | local play, demo balance and `deliver` removed; boot, spin, error, deposit and resume paths use the kit |
| `samurai/src/game/hud.ts` | bet ladder capped at 10.00, `DEMO` label gone, DEPOSIT button and the credit-pending marker |
| `samurai/src/game/gameinfo.ts` | credit line `Art by APEXSLOTS (apexslots.eu), CC BY 4.0` on the information screen |
| `samurai/src/game/style.css` | styles of the DEPOSIT button and the credit-pending marker |
| `samurai/index.html` | title without the suffix `- Demo` |
| `tropic-escape/src/game/wallet.ts` | shrinks to the `GAME` constant and the wallet made by `client-kit` |
| `tropic-escape/src/game/main.ts` | local play, demo balance and `deliver` removed; boot, spin, error, deposit and resume paths use the kit |
| `tropic-escape/src/game/hud.ts` | bet ladder capped at 10.00, `DEMO` label gone, DEPOSIT button and the credit-pending marker |
| `tropic-escape/src/game/gameinfo.ts` | credit line `Art by APEXSLOTS (apexslots.eu), CC BY 4.0` on the information screen |
| `tropic-escape/src/game/style.css` | styles of the DEPOSIT button and the credit-pending marker |
| `tropic-escape/index.html` | title without the suffix `- Demo` |
| `the-dynasty/src/game/wallet.ts` | shrinks to the `GAME` constant and the wallet made by `client-kit` |
| `the-dynasty/src/game/main.ts` | local play, demo balance and `deliver` removed; boot, spin, error, deposit and resume paths use the kit |
| `the-dynasty/src/game/hud.ts` | bet ladder capped at 10.00, `DEMO` label gone, DEPOSIT button and the credit-pending marker |
| `the-dynasty/src/game/gameinfo.ts` | credit line `Art by APEXSLOTS (apexslots.eu), CC BY 4.0` on the information screen |
| `the-dynasty/src/game/style.css` | styles of the DEPOSIT button and the credit-pending marker |
| `the-dynasty/index.html` | title without the suffix `- Demo` |
| `golden-papyrus/src/game/wallet.ts` | shrinks to the `GAME` constant and the wallet made by `client-kit` |
| `golden-papyrus/src/game/main.ts` | local play, demo balance and `deliver` removed; boot, spin, error, deposit and resume paths use the kit |
| `golden-papyrus/src/game/hud.ts` | bet ladder capped at 10.00, `DEMO` label gone, DEPOSIT button and the credit-pending marker |
| `golden-papyrus/src/game/gameinfo.ts` | credit line `Art by APEXSLOTS (apexslots.eu), CC BY 4.0` on the information screen |
| `golden-papyrus/src/game/style.css` | styles of the DEPOSIT button and the credit-pending marker |
| `golden-papyrus/index.html` | title without the suffix `- Demo` |
| `bumper-crop/src/game/wallet.ts` | shrinks to the `GAME` constant and the wallet made by `client-kit` |
| `bumper-crop/src/game/main.ts` | local play, demo balance and `deliver` removed; boot, spin, error, deposit and resume paths use the kit |
| `bumper-crop/src/game/hud.ts` | bet ladder capped at 10.00, `DEMO` label gone, DEPOSIT button and the credit-pending marker |
| `bumper-crop/src/game/gameinfo.ts` | credit line `Art by APEXSLOTS (apexslots.eu), CC BY 4.0` on the information screen |
| `bumper-crop/src/game/style.css` | styles of the DEPOSIT button and the credit-pending marker |
| `bumper-crop/index.html` | title without the suffix `- Demo` |
| `README.md` | how to run the game server, its settings, the build of the bundles; the art credit |
| `server/.env.example` | every setting of the server with a sample value |
| `server/tests/games-built.test.ts` | every built bundle carries the credit and no demo title |
| `server/tests/helpers/builtGames.ts` | paths of the built bundles |
| `server/tests/e2e.test.ts` | all twelve symbols: page, session, spin through the application |

Untouched dependents, from the trace:

- `<game>/src/engine/*`: the engines are imported unchanged by the server (Q10); `src/engine/rng.ts` keeps `mulberry32` and `randomSeed`, which the server never calls.
- `<game>/src/game/board.ts`, `audio.ts`, `assets.ts`, `fit.ts`, `tween.ts`, `config/*`: presentation only; the cosmetic `Math.random` in `board.ts` and the-dynasty's `hud.ts:60` decides no outcome.
- `<game>/src/sim/*`, `<game>/tests/engine.test.ts`, `<game>/slotopol/*`: the RTP proofs stay as published.
- `<game>/package.json`, `<game>/vite.config.ts`, `<game>/tsconfig.json`: unchanged; the build reads `GAME_BASE` as it already does.
- `tiles/*.webp`: read by the upload script, never changed.
- `LICENSE`, `LICENSE-ART.md`: unchanged; the credit line (R14) is in each game's info screen.

## Steps

1. T001: stand up the hub wire in this repo's terms: the server package, the types generated from the contract, fixtures validated against it, and the repo's `CLAUDE.md` with the stand and test commands (the contract setup item).
2. T002: the twelve engines behind one registry, the secure random adapter, the bet ladder and the cents arithmetic.
3. T003: the application with its configuration, the signed hub client, the session endpoint, the static pages and headers, and the stub hub for tests and development.
4. T004: the round journal and the spin: draw, save, bet, win, refusals and the repeated key.
5. T005: the sweeper for unfinished bets and wins, backoff, the alert and `/healthz`.
6. T006: the tile upload script.
7. T007: the shared browser module and the first game window (Stellar Sevens); T008-T011: the other eleven windows in batches.
8. T012: the build of the twelve bundles under `/play/<symbol>/`, the served pages checked end to end, and the README.
9. Carried to the deploy step, not built here: the subdomain and its certificate, sizing of the server and its Postgres, the container image, `FRAME_ANCESTORS` and the other settings in the secret store, `HUB_SECRET_KEY` equal to the partner's `secretKey`, the egress address in the partner's `allowIps`, running `upload-tiles` once after the hub's `sync`, a pager on `win_pending_alert`, and the one-off re-check of each game's RTP with its own `npm run sim:exact`.

## Triggers

- `ui-contract.md`: fired. The twelve game windows change in what the player sees and does (states, spin key, deposit button, messages).
- `flow-overview.md`: fired. A spin crosses the browser, this server and the hub; drawn upward from the browser, meeting the origin's downward tree at the contract.
- `contract.openapi.yaml`: not written here, this repo consumes the origin's. The verdict `AMENDMENTS_REQUIRED` (A1 the deposit message, A2 the twelve symbols, A3 a bet ends on 401/403/404) is written to the origin's `feedback/slots-server.md`.
- `db-model-diff.md`: fired beyond the consumer flow's two triggers: this half creates its own database.
- `api-endpoints-diff.md`: fired beyond the consumer flow's two triggers: this half adds the server's browser API.
