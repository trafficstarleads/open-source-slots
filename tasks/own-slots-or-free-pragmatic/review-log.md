# Review log — own-slots-or-free-pragmatic

### r1 · slots-server reviews/pr-1/review.md #1 — The launch token is written to the server log on every page load
- Where: `server/src/app.ts:26` · `buildApp`
- Code: `const app = Fastify({ logger: { level: config.logLevel } });`
- Why: failure scenario. The hub's launch URL is `{playUrl}/play/{symbol}?token={token}`, served by `registerStaticPages` (`server/src/http/static.ts`, `GET /play/:symbol`). Fastify's default `req` serializer logs `url: req.url`, the query string included (`fastify/lib/logger-pino.js:47-51` at v5.8.0; the server pins 5.12.8). Request logging is on by default at `info`, the default `LOG_LEVEL`. Every page load therefore writes `"url":"/play/stellar-sevens?token=<token>"` to the log. That token is the player's hub session: the browser sends it as the Bearer token to `/api/game/spin`, and it authorises `balance`, `bet` and `win` for that player. The project already treats the address as sensitive. `static.ts` sets `referrer-policy: no-referrer`, and the README says the token is in the address. The log defeats that. No `serializers`, `redact` or `disableRequestLogging` exists anywhere in `server/src`.
- Outcome: fixed — `appLoggerOptions(level)` in `server/src/http/requestLog.ts` sets `serializers.req` to log the path without the query; `buildApp` uses it; README `LOG_LEVEL` row says so
- Red: `server/tests/requestLog.test.ts` > logs the path of a page load without the launch token of its address · `AssertionError: expected '/play/stellar-sevens?token=tok-launch…' to be '/play/stellar-sevens'`
- Sweep: `grep -rnE "(log|logger)\.(info|warn|error|debug)\(.*token" server/src server/dev` · 0; `grep -rn "Fastify(" server/src server/dev server/scripts` · 2 (the app, now with the serializer; the stub hub with `logger: false`)

### r1 · slots-server reviews/pr-1/review.md #2 — `catch` without a binding swallows the presentation error in nine game windows
- Where: `bumper-crop/src/game/main.ts:179`, `discovery-voyage/src/game/main.ts:204`, `fairytale/src/game/main.ts:204`, `golden-papyrus/src/game/main.ts:196`, `house-of-ra/src/game/main.ts:204`, `pearl-reef/src/game/main.ts:204`, `samurai/src/game/main.ts:204`, `the-dynasty/src/game/main.ts:204`, `tropic-escape/src/game/main.ts:204` · `boot` > `play`
- Code: `} catch { hud.message('Something went wrong. Reload to re-sync.');`
- Why: `~/.claude/CODESTYLE.md` §Error Handling: "**Every `except` block logs or re-raises** — silent failure is a bug." The base revision had `catch (err)` at this place (`e4d379c:bumper-crop/src/game/main.ts:185`); the new block drops the binding. If `presentRound` throws mid-animation, the round is already booked on the server, the player sees a generic line and nothing reaches the console, so a support report has nothing to start from.
- Outcome: fixed — each of the nine blocks reads `catch (error) { console.warn('The round could not be presented.', error); … }`
- Red: N/A: a rule finding with no failure scenario; the change is a console line in the windows' presentation path, which has no unit seam
- Sweep: `grep -rn "catch {" --include=*.ts <twelve games> client-kit/src server/src server/dev server/scripts` · 10, all in `audio.ts` files the branch leaves alone
- Elsewhere: `discovery-voyage/src/game/audio.ts:90`, `discovery-voyage/src/game/audio.ts:109`, `fairytale/src/game/audio.ts:121`, `fairytale/src/game/audio.ts:140`, `house-of-ra/src/game/audio.ts:100`, `house-of-ra/src/game/audio.ts:123`, `samurai/src/game/audio.ts:108`, `samurai/src/game/audio.ts:128`, `the-dynasty/src/game/audio.ts:111`, `the-dynasty/src/game/audio.ts:133`

