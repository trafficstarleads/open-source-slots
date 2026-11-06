# Tasks — own-slots-or-free-pragmatic · slots-server

## Contract
- File: `from-origin/contract.openapi.yaml`
- Log: `C:\Users\GamePC\Desktop\projects\alexpay\own-slots-or-free-pragmatic\Casino-Game-Aggregator\tasks\own-slots-or-free-pragmatic\contract-log.md`
- Id: `d2f3116de475e94b90045b41e9f5c3a0a91b2b94` — `git hash-object`
- Check: `npm --prefix server run codegen:check`

## Commands

Derived at preflight. The repo has no CI workflow, no formatter and no linter; `server/` does not exist
before T001, so its scripts come from `plan.md` §Critical files and are checked against T001's
`package.json` when it lands. Tests that need Postgres read `TEST_DATABASE_URL`; the stand is the
container `slots-test-pg` (`docker run -d --name slots-test-pg -e POSTGRES_PASSWORD=test -p 5434:5432 postgres:17`),
`TEST_DATABASE_URL=postgres://postgres:test@localhost:5434/postgres`.

### C:\Users\GamePC\Desktop\projects\alexpay\own-slots-or-free-pragmatic\slots-server

- Item tests (run from `server/`): `timeout 1800 npx vitest run --reporter=dot <test paths>`
- Full suite (source: `plan.md` §Seams S1/S2/S4 and §Critical files `server/package.json` `test`; no CI workflow exists): `timeout 1800 npm --prefix server test --silent`
- Typecheck (gate check 2; no formatter or linter is configured): `npm --prefix server exec -- tsc -p server/tsconfig.json --noEmit`
- Coverage (Cobertura XML to `server/coverage/cobertura-coverage.xml`; needs `@vitest/coverage-v8` in `server/package.json`): `timeout 1800 npx vitest run --reporter=dot --coverage --coverage.provider=v8 --coverage.reporter=cobertura <test paths>`
- Contract check: `npm --prefix server run codegen:check`
- Migration check, parity harness, import-boundary lint: none in this repo.

## Baseline failures

### C:\Users\GamePC\Desktop\projects\alexpay\own-slots-or-free-pragmatic\slots-server

none for `server/`: the package does not exist at HEAD, so there is no suite to fail. The twelve games'
own `npm test` suites are not touched by T001-T006; the batch that reaches T007 runs their baseline
before its first item.

## Items

- [x] **T001** Stand up the hub wire in this repo: server package, types generated from the contract, fixtures, `CLAUDE.md`
  - `_Depends: —_` · `_Boundary: server, CLAUDE.md, .gitignore_`
  - **Files:** `CLAUDE.md`,
    `.gitignore`,
    `server/package.json`,
    `server/package-lock.json`,
    `server/tsconfig.json`,
    `server/vitest.config.ts`,
    `server/src/hub/generated.ts`,
    `server/tests/hub-contract.test.ts`,
    `server/tests/fixtures/balance_ok.json`,
    `server/tests/fixtures/bet_ok.json`,
    `server/tests/fixtures/bet_refused.json`,
    `server/tests/fixtures/win_ok.json`
  - **Closes:** — contract setup · **Seam:** S1 (its harness: `vitest` over `server/tests`)
  - **Contract:** contract.openapi.yaml §/webhook/{partner}/balance, §/webhook/{partner}/bet, §/webhook/{partner}/win, §x-launch-url, §x-game-window-messages, §x-catalog
  - **Acceptance:** `npm --prefix server run codegen` writes `server/src/hub/generated.ts` from `from-origin/contract.openapi.yaml`; `npm --prefix server run codegen:check` exits 0 when the file is current and non-zero when the contract changed. Every example of the contract is equal to its fixture in `server/tests/fixtures/`, and each fixture is typed by the generated types. `CLAUDE.md` names the commands that bring the stand up (Postgres for the tests in a container, `TEST_DATABASE_URL`) and run each package's tests. _(`tasks.md` §Contract and `from-origin/contract.openapi.yaml`, abridged)_
    Cases: a changed example in the contract fails `hub-contract.test.ts`; a hand-edited `generated.ts` fails `codegen:check`.
  - **Commit:** `chore(server): add the server package with types generated from the hub contract`

- [ ] **T002** Add the twelve engines behind one registry, the secure random adapter, the bet ladder and the cents arithmetic
  - `_Depends: T001_` · `_Boundary: server/src, server/tests, server/build.mjs, server/package.json, server/package-lock.json_`
  - **Files:** `server/src/rng.ts`,
    `server/src/money.ts`,
    `server/src/games/ladder.ts`,
    `server/src/games/registry.ts`,
    `server/build.mjs`,
    `server/tests/rng.test.ts`,
    `server/tests/money.test.ts`,
    `server/tests/ladder.test.ts`,
    `server/tests/registry.test.ts`,
    `server/package.json`,
    `server/package-lock.json`
  - **Closes:** FR5, FR11 · **Seam:** S2
  - **Acceptance:** FR5: WHEN a valid spin arrives, THE SYSTEM SHALL draw the round on the server with a cryptographically secure random source, save it under a round id the server mints, and only then call the hub `bet`, and SHALL NOT take an outcome, a bet or a win from the browser. (R7) FR11: THE SYSTEM SHALL turn the engine's total win and the bet into whole cents rounded to the nearest cent, in integer arithmetic, SHALL credit that whole total in the one `win` call free games and bonus steps included, and SHALL NOT cap it. (R12, R13) FR4's ladder is the list this item ships: bets 10, 20, 40, 60, 80, 100, 120, 140, 160, 180, 200, 300 to 1000 in steps of 100 cents.
    _(`plan.md` §Requirements, FR5, FR11, verbatim)_
    Cases: bet 0.60 is 60 cents and not 59 or 61; The Dynasty (20 lines) with 5 line units at bet 0.10 pays 3 cents (2.5 rounds half up) and not 2; Tropic Escape (9 lines) with 5 units at bet 1.00 pays 56; Bumper Crop (25 lines) with 1 unit at bet 0.10 pays 0; a total win of 10 000 times a 10.00 bet is 10 000 000 cents, uncapped; 0.05, 10.10, 15.00 and 0 are not on the ladder; a draw source returning the largest 32-bit value yields a number below 1; the registry holds exactly the folder names of the repo and no other symbol, and its `symbol`, `name` and `identity` equal `x-catalog.games` of the contract entry by entry (a changed name or a thirteenth game fails); 200 rounds of each game have `totalWin * lines` within 1e-6 of an integer.
  - **Commit:** `feat(server): add the engine registry, the secure random adapter, the ladder and the cents arithmetic`

- [ ] **T003** Serve the game pages and the session: configuration, signed hub client, headers, the stub hub and the bundle build
  - `_Depends: T002_` · `_Boundary: server_`
  - **Files:** `server/src/config.ts`,
    `server/src/app.ts`,
    `server/src/main.ts`,
    `server/src/hub/client.ts`,
    `server/src/hub/sign.ts`,
    `server/src/http/session.ts`,
    `server/src/http/static.ts`,
    `server/dev/stub-hub.ts`,
    `server/dev/host.html`,
    `server/scripts/build-games.mjs`,
    `server/tests/helpers/app.ts`,
    `server/tests/session.test.ts`,
    `server/tests/sign.test.ts`,
    `server/tests/static.test.ts`,
    `server/tests/fixtures/play/stellar-sevens/index.html`,
    `server/package.json`,
    `server/package-lock.json`
  - **Closes:** FR1, FR2, FR3, FR7 · **Guards:** FR16 · **Seam:** S1
  - **Contract:** contract.openapi.yaml §/webhook/{partner}/balance
  - **Acceptance:** FR1: WHEN a browser requests `/play/<symbol>` for one of the twelve symbols, THE SYSTEM SHALL serve that game's page, and for any other symbol or path THE SYSTEM SHALL answer 404. (R4) FR2: WHEN the game window asks for its session with a launch token, THE SYSTEM SHALL call the hub `balance` with that token and answer the balance in whole cents. (R4) FR3: WHEN the hub answers `SESSION_NOT_FOUND` to the balance call or to the bet call of a new spin, THE SYSTEM SHALL answer the browser `session_expired` and SHALL NOT start a round for that token; a bet refused this way, live or repeated by the sweeper, ends its round `refused`. (R19) FR7: THE SYSTEM SHALL sign the raw body of every call to the hub with HMAC-SHA256 under the partner's secret key and send it in the header `X-Signature`. (R18) FR16 (guard): THE SYSTEM SHALL NOT offer demo play or guest play: every call under `/api/game/` without a launch token is refused, and no game window plays a round without the server. (R3)
    _(`plan.md` §Requirements, FR1, FR2, FR3, FR7, FR16, verbatim)_
    Cases: `/play/nope`, `/play/stellar-sevens/../../package.json` and `/api/other` answer 404; the page at `/play/stellar-sevens` carries `Content-Security-Policy: frame-ancestors` from `FRAME_ANCESTORS` and `Referrer-Policy: no-referrer`; the start fails with no `FRAME_ANCESTORS`, `HUB_SECRET_KEY` or `HUB_BASE_URL`; a session call with no `Authorization` header is refused and the hub receives no call; the hub's `SESSION_NOT_FOUND` becomes `session_expired`, and `UNAUTHORIZED`, 403, 404 and a closed port become `unavailable`; the `X-Signature` of a call is 64 lower-case hexadecimal characters of the HMAC-SHA256 of the exact bytes sent, and the stub refuses a body changed by one byte with 401; the session answer carries the balance in whole cents.
  - **Commit:** `feat(server): serve the game pages and the session with a signed hub client`

