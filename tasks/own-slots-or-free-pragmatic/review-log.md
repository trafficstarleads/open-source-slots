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