### r1 · slots-server reviews/pr-1/review.md #3 — README stub-hub token table lists five tokens the stub hub does not implement
- Where: `README.md:95-97` · "Run a window against the stub hub", token table
- Code: `| `tok-slow`, `tok-medium` | the bet is answered after 12 and 3 seconds |`
- Why: failure scenario. A developer opens a window with `?token=tok-slow` as documented. `server/dev/stub-hub.ts:81-90` seeds only `tok-rich`, `tok-rich-2`, `tok-poor`, `tok-limit`, `tok-bet-internal`, `tok-win-busy`; `tok-busy-once` and `tok-timeout-then-forbidden` are constants at `:73-74`. Any other token falls to `SESSION_NOT_FOUND`, so the window shows SESSION EXPIRED. `tok-slow`, `tok-medium`, `tok-forbidden`, `tok-pending-win` and `tok-win-conflict` appear nowhere in `server/**` or `client-kit/**` (grep); `tok-timeout-then-forbidden` is implemented but not documented. `AGENTS.md` / `CLAUDE.md`: "A change is not done until the docs match the code."
- How: fix: add the five scripted tokens to the stub hub and document `tok-timeout-then-forbidden` | accept: list in the table exactly the tokens the stub seeds.
- Outcome: accepted: list in the table exactly the tokens the stub seeds — the table now holds the eight seeded tokens (`tok-rich`, `tok-rich-2`, `tok-poor`, `tok-limit`, `tok-bet-internal`, `tok-busy-once`, `tok-timeout-then-forbidden`, `tok-win-busy`) with their scripted behaviour, and one row for any other token; README only
- Red: N/A: documentation page

### r1 · slots-server reviews/pr-1/review.md #4 — README games table has a 5-cell delimiter row under a 6-cell header
- Where: `README.md:12` · "The games" table
- Code: `|---|---|---|---|---|`
- Why: failure scenario. Line 11 has six header cells (`| | Game | Layout | RTP | Original site | Source |`), line 12 has five. The base revision had six (`e4d379c:README.md:12`, `|---|---|---|---|---|---|`). GFM renders a table only when the delimiter row has as many cells as the header, so the twelve-game table shows as raw pipes on GitHub.
- Outcome: fixed — the delimiter row has six cells
- Red: N/A: documentation page

### r1 · slots-server reviews/pr-1/review.md #5 — `creditedShare` is copied into nine game windows and the amended S4 has no test
- Where: `bumper-crop/src/game/main.ts:36`, `discovery-voyage/src/game/main.ts:35`, `fairytale/src/game/main.ts:35`, `golden-papyrus/src/game/main.ts:35`, `house-of-ra/src/game/main.ts:35`, `pearl-reef/src/game/main.ts:35`, `samurai/src/game/main.ts:35`, `the-dynasty/src/game/main.ts:35`, `tropic-escape/src/game/main.ts:35` · `creditedShare`
- Code: `function creditedShare(creditedCents: number, partUnits: number, wholeUnits: number): number {`
- Why: `~/.claude/CODESTYLE.md` §DRY: "A near-duplicate found means reuse or extend it." `client-kit/src/wallet.ts` already holds the shared cent maths (`toCents`, `fromCents`, `roundView`), and this change created `client-kit` for exactly what the windows share. `creditedShare` is the rule behind the amended S4 of `ui-contract.md` (every figure shown before the final win is a share of the credited amount, rounded to the cent): a money rule kept in nine places, so a rounding fix lands nine times. No test calls it (grep over `client-kit/` and `server/` finds `creditedShare` only in the nine `main.ts` files; `client-kit/tests/games.test.ts` checks the windows by text patterns).
- Outcome: fixed — one `creditedShare` exported from `client-kit/src/wallet.ts` and `client-kit/src/index.ts`, re-exported by each window's `wallet.ts` and imported by its `main.ts`; the nine local copies are gone; `tasks.md` T009 note follows
- Red: `client-kit/tests/wallet.test.ts` > shares of the credited win (3 cases) · `TypeError: creditedShare is not a function`
- Sweep: `grep -rnE "function creditedShare|Math\.round\(\(.*Cents" --include=*.ts */src client-kit/src` · 1 (the `client-kit` export)