- [ ] **T004** Play a spin: the round journal, draw, bet, win, refusals and the repeated key
  - `_Depends: T003_` · `_Boundary: server_`
  - **Files:** `server/migrations/001_rounds.sql`,
    `server/src/db/pool.ts`,
    `server/src/db/rounds.ts`,
    `server/src/spin/spin.ts`,
    `server/src/spin/outcome.ts`,
    `server/src/http/spin.ts`,
    `server/src/app.ts`,
    `server/src/hub/client.ts`,
    `server/dev/stub-hub.ts`,
    `server/tests/helpers/db.ts`,
    `server/tests/helpers/app.ts`,
    `server/tests/spin.test.ts`,
    `server/tests/spin-refused.test.ts`,
    `server/tests/spin-idempotency.test.ts`,
    `server/package.json`,
    `server/package-lock.json`
  - **Closes:** FR3, FR4, FR5, FR6, FR8, FR9, FR10, FR11, FR14, FR29 · **Guards:** FR16 · **Seam:** S1
  - **Contract:** contract.openapi.yaml §/webhook/{partner}/bet, §/webhook/{partner}/win
  - **Acceptance:** FR3: WHEN the hub answers `SESSION_NOT_FOUND` to the balance call or to the bet call of a new spin, THE SYSTEM SHALL answer the browser `session_expired` and SHALL NOT start a round for that token; a bet refused this way, live or repeated by the sweeper, ends its round `refused`. (R19) FR4: IF a spin names a game outside the twelve or a bet that is not on that game's ladder between 0.10 and 10.00 in whole cents, THEN THE SYSTEM SHALL refuse it with `bad_request`, draw nothing and call the hub not at all. (R8) FR5: WHEN a valid spin arrives, THE SYSTEM SHALL draw the round on the server with a cryptographically secure random source, save it under a round id the server mints, and only then call the hub `bet`, and SHALL NOT take an outcome, a bet or a win from the browser. (R7) FR6: WHEN the hub accepts the bet, THE SYSTEM SHALL answer the browser with the outcome and, in the same request, credit the whole win of the round with one `win` call carrying transaction ids `<roundId>:bet` and `<roundId>:win`; a round with no win ends with the bet call alone, sent with `roundClose` true. (R5, R11) FR8: IF the hub refuses the bet with `INSUFFICIENT_FUNDS`, THEN THE SYSTEM SHALL answer `insufficient_funds`, send no outcome, mark the round refused, delete its drawn result and never repeat that bet. (R6) FR9: IF the hub refuses the bet with another definite refusal (`LIMIT_EXCEEDED`, `REFUSED`, `CONFLICT`, `BAD_REQUEST`), THEN THE SYSTEM SHALL answer `bet_refused`, send no outcome, mark the round refused and never repeat that bet. (R11) FR10: WHEN a spin key arrives again with the same token, THE SYSTEM SHALL answer the first answer for that key, a round that still owes its win or is parked answering its outcome marked `creditPending`, and SHALL NOT draw, debit or credit again. (R9) FR11: THE SYSTEM SHALL turn the engine's total win and the bet into whole cents rounded to the nearest cent, in integer arithmetic, SHALL credit that whole total in the one `win` call free games and bonus steps included, and SHALL NOT cap it. (R12, R13) FR14: THE SYSTEM SHALL keep every round, with its bet, outcome, win, status and launch token, without expiry. (R17) FR29: IF the hub answers a bet with 401, 403 or 404 (nothing moved) and every earlier send of that bet was answered "nothing moved", THEN THE SYSTEM SHALL answer `unavailable`, mark the round refused and never repeat that bet. (R11) FR16 (guard): THE SYSTEM SHALL NOT offer demo play or guest play: every call under `/api/game/` without a launch token is refused, and no game window plays a round without the server. (R3)
    _(`plan.md` §Requirements, FR3, FR4, FR5, FR6, FR8, FR9, FR10, FR11, FR14, FR29, FR16, verbatim)_
    Cases: a bet refused `SESSION_NOT_FOUND` leaves one row `refused` with a null result and answers `session_expired`, and the same key later answers `session_expired` again with no second bet call; a bet answered 403 (and 401, and 404) as the first attempt leaves the row `refused`, answers `unavailable`, and is never repeated by a later request or by the sweeper; `bet_sends` is incremented in the write before the call leaves, so a process stopped mid-call leaves `bet_sends` above `bet_busy_answers`; a bet answered `BUSY` increments `bet_busy_answers` and one answered `INTERNAL`, timing out or ending in a closed connection does not; a repeated winning key answers `winCents` as a JSON number and the stored `win_cents` is an integer column; bets of 5, 150 and 1001 cents and an unknown game are refused `bad_request` with no row and no hub call; a round with no win sends one bet call with `roundClose` true and no win call; a round with a win sends the bet with `roundClose` false first, then the win with `roundClose` true, with transaction ids `<roundId>:bet` and `<roundId>:win` and the same round id; the browser never sees the outcome of a refused bet and the row's result is null; `LIMIT_EXCEEDED` gives `bet_refused` and the same key later returns the same refusal without a second bet call; the same key with another bet returns the first answer; the same key from another token is another round; two requests with one key at once make one round; an answer with `balanceCents` is passed on; the stored row holds game, token, bet, result, win, status.
  - **Commit:** `feat(server): play spins with a round journal, signed bet and win calls and idempotent keys`