### r1 · slots-server reviews/pr-1/review.md #6 — The spin use case imports the HTTP layer's error vocabulary
- Where: `server/src/spin/outcome.ts:3` · module imports, and `REFUSAL_ANSWERS` (`outcome.ts:24-34`)
- Code: `import type { BrowserErrorCode } from '../http/browserError';`
- Why: `~/.claude/ARCHITECTURE.md` §DDD Layered Architecture: "dependencies point inward toward `domain`: `presentation → application → domain`". `spin/` plays the use-case role; `outcome.ts` maps hub refusals straight to browser error codes from `http/`, so the use case knows the presentation vocabulary. PLAUSIBLE because the server has no literal `presentation/application` folders and the mapping of `spin/` to the application ring is an inference.
- How: the use case returns its own refusal categories; `http/spin.ts` translates them to `BrowserErrorCode`.
- Outcome: declined by user — the server has no literal presentation/application folders, and the import direction stays as it is

### r1 · slots-server reviews/pr-1/review.md #7 — `balance_cents` and `win_cents` are 32-bit integers
- Where: `server/migrations/001_rounds.sql:13`, `server/migrations/001_rounds.sql:8` · `rounds`
- Code: `balance_cents integer,`
- Why: failure scenario. `readAnswer` in `server/src/hub/client.ts` accepts any whole `balanceCents >= 0`, and the contract (`from-origin/contract.openapi.yaml`, `balanceCents: integer, minimum: 0`) sets no maximum. A balance above 2,147,483,647 cents (about 21.5 million) overflows the `integer` column in `acceptBet` / `settleWin` after the hub has already debited or credited; the request answers 503 `busy`, and the sweeper retries the same failing write indefinitely. Open step: whether the hub caps a balance below that.
- Outcome: fixed — migration `003_balance_bigint.sql` makes `balance_cents` `bigint`; `createPool` and the test pool read `int8` as a JS number (`CENTS_AS_NUMBERS` in `server/src/db/pool.ts`), so the browser answer stays a JSON number; the hub client accepts only safe integers (`isWholeCents`), so every accepted balance fits the column and reads back exactly; `db-model-diff.md` records the change. `win_cents` stays `integer`, as the picked resolution covers the amounts that come from the hub: the server draws the win, capped by the 10.00 top bet (10 000 000 cents for the worst documented round), and `spin-idempotency.test.ts` pins it as an `integer` column
- Red: `server/tests/spin-idempotency.test.ts` > books a hub balance above the 32-bit range and answers it as a JSON number · `AssertionError: expected 503 to be 200`
- Sweep: `grep -rnE "\binteger\b" server/migrations | grep -i cents` · 3 (`bet_cents`, ladder-bounded 10 to 1000; `win_cents`, server-drawn; `balance_cents` in `001`, altered by `003`)

### r1 · slots-server reviews/pr-1/review.md #8 — `showFailure` is the same ten lines in all twelve `main.ts` files
- Where: `bumper-crop/src/game/main.ts:88`, `discovery-voyage/src/game/main.ts:87`, `fairytale/src/game/main.ts:87`, `golden-papyrus/src/game/main.ts:87`, `house-of-ra/src/game/main.ts:87`, `nitro-hot/src/game/main.ts:71`, `pearl-reef/src/game/main.ts:87`, `samurai/src/game/main.ts:87`, `scorching-hot/src/game/main.ts:73`, `stellar-sevens/src/game/main.ts:71`, `the-dynasty/src/game/main.ts:87`, `tropic-escape/src/game/main.ts:87` · `boot` > `showFailure`
- Code: `function showFailure(failure: Failure): void { if (failure.offersDeposit) { hud.offerDeposit(failure.message); } else { hud.message(failure.message); }`
- Why: `~/.claude/CODESTYLE.md` §DRY: "A near-duplicate found means reuse or extend it." The twelve bodies are byte-identical (md5 of the lines compared) and depend only on `Failure` and three `hud` methods, while `client-kit` already supplies `Failure` to every window. The repository's per-game layout is a stated reason to keep copies: fix: `client-kit` exports `showFailure(hud, failure)` | accept: per-window copies are how the windows were built.
- Outcome: fixed — `showFailure(display: FailureDisplay, failure)` and `interface FailureDisplay {message, offerDeposit, setBalance}` in `client-kit/src/wallet.ts`, exported from `client-kit/src/index.ts`, re-exported by each window's `wallet.ts`; each `main.ts` calls `showFailure(hud, <outcome>.failure)` at its three places and lost its local copy and its `type Failure` import; `client-kit/tests/wallet.test.ts` > showing a failure (2 cases)
- Red: N/A: Toward standard, a duplication with no failure scenario
- Sweep: `grep -rn "function showFailure" --include=*.ts <twelve games>/src client-kit/src` · 1 (the `client-kit` export)

### r1 · slots-server reviews/pr-1/review.md #9 — Each `hud.ts` re-types the server's bet ladder
- Where: `bumper-crop/src/game/hud.ts:13`, `discovery-voyage/src/game/hud.ts:15`, `fairytale/src/game/hud.ts:15`, `golden-papyrus/src/game/hud.ts:15`, `house-of-ra/src/game/hud.ts:15`, `nitro-hot/src/game/hud.ts:11`, `pearl-reef/src/game/hud.ts:15`, `samurai/src/game/hud.ts:15`, `scorching-hot/src/game/hud.ts:11`, `stellar-sevens/src/game/hud.ts:11`, `the-dynasty/src/game/hud.ts:24`, `tropic-escape/src/game/hud.ts:15` · `BETS`
- Code: `const BETS = [ 0.1, 0.2, 0.4, 0.6, 0.8, 1, 1.2, 1.4, 1.6, 1.8, 2, 3, 4, 5, 6, 7, 8, 9, 10, ];`
- Why: the existing symbol `BET_LADDER_CENTS` (`server/src/games/ladder.ts:1`) holds the same 19 stakes in cents. The only link is the subset check at `client-kit/tests/games.test.ts:79`, so a rung added on the server shows up in no window.
- How: `client-kit` exports the ladder once and the server and the huds use it | accept: keep the per-window lists, since `games.test.ts` guards the drift, and make that guard an equality check.
- Outcome: accepted: keep the per-window lists, since `games.test.ts` guards the drift, and make that guard an equality check — `client-kit/tests/games.test.ts` > offers exactly the bets of the server ladder asserts each window's `BETS` in cents equals `BET_LADDER_CENTS` (the subset, 10.00-present and 15-absent checks and `TOP_BET_CENTS` are gone, the equality covers them); `tasks.md` T007 note follows
- Red: N/A: Toward standard; the twelve lists equal the ladder today, so the new guard passes on the unfixed windows by design
- Sweep: `grep -rln "const BETS" <twelve games>/src/game/hud.ts` · 12, each a per-window list the picked resolution keeps, each held equal to the ladder by the guard

### r1 · slots-server reviews/pr-1/review.md #10 — `isRecord` is defined three times in `server`
- Where: `server/src/http/spin.ts:9-11`, `server/src/hub/client.ts:49-51`, `server/dev/stub-hub.ts:132-134` · `isRecord`
- Code: `function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === 'object' && value !== null && !Array.isArray(value); }`
- Why: `~/.claude/CODESTYLE.md` §DRY: "A near-duplicate found means reuse or extend it." Three byte-identical copies in one package (a fourth lives in `client-kit/src/wallet.ts:101`, a separate package).
- Outcome: fixed — one exported `isRecord` in `server/src/record.ts`, imported by `http/spin.ts`, `hub/client.ts`, `dev/stub-hub.ts` and by `tests/hub-contract.test.ts`, whose fourth server copy the sweep found
- Red: N/A: Toward standard, a duplication with no failure scenario
- Sweep: `grep -rn "function isRecord" --include=*.ts server/src server/dev server/scripts server/tests client-kit/src client-kit/tests` · 2 (`server/src/record.ts`; `client-kit/src/wallet.ts:122`, the browser package, which ships without the server and imports nothing from it at runtime)