- [ ] **T005** Finish unfinished rounds: the sweeper, growing pauses, the alert and `/healthz`
  - `_Depends: T004_` · `_Boundary: server_`
  - **Files:** `server/migrations/002_round_retry.sql`,
    `server/src/spin/sweeper.ts`,
    `server/src/spin/backoff.ts`,
    `server/src/spin/spin.ts`,
    `server/src/db/rounds.ts`,
    `server/src/http/health.ts`,
    `server/src/app.ts`,
    `server/src/main.ts`,
    `server/src/config.ts`,
    `server/dev/stub-hub.ts`,
    `server/tests/sweeper.test.ts`,
    `server/tests/backoff.test.ts`,
    `server/tests/health.test.ts`,
    `server/tests/spin-pending.test.ts`
  - **Closes:** FR12, FR13, FR14, FR15, FR30, FR31 · **Seam:** S1
  - **Contract:** contract.openapi.yaml §/webhook/{partner}/bet, §/webhook/{partner}/win
  - **Acceptance:** FR12: IF the hub gives no definite answer to a bet (`BUSY`, `INTERNAL`, no answer), THEN THE SYSTEM SHALL repeat the same call with the same transaction id until it is answered, within the spin request every 0.2 seconds growing to 1 second while the bet budget of 10 seconds (`HUB_CALL_TIMEOUT_MS`, longer than the hub's own 8 second wait for a busy wallet) lasts and afterwards by the sweeper, and SHALL answer the browser `busy` after that budget so that the browser can repeat the same spin key. (R11) FR13: IF the win is not credited at once (`BUSY`, `INTERNAL`, no answer, or any refusal except `CONFLICT` and `BAD_REQUEST`), THEN THE SYSTEM SHALL answer the outcome marked `creditPending` and keep the round `win_pending`, and SHALL repeat the win call with the same transaction id and the round's own launch token at pauses growing from 5 seconds to a ceiling of 1 hour until it is accepted, parking only a round the hub answers `CONFLICT` or `BAD_REQUEST` for an operator. (R10) FR14: THE SYSTEM SHALL keep every round, with its bet, outcome, win, status and launch token, without expiry. (R17) FR15: WHEN a bet call or a win call has failed more than 5 times for a round, THE SYSTEM SHALL log an error line `bet_pending_alert` or `win_pending_alert` for every further attempt, and `GET /healthz` SHALL report how many rounds wait for a bet or a win, how many are parked and the age of the oldest. (R10) FR30: WHEN the sweeper repeats a leg, THE SYSTEM SHALL claim the round with a lease in a short transaction before the call, make the call outside any transaction, and write the outcome only if the round still has the status it claimed, and a spin request SHALL move the round's due time to the call timeout plus a margin before each call it makes, and a repeated key that finds the round `bet_pending` SHALL take the same lease and, with the lease held, wait for the holder's outcome up to the bet budget, so that no two callers repeat one leg. (R11) FR31: IF an earlier send of a bet was not answered "nothing moved" (it ended with `INTERNAL`, a timeout or a transport error, or it never got an answer because the process stopped) and a later attempt gets 401, 403 or 404, THEN THE SYSTEM SHALL keep the round `bet_pending` and keep repeating that bet with the same transaction id until the hub gives a definite answer, logging `bet_pending_alert`, because the bet may already be debited. (R11)
    _(`plan.md` §Requirements, FR12, FR13, FR14, FR15, FR30, FR31, verbatim)_
    Cases: a bet answered `BUSY` after the stub's lock wait (`tok-busy-once`, 8 seconds) is repeated inside the same spin request within 1 second and the browser gets the outcome, not `busy`, and the `BUSY` did not make a later 403 keep the round open; an attempt is cut to the remaining 10 second budget, so a request never runs a bet call past the budget; the start fails when `SWEEP_LEASE_MS` is not larger than `HUB_CALL_TIMEOUT_MS`; a bet accepted at 7 seconds keeps the round not due until its win call has ended; a round left `bet_pending` with a send and no recorded answer (a stopped process) is not ended by a 403, and a round whose every send was answered `BUSY` is; a repeated key that finds the round `bet_pending` with the lease free makes the call itself, with the lease held waits for the holder up to the budget and answers the round or `busy`, and never makes a second concurrent call; a bet that timed out once (`tok-timeout-then-forbidden`) and is then answered 403 stays `bet_pending`, is repeated with the same transaction id, logs `bet_pending_alert` after the fifth failure and answers the browser `busy`, while a first-attempt 403 still ends the round `refused`; a round just saved by a spin request is not due for the sweeper before the lease has passed, and a sweeper that claimed a round writes its outcome only while the status is still the claimed one (a round settled meanwhile stays `settled`); two sweepers over one due round make one hub call, and the call runs outside any open transaction (the pool has its connection back while the hub call waits); a repeated key of a `win_pending` or a `parked` round answers the outcome with `creditPending` true; the sixth failed bet attempt logs `bet_pending_alert` and the fifth does not; the counts of `/healthz` are JSON numbers; a win answered `BUSY` once gives the browser the outcome with `creditPending` true, and the sweeper repeats the win with the same transaction id and the round's own token; pauses after attempts 1, 2, 3 are 5, 10, 20 seconds and never exceed 3600; `INSUFFICIENT_FUNDS` and `SESSION_NOT_FOUND` on a win keep retrying, `CONFLICT` and `BAD_REQUEST` park the round and it is not repeated; the sixth failed win attempt logs `win_pending_alert` and the fifth does not; a bet answered `INTERNAL` gives the browser `busy` after the 10 second budget, and the sweeper then completes the bet and sends the win once; two sweepers at once make one hub call for one due round; `/healthz` counts waiting, parked and the age of the oldest.
  - **Commit:** `feat(server): finish unfinished bets and wins with a sweeper, an alert and a health endpoint`

- [ ] **T006** Upload the twelve tile images to the hub
  - `_Depends: T002_` · `_Boundary: server_`
  - **Files:** `server/src/tiles/uploadTiles.ts`,
    `server/scripts/upload-tiles.ts`,
    `server/proto/catalog.proto`,
    `server/tests/uploadTiles.test.ts`,
    `server/tests/helpers/fakeCatalogServer.ts`,
    `server/tests/fixtures/tile.webp`,
    `server/package.json`,
    `server/package-lock.json`
  - **Closes:** FR17 · **Seam:** S4
  - **Acceptance:** FR17: WHEN the upload script runs, THE SYSTEM SHALL send the tile image of each of the twelve games to the hub's `GameService.UpdateImage` under the game's hub identity (`x-catalog.games[].identity` of the contract, not its symbol), image key `1x1` and the shared catalogue key. (R1)
    _(`plan.md` §Requirements, FR17, verbatim)_
    Cases: twelve calls, one per game of the registry, each with `identity` equal to the game's hub identity (`apexslots_tropic_escape`, not `tropic-escape`), key `IMAGE_KEY_1X1`, the bytes of `tiles/<symbol>.webp` and the metadata `x-catalog-admin-key`; a wrong key answered `UNAUTHENTICATED` stops the script with a non-zero exit naming the symbol; a missing tile file stops before any upload.
  - **Commit:** `feat(server): add the script that uploads the twelve tile images to the hub`

- [ ] **T007** Add the shared browser module and move Stellar Sevens to the game server
  - `_Depends: T005_` · `_Boundary: client-kit, stellar-sevens_`
  - **Files:** `client-kit/package.json`,
    `client-kit/package-lock.json`,
    `client-kit/tsconfig.json`,
    `client-kit/vitest.config.ts`,
    `client-kit/src/index.ts`,
    `client-kit/src/wallet.ts`,
    `client-kit/src/spinKey.ts`,
    `client-kit/src/messages.ts`,
    `client-kit/src/deposit.ts`,
    `client-kit/tests/wallet.test.ts`,
    `client-kit/tests/spinKey.test.ts`,
    `client-kit/tests/deposit.test.ts`,
    `client-kit/tests/games.test.ts`,
    `client-kit/tests/migratedGames.ts`,
    `stellar-sevens/src/game/wallet.ts`,
    `stellar-sevens/src/game/main.ts`,
    `stellar-sevens/src/game/hud.ts`,
    `stellar-sevens/src/game/gameinfo.ts`,
    `stellar-sevens/src/game/style.css`,
    `stellar-sevens/index.html`
  - **Closes:** FR18, FR20, FR21, FR22, FR23, FR24, FR25, FR26, FR27, FR28 · **Guards:** FR16, FR19 · **Seam:** S3
  - **Contract:** contract.openapi.yaml §x-game-window-messages, api-endpoints-diff.md §GET /api/game/session, §POST /api/game/spin
  - **Behavior:** S1, S2, S3, S4, S5, S6, S7, S8, S9, S10, S11, S12, S13, L1, L2, L3, L4, L5, L6, L7, F1, F2, F3, F4, F5, F6, F7, F8, F9, F10, F11, F12, F13, F14, F15, F16, E1, E2, E3, E4, E5, E6, E7, E8, E9, E10, E11
  - **Verify:** run `npm --prefix server run build:games -- stellar-sevens` and `npm --prefix server run dev:stub` → open `http://localhost:9100/host/stellar-sevens?token=tok-rich` → the meter shows 100.00 and no DEMO label → press SPIN → the balance falls by the bet, the reels stop, a win adds to the balance when the animation ends
  - **Verify:** open `http://localhost:9100/host/stellar-sevens?token=tok-rich` → raise the bet with + until it stops → the top bet shows 10.00
  - **Verify:** open `http://localhost:9100/host/stellar-sevens?token=tok-poor` → press SPIN → NOT ENOUGH FUNDS and a DEPOSIT button show and the reels do not move → press DEPOSIT → the host page logs `apex:deposit`
  - **Verify:** open `http://localhost:9100/host/stellar-sevens?token=tok-rich` → press the info button → the last line reads Art by APEXSLOTS (apexslots.eu), CC BY 4.0
  - **Acceptance:** FR18: WHEN a game window opens with `?token=` in its address, THE SYSTEM SHALL keep the token, send it as `Authorization: Bearer` on every call to the server, and show the balance the session answer returns. (R4) FR20: WHEN the player spins, THE SYSTEM SHALL show no outcome before the server has accepted the bet, show the balance after the bet while the animation runs, and add the win to the shown balance when the animation ends. (R5) FR21: THE SYSTEM SHALL show the total win of a round as the credited amount in cents, whatever the animation does. (R13) FR22: THE SYSTEM SHALL offer in each game only the bets of that game's own ladder from 0.10 to 10.00. (R8) FR23: IF the balance shown is below the bet and the balance the server returns when asked is below the bet too, THEN THE SYSTEM SHALL refuse the spin without moving the reels, show "NOT ENOUGH FUNDS" and a DEPOSIT button, and WHEN the player presses the button THE SYSTEM SHALL post `{type: 'apex:deposit'}` to the parent window. (R6) FR24: WHEN the server answers `session_expired`, THE SYSTEM SHALL show "SESSION EXPIRED. REOPEN THE GAME." and SHALL NOT send a spin. (R19) FR25: WHEN a spin answer is marked `creditPending`, THE SYSTEM SHALL show the outcome with the win marked "BEING CREDITED". (R10) FR26: WHEN a spin is sent, THE SYSTEM SHALL keep its key and bet in the tab's session storage until a definite answer arrives, and WHEN the window is reloaded or SPIN is pressed after a lost connection THE SYSTEM SHALL send that same key with that same bet, show that bet and lock the bet controls until a definite answer arrives, and show the round it returns. (R9) FR27: THE SYSTEM SHALL show on the information screen of every game the credit "Art by APEXSLOTS (apexslots.eu), CC BY 4.0". (R14) FR28: WHEN the server answers `busy`, `bet_refused` or `unavailable`, THE SYSTEM SHALL show the matching message, reveal no outcome and leave SPIN usable, a `busy` answer keeping the stored spin key and a `bet_refused` or `unavailable` answer clearing it. (R5) FR16 (guard): THE SYSTEM SHALL NOT offer demo play or guest play: every call under `/api/game/` without a launch token is refused, and no game window plays a round without the server. (R3) FR19 (guard): THE SYSTEM SHALL NOT let the browser decide an outcome, a bet or a win: no game window contains local play, and every round it shows is the one the server answered. (R7)
    _(`plan.md` §Requirements, FR18, FR20, FR21, FR22, FR23, FR24, FR25, FR26, FR27, FR28, FR16, FR19, verbatim)_
    Cases: the token from `?token=` is sent as `Authorization: Bearer` on the session and the spin and is not read from a cookie; the spin key and bet stay in `sessionStorage` after three failed attempts and are sent again, with the stored bet even if the bet was changed meanwhile; the stored key is cleared by `ok`, `insufficient_funds`, `bet_refused`, `unavailable` and `session_expired` and kept by a lost connection and by `busy`; the message `apex:deposit` goes to target origin `*` whatever `lobby` holds (empty, a path, a `www.` host), only on the button press and never on low balance alone, and the posted object validates against `components.schemas.DepositMessage` of the contract; `session_expired` disables SPIN; a `creditPending` answer shows BEING CREDITED; the shown win total is `winCents / 100` and not `totalWin * bet`; the response fields `held` and `pending` are not read; with a shown balance below the bet the window calls the session first, lets the spin through when the fresh balance covers the bet and shows NOT ENOUGH FUNDS only when it does not; while a key is stored the HUD bet equals the stored bet and the bet controls do nothing, and a `bet_refused`, `unavailable` or `session_expired` answer unlocks them; the ladder of the game offers 10.00 and does not offer 15; the bet 0.60 is sent as 60 cents; `main.ts` has no import of `playRound`, `mulberry32` or `randomSeed` and no path that plays without the server; the title has no `Demo`; `gameinfo.ts` holds the credit line exactly once; the game is listed in `client-kit/tests/migratedGames.ts`.
  - **Commit:** `feat(stellar-sevens): run the game window against the game server`

- [ ] **T008** Move Nitro Hot and Scorching Hot to the game server
  - `_Depends: T007_` · `_Boundary: client-kit/tests, nitro-hot, scorching-hot_`
  - **Files:** `client-kit/tests/migratedGames.ts`,
    `nitro-hot/src/game/wallet.ts`,
    `nitro-hot/src/game/main.ts`,
    `nitro-hot/src/game/hud.ts`,
    `nitro-hot/src/game/gameinfo.ts`,
    `nitro-hot/src/game/style.css`,
    `nitro-hot/index.html`,
    `scorching-hot/src/game/wallet.ts`,
    `scorching-hot/src/game/main.ts`,
    `scorching-hot/src/game/hud.ts`,
    `scorching-hot/src/game/gameinfo.ts`,
    `scorching-hot/src/game/style.css`,
    `scorching-hot/index.html`
  - **Closes:** FR18, FR20, FR21, FR22, FR23, FR24, FR25, FR26, FR27, FR28 · **Guards:** FR16, FR19 · **Seam:** S3
  - **Contract:** api-endpoints-diff.md §GET /api/game/session, §POST /api/game/spin
  - **Behavior:** S2, S3, S4, S5, S6, S12, L6, F3
  - **Verify:** run `npm --prefix server run build:games -- nitro-hot` and `npm --prefix server run dev:stub` → open `http://localhost:9100/host/nitro-hot?token=tok-rich` → the meter shows 100.00 and no DEMO label → press SPIN → the balance falls by the bet, the reels stop, a win adds to the balance when the animation ends
  - **Verify:** open `http://localhost:9100/host/nitro-hot?token=tok-rich` → raise the bet with + until it stops → the top bet shows 10.00
  - **Verify:** open `http://localhost:9100/host/nitro-hot?token=tok-poor` → press SPIN → NOT ENOUGH FUNDS and a DEPOSIT button show and the reels do not move → press DEPOSIT → the host page logs `apex:deposit`
  - **Verify:** open `http://localhost:9100/host/nitro-hot?token=tok-rich` → press the info button → the last line reads Art by APEXSLOTS (apexslots.eu), CC BY 4.0
  - **Verify:** run `npm --prefix server run build:games -- scorching-hot` and `npm --prefix server run dev:stub` → open `http://localhost:9100/host/scorching-hot?token=tok-rich` → the meter shows 100.00 and no DEMO label → press SPIN → the balance falls by the bet, the reels stop, a win adds to the balance when the animation ends
  - **Verify:** open `http://localhost:9100/host/scorching-hot?token=tok-rich` → raise the bet with + until it stops → the top bet shows 10.00
  - **Verify:** open `http://localhost:9100/host/scorching-hot?token=tok-poor` → press SPIN → NOT ENOUGH FUNDS and a DEPOSIT button show and the reels do not move → press DEPOSIT → the host page logs `apex:deposit`
  - **Verify:** open `http://localhost:9100/host/scorching-hot?token=tok-rich` → press the info button → the last line reads Art by APEXSLOTS (apexslots.eu), CC BY 4.0
  - **Acceptance:** FR18: WHEN a game window opens with `?token=` in its address, THE SYSTEM SHALL keep the token, send it as `Authorization: Bearer` on every call to the server, and show the balance the session answer returns. (R4) FR20: WHEN the player spins, THE SYSTEM SHALL show no outcome before the server has accepted the bet, show the balance after the bet while the animation runs, and add the win to the shown balance when the animation ends. (R5) FR21: THE SYSTEM SHALL show the total win of a round as the credited amount in cents, whatever the animation does. (R13) FR22: THE SYSTEM SHALL offer in each game only the bets of that game's own ladder from 0.10 to 10.00. (R8) FR23: IF the balance shown is below the bet and the balance the server returns when asked is below the bet too, THEN THE SYSTEM SHALL refuse the spin without moving the reels, show "NOT ENOUGH FUNDS" and a DEPOSIT button, and WHEN the player presses the button THE SYSTEM SHALL post `{type: 'apex:deposit'}` to the parent window. (R6) FR24: WHEN the server answers `session_expired`, THE SYSTEM SHALL show "SESSION EXPIRED. REOPEN THE GAME." and SHALL NOT send a spin. (R19) FR25: WHEN a spin answer is marked `creditPending`, THE SYSTEM SHALL show the outcome with the win marked "BEING CREDITED". (R10) FR26: WHEN a spin is sent, THE SYSTEM SHALL keep its key and bet in the tab's session storage until a definite answer arrives, and WHEN the window is reloaded or SPIN is pressed after a lost connection THE SYSTEM SHALL send that same key with that same bet, show that bet and lock the bet controls until a definite answer arrives, and show the round it returns. (R9) FR27: THE SYSTEM SHALL show on the information screen of every game the credit "Art by APEXSLOTS (apexslots.eu), CC BY 4.0". (R14) FR28: WHEN the server answers `busy`, `bet_refused` or `unavailable`, THE SYSTEM SHALL show the matching message, reveal no outcome and leave SPIN usable, a `busy` answer keeping the stored spin key and a `bet_refused` or `unavailable` answer clearing it. (R5) FR16 (guard): THE SYSTEM SHALL NOT offer demo play or guest play: every call under `/api/game/` without a launch token is refused, and no game window plays a round without the server. (R3) FR19 (guard): THE SYSTEM SHALL NOT let the browser decide an outcome, a bet or a win: no game window contains local play, and every round it shows is the one the server answered. (R7)
    _(`plan.md` §Requirements, FR18, FR20, FR21, FR22, FR23, FR24, FR25, FR26, FR27, FR28, FR16, FR19, verbatim)_
    Cases: the ladder of the game offers 10.00 and does not offer 15; the bet 0.60 is sent as 60 cents; `main.ts` has no import of `playRound`, `mulberry32` or `randomSeed` and no path that plays without the server; the title has no `Demo`; `gameinfo.ts` holds the credit line exactly once; the game is listed in `client-kit/tests/migratedGames.ts`.
  - **Commit:** `feat(games): run 2 game windows against the game server`

- [ ] **T009** Move Discovery Voyage, Fairytale and House of Ra to the game server
  - `_Depends: T008_` · `_Boundary: client-kit/tests, discovery-voyage, fairytale, house-of-ra_`
  - **Files:** `client-kit/tests/migratedGames.ts`,
    `discovery-voyage/src/game/wallet.ts`,
    `discovery-voyage/src/game/main.ts`,
    `discovery-voyage/src/game/hud.ts`,
    `discovery-voyage/src/game/gameinfo.ts`,
    `discovery-voyage/src/game/style.css`,
    `discovery-voyage/index.html`,
    `fairytale/src/game/wallet.ts`,
    `fairytale/src/game/main.ts`,
    `fairytale/src/game/hud.ts`,
    `fairytale/src/game/gameinfo.ts`,
    `fairytale/src/game/style.css`,
    `fairytale/index.html`,
    `house-of-ra/src/game/wallet.ts`,
    `house-of-ra/src/game/main.ts`,
    `house-of-ra/src/game/hud.ts`,
    `house-of-ra/src/game/gameinfo.ts`,
    `house-of-ra/src/game/style.css`,
    `house-of-ra/index.html`
  - **Closes:** FR18, FR20, FR21, FR22, FR23, FR24, FR25, FR26, FR27, FR28 · **Guards:** FR16, FR19 · **Seam:** S3
  - **Contract:** api-endpoints-diff.md §GET /api/game/session, §POST /api/game/spin
  - **Behavior:** S2, S3, S4, S5, S6, S12, L6, F3
  - **Verify:** run `npm --prefix server run build:games -- discovery-voyage` and `npm --prefix server run dev:stub` → open `http://localhost:9100/host/discovery-voyage?token=tok-rich` → the meter shows 100.00 and no DEMO label → press SPIN → the balance falls by the bet, the reels stop, a win adds to the balance when the animation ends
  - **Verify:** open `http://localhost:9100/host/discovery-voyage?token=tok-rich` → raise the bet with + until it stops → the top bet shows 10.00
  - **Verify:** open `http://localhost:9100/host/discovery-voyage?token=tok-poor` → press SPIN → NOT ENOUGH FUNDS and a DEPOSIT button show and the reels do not move → press DEPOSIT → the host page logs `apex:deposit`
  - **Verify:** open `http://localhost:9100/host/discovery-voyage?token=tok-rich` → press the info button → the last line reads Art by APEXSLOTS (apexslots.eu), CC BY 4.0
  - **Verify:** run `npm --prefix server run build:games -- fairytale` and `npm --prefix server run dev:stub` → open `http://localhost:9100/host/fairytale?token=tok-rich` → the meter shows 100.00 and no DEMO label → press SPIN → the balance falls by the bet, the reels stop, a win adds to the balance when the animation ends
  - **Verify:** open `http://localhost:9100/host/fairytale?token=tok-rich` → raise the bet with + until it stops → the top bet shows 10.00
  - **Verify:** open `http://localhost:9100/host/fairytale?token=tok-poor` → press SPIN → NOT ENOUGH FUNDS and a DEPOSIT button show and the reels do not move → press DEPOSIT → the host page logs `apex:deposit`
  - **Verify:** open `http://localhost:9100/host/fairytale?token=tok-rich` → press the info button → the last line reads Art by APEXSLOTS (apexslots.eu), CC BY 4.0
  - **Verify:** run `npm --prefix server run build:games -- house-of-ra` and `npm --prefix server run dev:stub` → open `http://localhost:9100/host/house-of-ra?token=tok-rich` → the meter shows 100.00 and no DEMO label → press SPIN → the balance falls by the bet, the reels stop, a win adds to the balance when the animation ends
  - **Verify:** open `http://localhost:9100/host/house-of-ra?token=tok-rich` → raise the bet with + until it stops → the top bet shows 10.00
  - **Verify:** open `http://localhost:9100/host/house-of-ra?token=tok-poor` → press SPIN → NOT ENOUGH FUNDS and a DEPOSIT button show and the reels do not move → press DEPOSIT → the host page logs `apex:deposit`
  - **Verify:** open `http://localhost:9100/host/house-of-ra?token=tok-rich` → press the info button → the last line reads Art by APEXSLOTS (apexslots.eu), CC BY 4.0
  - **Acceptance:** FR18: WHEN a game window opens with `?token=` in its address, THE SYSTEM SHALL keep the token, send it as `Authorization: Bearer` on every call to the server, and show the balance the session answer returns. (R4) FR20: WHEN the player spins, THE SYSTEM SHALL show no outcome before the server has accepted the bet, show the balance after the bet while the animation runs, and add the win to the shown balance when the animation ends. (R5) FR21: THE SYSTEM SHALL show the total win of a round as the credited amount in cents, whatever the animation does. (R13) FR22: THE SYSTEM SHALL offer in each game only the bets of that game's own ladder from 0.10 to 10.00. (R8) FR23: IF the balance shown is below the bet and the balance the server returns when asked is below the bet too, THEN THE SYSTEM SHALL refuse the spin without moving the reels, show "NOT ENOUGH FUNDS" and a DEPOSIT button, and WHEN the player presses the button THE SYSTEM SHALL post `{type: 'apex:deposit'}` to the parent window. (R6) FR24: WHEN the server answers `session_expired`, THE SYSTEM SHALL show "SESSION EXPIRED. REOPEN THE GAME." and SHALL NOT send a spin. (R19) FR25: WHEN a spin answer is marked `creditPending`, THE SYSTEM SHALL show the outcome with the win marked "BEING CREDITED". (R10) FR26: WHEN a spin is sent, THE SYSTEM SHALL keep its key and bet in the tab's session storage until a definite answer arrives, and WHEN the window is reloaded or SPIN is pressed after a lost connection THE SYSTEM SHALL send that same key with that same bet, show that bet and lock the bet controls until a definite answer arrives, and show the round it returns. (R9) FR27: THE SYSTEM SHALL show on the information screen of every game the credit "Art by APEXSLOTS (apexslots.eu), CC BY 4.0". (R14) FR28: WHEN the server answers `busy`, `bet_refused` or `unavailable`, THE SYSTEM SHALL show the matching message, reveal no outcome and leave SPIN usable, a `busy` answer keeping the stored spin key and a `bet_refused` or `unavailable` answer clearing it. (R5) FR16 (guard): THE SYSTEM SHALL NOT offer demo play or guest play: every call under `/api/game/` without a launch token is refused, and no game window plays a round without the server. (R3) FR19 (guard): THE SYSTEM SHALL NOT let the browser decide an outcome, a bet or a win: no game window contains local play, and every round it shows is the one the server answered. (R7)
    _(`plan.md` §Requirements, FR18, FR20, FR21, FR22, FR23, FR24, FR25, FR26, FR27, FR28, FR16, FR19, verbatim)_
    Cases: the ladder of the game offers 10.00 and does not offer 15; the bet 0.60 is sent as 60 cents; `main.ts` has no import of `playRound`, `mulberry32` or `randomSeed` and no path that plays without the server; the title has no `Demo`; `gameinfo.ts` holds the credit line exactly once; the game is listed in `client-kit/tests/migratedGames.ts`.
  - **Commit:** `feat(games): run 3 game windows against the game server`

- [ ] **T010** Move Pearl Reef, Samurai and Tropic Escape to the game server
  - `_Depends: T009_` · `_Boundary: client-kit/tests, pearl-reef, samurai, tropic-escape_`
  - **Files:** `client-kit/tests/migratedGames.ts`,
    `pearl-reef/src/game/wallet.ts`,
    `pearl-reef/src/game/main.ts`,
    `pearl-reef/src/game/hud.ts`,
    `pearl-reef/src/game/gameinfo.ts`,
    `pearl-reef/src/game/style.css`,
    `pearl-reef/index.html`,
    `samurai/src/game/wallet.ts`,
    `samurai/src/game/main.ts`,
    `samurai/src/game/hud.ts`,
    `samurai/src/game/gameinfo.ts`,
    `samurai/src/game/style.css`,
    `samurai/index.html`,
    `tropic-escape/src/game/wallet.ts`,
    `tropic-escape/src/game/main.ts`,
    `tropic-escape/src/game/hud.ts`,
    `tropic-escape/src/game/gameinfo.ts`,
    `tropic-escape/src/game/style.css`,
    `tropic-escape/index.html`
  - **Closes:** FR18, FR20, FR21, FR22, FR23, FR24, FR25, FR26, FR27, FR28 · **Guards:** FR16, FR19 · **Seam:** S3
  - **Contract:** api-endpoints-diff.md §GET /api/game/session, §POST /api/game/spin
  - **Behavior:** S2, S3, S4, S5, S6, S12, L6, F3
  - **Verify:** run `npm --prefix server run build:games -- pearl-reef` and `npm --prefix server run dev:stub` → open `http://localhost:9100/host/pearl-reef?token=tok-rich` → the meter shows 100.00 and no DEMO label → press SPIN → the balance falls by the bet, the reels stop, a win adds to the balance when the animation ends
  - **Verify:** open `http://localhost:9100/host/pearl-reef?token=tok-rich` → raise the bet with + until it stops → the top bet shows 10.00
  - **Verify:** open `http://localhost:9100/host/pearl-reef?token=tok-poor` → press SPIN → NOT ENOUGH FUNDS and a DEPOSIT button show and the reels do not move → press DEPOSIT → the host page logs `apex:deposit`
  - **Verify:** open `http://localhost:9100/host/pearl-reef?token=tok-rich` → press the info button → the last line reads Art by APEXSLOTS (apexslots.eu), CC BY 4.0
  - **Verify:** run `npm --prefix server run build:games -- samurai` and `npm --prefix server run dev:stub` → open `http://localhost:9100/host/samurai?token=tok-rich` → the meter shows 100.00 and no DEMO label → press SPIN → the balance falls by the bet, the reels stop, a win adds to the balance when the animation ends
  - **Verify:** open `http://localhost:9100/host/samurai?token=tok-rich` → raise the bet with + until it stops → the top bet shows 10.00
  - **Verify:** open `http://localhost:9100/host/samurai?token=tok-poor` → press SPIN → NOT ENOUGH FUNDS and a DEPOSIT button show and the reels do not move → press DEPOSIT → the host page logs `apex:deposit`
  - **Verify:** open `http://localhost:9100/host/samurai?token=tok-rich` → press the info button → the last line reads Art by APEXSLOTS (apexslots.eu), CC BY 4.0
  - **Verify:** run `npm --prefix server run build:games -- tropic-escape` and `npm --prefix server run dev:stub` → open `http://localhost:9100/host/tropic-escape?token=tok-rich` → the meter shows 100.00 and no DEMO label → press SPIN → the balance falls by the bet, the reels stop, a win adds to the balance when the animation ends
  - **Verify:** open `http://localhost:9100/host/tropic-escape?token=tok-rich` → raise the bet with + until it stops → the top bet shows 10.00
  - **Verify:** open `http://localhost:9100/host/tropic-escape?token=tok-poor` → press SPIN → NOT ENOUGH FUNDS and a DEPOSIT button show and the reels do not move → press DEPOSIT → the host page logs `apex:deposit`
  - **Verify:** open `http://localhost:9100/host/tropic-escape?token=tok-rich` → press the info button → the last line reads Art by APEXSLOTS (apexslots.eu), CC BY 4.0
  - **Acceptance:** FR18: WHEN a game window opens with `?token=` in its address, THE SYSTEM SHALL keep the token, send it as `Authorization: Bearer` on every call to the server, and show the balance the session answer returns. (R4) FR20: WHEN the player spins, THE SYSTEM SHALL show no outcome before the server has accepted the bet, show the balance after the bet while the animation runs, and add the win to the shown balance when the animation ends. (R5) FR21: THE SYSTEM SHALL show the total win of a round as the credited amount in cents, whatever the animation does. (R13) FR22: THE SYSTEM SHALL offer in each game only the bets of that game's own ladder from 0.10 to 10.00. (R8) FR23: IF the balance shown is below the bet and the balance the server returns when asked is below the bet too, THEN THE SYSTEM SHALL refuse the spin without moving the reels, show "NOT ENOUGH FUNDS" and a DEPOSIT button, and WHEN the player presses the button THE SYSTEM SHALL post `{type: 'apex:deposit'}` to the parent window. (R6) FR24: WHEN the server answers `session_expired`, THE SYSTEM SHALL show "SESSION EXPIRED. REOPEN THE GAME." and SHALL NOT send a spin. (R19) FR25: WHEN a spin answer is marked `creditPending`, THE SYSTEM SHALL show the outcome with the win marked "BEING CREDITED". (R10) FR26: WHEN a spin is sent, THE SYSTEM SHALL keep its key and bet in the tab's session storage until a definite answer arrives, and WHEN the window is reloaded or SPIN is pressed after a lost connection THE SYSTEM SHALL send that same key with that same bet, show that bet and lock the bet controls until a definite answer arrives, and show the round it returns. (R9) FR27: THE SYSTEM SHALL show on the information screen of every game the credit "Art by APEXSLOTS (apexslots.eu), CC BY 4.0". (R14) FR28: WHEN the server answers `busy`, `bet_refused` or `unavailable`, THE SYSTEM SHALL show the matching message, reveal no outcome and leave SPIN usable, a `busy` answer keeping the stored spin key and a `bet_refused` or `unavailable` answer clearing it. (R5) FR16 (guard): THE SYSTEM SHALL NOT offer demo play or guest play: every call under `/api/game/` without a launch token is refused, and no game window plays a round without the server. (R3) FR19 (guard): THE SYSTEM SHALL NOT let the browser decide an outcome, a bet or a win: no game window contains local play, and every round it shows is the one the server answered. (R7)
    _(`plan.md` §Requirements, FR18, FR20, FR21, FR22, FR23, FR24, FR25, FR26, FR27, FR28, FR16, FR19, verbatim)_
    Cases: the ladder of the game offers 10.00 and does not offer 15; the bet 0.60 is sent as 60 cents; `main.ts` has no import of `playRound`, `mulberry32` or `randomSeed` and no path that plays without the server; the title has no `Demo`; `gameinfo.ts` holds the credit line exactly once; the game is listed in `client-kit/tests/migratedGames.ts`.
  - **Commit:** `feat(games): run 3 game windows against the game server`

- [ ] **T011** Move The Dynasty, Golden Papyrus and Bumper Crop to the game server
  - `_Depends: T010_` · `_Boundary: client-kit/tests, the-dynasty, golden-papyrus, bumper-crop_`
  - **Files:** `client-kit/tests/migratedGames.ts`,
    `the-dynasty/src/game/wallet.ts`,
    `the-dynasty/src/game/main.ts`,
    `the-dynasty/src/game/hud.ts`,
    `the-dynasty/src/game/gameinfo.ts`,
    `the-dynasty/src/game/style.css`,
    `the-dynasty/index.html`,
    `golden-papyrus/src/game/wallet.ts`,
    `golden-papyrus/src/game/main.ts`,
    `golden-papyrus/src/game/hud.ts`,
    `golden-papyrus/src/game/gameinfo.ts`,
    `golden-papyrus/src/game/style.css`,
    `golden-papyrus/index.html`,
    `bumper-crop/src/game/wallet.ts`,
    `bumper-crop/src/game/main.ts`,
    `bumper-crop/src/game/hud.ts`,
    `bumper-crop/src/game/gameinfo.ts`,
    `bumper-crop/src/game/style.css`,
    `bumper-crop/index.html`
  - **Closes:** FR18, FR20, FR21, FR22, FR23, FR24, FR25, FR26, FR27, FR28 · **Guards:** FR16, FR19 · **Seam:** S3
  - **Contract:** api-endpoints-diff.md §GET /api/game/session, §POST /api/game/spin
  - **Behavior:** S2, S3, S4, S5, S6, S12, L6, F3
  - **Verify:** run `npm --prefix server run build:games -- the-dynasty` and `npm --prefix server run dev:stub` → open `http://localhost:9100/host/the-dynasty?token=tok-rich` → the meter shows 100.00 and no DEMO label → press SPIN → the balance falls by the bet, the reels stop, a win adds to the balance when the animation ends
  - **Verify:** open `http://localhost:9100/host/the-dynasty?token=tok-rich` → raise the bet with + until it stops → the top bet shows 10.00
  - **Verify:** open `http://localhost:9100/host/the-dynasty?token=tok-poor` → press SPIN → NOT ENOUGH FUNDS and a DEPOSIT button show and the reels do not move → press DEPOSIT → the host page logs `apex:deposit`
  - **Verify:** open `http://localhost:9100/host/the-dynasty?token=tok-rich` → press the info button → the last line reads Art by APEXSLOTS (apexslots.eu), CC BY 4.0
  - **Verify:** run `npm --prefix server run build:games -- golden-papyrus` and `npm --prefix server run dev:stub` → open `http://localhost:9100/host/golden-papyrus?token=tok-rich` → the meter shows 100.00 and no DEMO label → press SPIN → the balance falls by the bet, the reels stop, a win adds to the balance when the animation ends
  - **Verify:** open `http://localhost:9100/host/golden-papyrus?token=tok-rich` → raise the bet with + until it stops → the top bet shows 10.00
  - **Verify:** open `http://localhost:9100/host/golden-papyrus?token=tok-poor` → press SPIN → NOT ENOUGH FUNDS and a DEPOSIT button show and the reels do not move → press DEPOSIT → the host page logs `apex:deposit`
  - **Verify:** open `http://localhost:9100/host/golden-papyrus?token=tok-rich` → press the info button → the last line reads Art by APEXSLOTS (apexslots.eu), CC BY 4.0
  - **Verify:** run `npm --prefix server run build:games -- bumper-crop` and `npm --prefix server run dev:stub` → open `http://localhost:9100/host/bumper-crop?token=tok-rich` → the meter shows 100.00 and no DEMO label → press SPIN → the balance falls by the bet, the reels stop, a win adds to the balance when the animation ends
  - **Verify:** open `http://localhost:9100/host/bumper-crop?token=tok-rich` → raise the bet with + until it stops → the top bet shows 10.00
  - **Verify:** open `http://localhost:9100/host/bumper-crop?token=tok-poor` → press SPIN → NOT ENOUGH FUNDS and a DEPOSIT button show and the reels do not move → press DEPOSIT → the host page logs `apex:deposit`
  - **Verify:** open `http://localhost:9100/host/bumper-crop?token=tok-rich` → press the info button → the last line reads Art by APEXSLOTS (apexslots.eu), CC BY 4.0
  - **Acceptance:** FR18: WHEN a game window opens with `?token=` in its address, THE SYSTEM SHALL keep the token, send it as `Authorization: Bearer` on every call to the server, and show the balance the session answer returns. (R4) FR20: WHEN the player spins, THE SYSTEM SHALL show no outcome before the server has accepted the bet, show the balance after the bet while the animation runs, and add the win to the shown balance when the animation ends. (R5) FR21: THE SYSTEM SHALL show the total win of a round as the credited amount in cents, whatever the animation does. (R13) FR22: THE SYSTEM SHALL offer in each game only the bets of that game's own ladder from 0.10 to 10.00. (R8) FR23: IF the balance shown is below the bet and the balance the server returns when asked is below the bet too, THEN THE SYSTEM SHALL refuse the spin without moving the reels, show "NOT ENOUGH FUNDS" and a DEPOSIT button, and WHEN the player presses the button THE SYSTEM SHALL post `{type: 'apex:deposit'}` to the parent window. (R6) FR24: WHEN the server answers `session_expired`, THE SYSTEM SHALL show "SESSION EXPIRED. REOPEN THE GAME." and SHALL NOT send a spin. (R19) FR25: WHEN a spin answer is marked `creditPending`, THE SYSTEM SHALL show the outcome with the win marked "BEING CREDITED". (R10) FR26: WHEN a spin is sent, THE SYSTEM SHALL keep its key and bet in the tab's session storage until a definite answer arrives, and WHEN the window is reloaded or SPIN is pressed after a lost connection THE SYSTEM SHALL send that same key with that same bet, show that bet and lock the bet controls until a definite answer arrives, and show the round it returns. (R9) FR27: THE SYSTEM SHALL show on the information screen of every game the credit "Art by APEXSLOTS (apexslots.eu), CC BY 4.0". (R14) FR28: WHEN the server answers `busy`, `bet_refused` or `unavailable`, THE SYSTEM SHALL show the matching message, reveal no outcome and leave SPIN usable, a `busy` answer keeping the stored spin key and a `bet_refused` or `unavailable` answer clearing it. (R5) FR16 (guard): THE SYSTEM SHALL NOT offer demo play or guest play: every call under `/api/game/` without a launch token is refused, and no game window plays a round without the server. (R3) FR19 (guard): THE SYSTEM SHALL NOT let the browser decide an outcome, a bet or a win: no game window contains local play, and every round it shows is the one the server answered. (R7)
    _(`plan.md` §Requirements, FR18, FR20, FR21, FR22, FR23, FR24, FR25, FR26, FR27, FR28, FR16, FR19, verbatim)_
    Cases: the ladder of the game offers 10.00 and does not offer 15; the bet 0.60 is sent as 60 cents; `main.ts` has no import of `playRound`, `mulberry32` or `randomSeed` and no path that plays without the server; the title has no `Demo`; `gameinfo.ts` holds the credit line exactly once; the game is listed in `client-kit/tests/migratedGames.ts`.
  - **Commit:** `feat(games): run 3 game windows against the game server`

- [ ] **T012** Build and serve all twelve bundles, check them end to end, write the README
  - `_Depends: T011, T006_` · `_Boundary: server, README.md, CLAUDE.md_`
  - **Files:** `README.md`,
    `CLAUDE.md`,
    `server/.env.example`,
    `server/package.json`,
    `server/scripts/build-games.mjs`,
    `server/tests/games-built.test.ts`,
    `server/tests/helpers/builtGames.ts`,
    `server/tests/e2e.test.ts`
  - **Closes:** FR1 · **Guards:** FR16, FR19 · **Seam:** S1, S3
  - **Contract:** api-endpoints-diff.md §GET /play/{symbol}
  - **Verify:** run `npm --prefix server run build:games` then `npm --prefix server run dev:stub` → open `http://localhost:9100/host/tropic-escape?token=tok-rich` → the game loads from `/play/tropic-escape/` and a spin completes
  - **Acceptance:** FR1: WHEN a browser requests `/play/<symbol>` for one of the twelve symbols, THE SYSTEM SHALL serve that game's page, and for any other symbol or path THE SYSTEM SHALL answer 404. (R4) FR16 (guard): THE SYSTEM SHALL NOT offer demo play or guest play: every call under `/api/game/` without a launch token is refused, and no game window plays a round without the server. (R3) FR19 (guard): THE SYSTEM SHALL NOT let the browser decide an outcome, a bet or a win: no game window contains local play, and every round it shows is the one the server answered. (R7)
    _(`plan.md` §Requirements, FR1, FR16, FR19, verbatim)_
    Cases: each of the twelve built bundles answers at `/play/<symbol>` with its assets under `/play/<symbol>/assets/`; each built bundle contains the credit line and none contains a title with `Demo`; a build with `GAME_BASE` unset or wrong fails the test; a spin through the application with each of the twelve symbols returns a round with a `totalWin`.
  - **Commit:** `feat(server): build and serve the twelve bundles and document how to run the server`

## Traceability
| requirement | items |
|---|---|
| FR1 | T003, T012 |
| FR2 | T003 |
| FR3 | T003, T004 |
| FR4 | T004 |
| FR5 | T002, T004 |
| FR6 | T004 |
| FR7 | T003 |
| FR8 | T004 |
| FR9 | T004 |
| FR10 | T004 |
| FR11 | T002, T004 |
| FR12 | T005 |
| FR13 | T005 |
| FR14 | T004, T005 |
| FR15 | T005 |
| FR16 | T003, T004, T007, T008, T009, T010, T011, T012 |
| FR17 | T006 |
| FR18 | T007, T008, T009, T010, T011 |
| FR19 | T007, T008, T009, T010, T011, T012 |
| FR20 | T007, T008, T009, T010, T011 |
| FR21 | T007, T008, T009, T010, T011 |
| FR22 | T007, T008, T009, T010, T011 |
| FR23 | T007, T008, T009, T010, T011 |
| FR24 | T007, T008, T009, T010, T011 |
| FR25 | T007, T008, T009, T010, T011 |
| FR26 | T007, T008, T009, T010, T011 |
| FR27 | T007, T008, T009, T010, T011 |
| FR28 | T007, T008, T009, T010, T011 |
| FR29 | T004 |
| FR30 | T005 |
| FR31 | T005 |

| critical file | items |
|---|---|
| `CLAUDE.md` | T001, T012 |
| `.gitignore` | T001 |
| `server/package.json` | T001, T002, T003, T004, T006, T012 |
| `server/package-lock.json` | T001, T002, T003, T004, T006 |
| `server/tsconfig.json` | T001 |
| `server/vitest.config.ts` | T001 |
| `server/src/hub/generated.ts` | T001 |
| `server/tests/hub-contract.test.ts` | T001 |
| `server/tests/fixtures/balance_ok.json` | T001 |
| `server/tests/fixtures/bet_ok.json` | T001 |
| `server/tests/fixtures/bet_refused.json` | T001 |
| `server/tests/fixtures/win_ok.json` | T001 |
| `server/src/rng.ts` | T002 |
| `server/src/money.ts` | T002 |
| `server/src/games/ladder.ts` | T002 |
| `server/src/games/registry.ts` | T002 |
| `server/build.mjs` | T002 |
| `server/tests/rng.test.ts` | T002 |
| `server/tests/money.test.ts` | T002 |
| `server/tests/ladder.test.ts` | T002 |
| `server/tests/registry.test.ts` | T002 |
| `server/src/config.ts` | T003, T005 |
| `server/src/app.ts` | T003, T004, T005 |
| `server/src/main.ts` | T003, T005 |
| `server/src/hub/client.ts` | T003, T004 |
| `server/src/hub/sign.ts` | T003 |
| `server/src/http/session.ts` | T003 |
| `server/src/http/static.ts` | T003 |
| `server/dev/stub-hub.ts` | T003, T004, T005 |
| `server/dev/host.html` | T003 |
| `server/scripts/build-games.mjs` | T003, T012 |
| `server/tests/helpers/app.ts` | T003, T004 |
| `server/tests/session.test.ts` | T003 |
| `server/tests/sign.test.ts` | T003 |
| `server/tests/static.test.ts` | T003 |
| `server/tests/fixtures/play/stellar-sevens/index.html` | T003 |
| `server/migrations/001_rounds.sql` | T004 |
| `server/src/db/pool.ts` | T004 |
| `server/src/db/rounds.ts` | T004, T005 |
| `server/src/spin/spin.ts` | T004, T005 |
| `server/src/spin/outcome.ts` | T004 |
| `server/src/http/spin.ts` | T004 |
| `server/tests/helpers/db.ts` | T004 |
| `server/tests/spin.test.ts` | T004 |
| `server/tests/spin-refused.test.ts` | T004 |
| `server/tests/spin-idempotency.test.ts` | T004 |
| `server/migrations/002_round_retry.sql` | T005 |
| `server/src/spin/sweeper.ts` | T005 |
| `server/src/spin/backoff.ts` | T005 |
| `server/src/http/health.ts` | T005 |
| `server/tests/sweeper.test.ts` | T005 |
| `server/tests/backoff.test.ts` | T005 |
| `server/tests/health.test.ts` | T005 |
| `server/tests/spin-pending.test.ts` | T005 |
| `server/src/tiles/uploadTiles.ts` | T006 |
| `server/scripts/upload-tiles.ts` | T006 |
| `server/proto/catalog.proto` | T006 |
| `server/tests/uploadTiles.test.ts` | T006 |
| `server/tests/helpers/fakeCatalogServer.ts` | T006 |
| `server/tests/fixtures/tile.webp` | T006 |
| `client-kit/package.json` | T007 |
| `client-kit/package-lock.json` | T007 |
| `client-kit/tsconfig.json` | T007 |
| `client-kit/vitest.config.ts` | T007 |
| `client-kit/src/index.ts` | T007 |
| `client-kit/src/wallet.ts` | T007 |
| `client-kit/src/spinKey.ts` | T007 |
| `client-kit/src/messages.ts` | T007 |
| `client-kit/src/deposit.ts` | T007 |
| `client-kit/tests/wallet.test.ts` | T007 |
| `client-kit/tests/spinKey.test.ts` | T007 |
| `client-kit/tests/deposit.test.ts` | T007 |
| `client-kit/tests/games.test.ts` | T007 |
| `client-kit/tests/migratedGames.ts` | T007, T008, T009, T010, T011 |
| `stellar-sevens/src/game/wallet.ts` | T007 |
| `stellar-sevens/src/game/main.ts` | T007 |
| `stellar-sevens/src/game/hud.ts` | T007 |
| `stellar-sevens/src/game/gameinfo.ts` | T007 |
| `stellar-sevens/src/game/style.css` | T007 |
| `stellar-sevens/index.html` | T007 |
| `nitro-hot/src/game/wallet.ts` | T008 |
| `nitro-hot/src/game/main.ts` | T008 |
| `nitro-hot/src/game/hud.ts` | T008 |
| `nitro-hot/src/game/gameinfo.ts` | T008 |
| `nitro-hot/src/game/style.css` | T008 |
| `nitro-hot/index.html` | T008 |
| `scorching-hot/src/game/wallet.ts` | T008 |
| `scorching-hot/src/game/main.ts` | T008 |
| `scorching-hot/src/game/hud.ts` | T008 |
| `scorching-hot/src/game/gameinfo.ts` | T008 |
| `scorching-hot/src/game/style.css` | T008 |
| `scorching-hot/index.html` | T008 |
| `discovery-voyage/src/game/wallet.ts` | T009 |
| `discovery-voyage/src/game/main.ts` | T009 |
| `discovery-voyage/src/game/hud.ts` | T009 |
| `discovery-voyage/src/game/gameinfo.ts` | T009 |
| `discovery-voyage/src/game/style.css` | T009 |
| `discovery-voyage/index.html` | T009 |
| `fairytale/src/game/wallet.ts` | T009 |
| `fairytale/src/game/main.ts` | T009 |
| `fairytale/src/game/hud.ts` | T009 |
| `fairytale/src/game/gameinfo.ts` | T009 |
| `fairytale/src/game/style.css` | T009 |
| `fairytale/index.html` | T009 |
| `house-of-ra/src/game/wallet.ts` | T009 |
| `house-of-ra/src/game/main.ts` | T009 |
| `house-of-ra/src/game/hud.ts` | T009 |
| `house-of-ra/src/game/gameinfo.ts` | T009 |
| `house-of-ra/src/game/style.css` | T009 |
| `house-of-ra/index.html` | T009 |
| `pearl-reef/src/game/wallet.ts` | T010 |
| `pearl-reef/src/game/main.ts` | T010 |
| `pearl-reef/src/game/hud.ts` | T010 |
| `pearl-reef/src/game/gameinfo.ts` | T010 |
| `pearl-reef/src/game/style.css` | T010 |
| `pearl-reef/index.html` | T010 |
| `samurai/src/game/wallet.ts` | T010 |
| `samurai/src/game/main.ts` | T010 |
| `samurai/src/game/hud.ts` | T010 |
| `samurai/src/game/gameinfo.ts` | T010 |
| `samurai/src/game/style.css` | T010 |
| `samurai/index.html` | T010 |
| `tropic-escape/src/game/wallet.ts` | T010 |
| `tropic-escape/src/game/main.ts` | T010 |
| `tropic-escape/src/game/hud.ts` | T010 |
| `tropic-escape/src/game/gameinfo.ts` | T010 |
| `tropic-escape/src/game/style.css` | T010 |
| `tropic-escape/index.html` | T010 |
| `the-dynasty/src/game/wallet.ts` | T011 |
| `the-dynasty/src/game/main.ts` | T011 |
| `the-dynasty/src/game/hud.ts` | T011 |
| `the-dynasty/src/game/gameinfo.ts` | T011 |
| `the-dynasty/src/game/style.css` | T011 |
| `the-dynasty/index.html` | T011 |
| `golden-papyrus/src/game/wallet.ts` | T011 |
| `golden-papyrus/src/game/main.ts` | T011 |
| `golden-papyrus/src/game/hud.ts` | T011 |
| `golden-papyrus/src/game/gameinfo.ts` | T011 |
| `golden-papyrus/src/game/style.css` | T011 |
| `golden-papyrus/index.html` | T011 |
| `bumper-crop/src/game/wallet.ts` | T011 |
| `bumper-crop/src/game/main.ts` | T011 |
| `bumper-crop/src/game/hud.ts` | T011 |
| `bumper-crop/src/game/gameinfo.ts` | T011 |
| `bumper-crop/src/game/style.css` | T011 |
| `bumper-crop/index.html` | T011 |
| `README.md` | T012 |
| `server/.env.example` | T012 |
| `server/tests/games-built.test.ts` | T012 |
| `server/tests/helpers/builtGames.ts` | T012 |
| `server/tests/e2e.test.ts` | T012 |

## Implementation Notes
- T001: `server/` scripts are `codegen`, `codegen:check`, `typecheck`, `test` (later items add the rest); exact pins `openapi-typescript` 7.13.0, `typescript` 5.9.3, `vitest` and `@vitest/coverage-v8` 5.1.0, `yaml` 2.9.1, `@types/node` 22.20.5, `engines` `>=22.12.0 <23`; `tsconfig` is `moduleResolution: bundler` with `noUncheckedIndexedAccess` and `include` of `src`, `tests`, `vitest.config.ts` (an item importing `../<game>/src/engine` adds those paths to `include`); `vitest.config.ts` runs files serially, `env.TEST_DATABASE_URL` defaults to the stand URL, coverage `include` is `src/**/*.ts`; `codegen` reads `../tasks/own-slots-or-free-pragmatic/from-origin/contract.openapi.yaml`; fixture shapes: `balance_ok.json` `{request, response}`, `bet_ok.json` `{requests: {spinWithWin, spinWithoutWin}, response}`, `bet_refused.json` `{request, refused, unauthorized}`, `bet_retry.json` `{request, response}`, `win_ok.json` `{request, response}`, `deposit_message.json` the bare message; `server/.gitattributes` pins `generated.ts` to LF; `Widened<T>` in `hub-contract.test.ts` types JSON fixtures. Symbols added: `interface paths`, `type webhooks`, `interface components`, `type $defs`, `interface operations` in `server/src/hub/generated.ts`.

## Concerns
- T001: three files beyond the item's `**Files:**` — `server/tests/fixtures/bet_retry.json`, `server/tests/fixtures/deposit_message.json`, `server/.gitattributes` — are needed for "every example equals a fixture" and a stable `codegen:check` on Windows. → dismissed: all inside the `server` boundary, no other item reads them
- T001: `generated.ts` is types-only, so changed-line coverage of it is vacuous. → dismissed: the coverage script exits 0 and no code is added to fake it
- T001: the secrets grep matches the contract example's launch token `3f9c0e5a...` in fixtures and `generated.ts`, and the throwaway test-container password sits in `vitest.config.ts` and `CLAUDE.md`. → dismissed: sample values from the contract and a local test container
- T001: `codegen` and `hub-contract.test.ts` read the contract from `tasks/own-slots-or-free-pragmatic/` of this repo. → dismissed: the contract lives with the task workspace while the task runs