### r1 · slots-server reviews/pr-1/review.md #11 — The browser error codes are typed out on both sides of the wire
- Where: `client-kit/src/messages.ts:1-8` · `SERVER_ERROR_CODES`; `server/src/http/browserError.ts:3-9` · `BrowserErrorCode`
- Code: `export const SERVER_ERROR_CODES = [ 'session_expired', 'insufficient_funds',`
- Why: the same six strings are `BrowserErrorCode` on the server. No test or import ties them (grep of `server/tests` and `client-kit/tests` for either name finds nothing). A code added on the server reaches the player through the client's fallback, which shows the wrong message. The two packages deploy separately, which is a reason to keep two lists, so it needs a judgment.
- Outcome: fixed — the picked resolution: the lists stay independent and a test asserts they are equal. `server/src/http/browserError.ts` declares `BROWSER_ERROR_CODES` and derives `BrowserErrorCode` from it; `server/tests/browserError.test.ts` compares it with the kit's `SERVER_ERROR_CODES`
- Red: N/A: Toward standard; the two lists agree today, so the new guard passes on the unfixed code by design

### r1 · slots-server reviews/pr-1/review.md #13 — The "no win, so the bet closes the round" rule is decided in TypeScript and again in SQL
- Where: `server/src/spin/spin.ts:151` · `sendBet`; `server/src/db/rounds.ts:166-167` · `acceptBet`
- Code: `{ token: sent.token, roundId: sent.id, amountCents: sent.betCents, roundClose: sent.winCents === 0 },`
- Why: design smell, `design-smells.md` row Feature Envy: "a function reaching into another object's data more than its own — the general form of the canon's rule that a value a use case computes about an entity and assigns back is a method that entity should have had". `spin.ts` decides `roundClose` as `winCents === 0`; `acceptBet` decides `CASE WHEN win_cents > 0 THEN win_pending ELSE settled`. If one changes without the other, the hub closes the round at `bet` while the journal waits for a `win` that is never sent. Both agree today.
- Outcome: fixed — `owesWin(round)` in `server/src/db/rounds.ts` holds the rule once; `sendBet` sends `roundClose: !owesWin(sent)`; `acceptBet(db, round, balanceCents, leaseUntil)` takes the row, picks `win_pending` with the lease or `settled` with no next attempt by `owesWin`, and passes both to the SQL as parameters (`SET status = $3, next_attempt_at = $4`); the order of side effects in `sendBet` is unchanged
- Red: N/A: Toward standard; both deciders agree today, and the zero-win and winning paths stay pinned by `spin.test.ts`, `spin-pending.test.ts` and `e2e.test.ts`
- Sweep: `grep -rnE "winCents (===|!==|>) 0|win_cents (>|=) 0" server/src server/dev` · 2 (`owesWin`; `refuseBet` writing `win_cents = 0`, an assignment, not the rule)

### r1 · slots-server reviews/pr-1/review.md #14 — The HUD docblock was extended with a sentence that describes the file
- Where: `bumper-crop/src/game/hud.ts:5`, `discovery-voyage/src/game/hud.ts:6`, `fairytale/src/game/hud.ts:6`, `golden-papyrus/src/game/hud.ts:6`, `house-of-ra/src/game/hud.ts:6`, `nitro-hot/src/game/hud.ts:4`, `pearl-reef/src/game/hud.ts:6`, `samurai/src/game/hud.ts:6`, `scorching-hot/src/game/hud.ts:4`, `stellar-sevens/src/game/hud.ts:4`, `the-dynasty/src/game/hud.ts:6-7`, `tropic-escape/src/game/hud.ts:6` · file header
- Code: `* the DEPOSIT button that goes with a refusal for funds.`
- Why: `~/.claude/CODESTYLE.md` §Comments: "No comments, no docstrings — if it needs one to explain what it does, rewrite it instead." The diff rewrites these header lines (replacing the DEMO sentence with the DEPOSIT one), so the violation sits in the edited lines; the quote is the `bumper-crop` line, the others end the same way.
- Outcome: fixed — the DEPOSIT clause is gone from all twelve headers, each now ending where the base revision's first sentence ended (`... the closing tally).`, `... BIG WIN plaque.`, `... the whole barn ladder bonus.`)
- Red: N/A: a comment, no behavior
- Sweep: `grep -rn "DEPOSIT button" <twelve games>/src` · 0
