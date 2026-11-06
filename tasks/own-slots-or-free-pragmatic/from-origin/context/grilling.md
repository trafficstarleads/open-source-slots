# Grilling record — own-slots-or-free-pragmatic

## Round 0 (before the grilling skill, in the chat)

| # | Decision | By | Note |
|---|---|---|---|
| 0.1 | Integration goes into the game hub (`Casino-Game-Aggregator`), not into the platform | user | "в гейм агрегатор по сути интеграция нужна и все" |
| 0.2 | First pick was `slotopol/server`; dropped after recon | user | Recon: API only (no screen), own float balance with no idempotency or locks, public JWT keys and a committed API key in the repo, open signup minting coins, spin redrawn up to 300 times when the club bank cannot cover the win |
| 0.3 | Trademark / provenance risk of games ported from commercial slots is not critical for now (internal network) | user | Carried over to the Z1000k pick: its maths is ported from slotopol |

## Round 1 (grilling) — answered

| Q | Question | Answer | Effect |
|---|---|---|---|
| Q1 | Money: game coins or site balance | **Site balance, always** ("платим всегда настоящим балансом, все должно работать") | Every bet and win goes through the platform wallet; failure and retry handling is mandatory |
| Q2 | Game screen: one generic screen or per-game art | Moot: the user asked for ready graphics | Z1000k ships a client with art and sound per game |
| Q3 | Which games | **github.com/Z1000k/open-source-slots** ("если там есть визуал") | slotopol dropped; the 11 Z1000k games are the content. Which of the 11 launch: open |
| Q4 | RTP | **A** (one ~95% for everything) | There is no global knob in Z1000k: every game has a fixed RTP in its reel strips (94.14-95.66% claimed), re-verify with the repo's own simulators |

## Round 2 (grilling) — answered

| Q | Question | Answer | Effect |
|---|---|---|---|
| Q5 | How bets and wins reach the player's balance | **A: the Z1000k games run as a vendor of the hub** — a new game server (Node/TypeScript, Z1000k engines) resolves the round, the hub receives bet and win through its standard signed webhook and itself calls the platform wallet (debit, credit, rollback) | New hub partner crate (per `docs/wiki/Adding-a-Provider.md`) plus a new game-server service; the platform half needs no change for the money path |
| Q6 | Pragmatic in this task | **Stays switched off**, not touched and not removed ("выключенной остаётся") | Pragmatic is out of scope; closes author-qa Q1 as B |

## Round 3 (grilling) — answered

Recon behind it: Z1000k has 12 games (not 11); its clients already have a REAL mode calling `/api/game/{session,spin,deliver}` with a client idempotency key and 3 retries; the server for that contract is not in the repo; `playRound(rng)` resolves a whole round (free games, avalanches, ladder) in one call; engines are pure TypeScript with zero dependencies; RNG is an injectable interface.

| Q | Question | Answer | Effect |
|---|---|---|---|
| Q7 | Which games | **A: all 12** | Each can be switched off later in the hub with one row |
| Q8 | Bet range | **0.10 - 50** ("5 мало, мб до 50") | Their REAL ladder caps at 5 (`BETS = ALL_BETS.filter(b => b <= 5)` in each `hud.ts`); the cap moves to 50 in every client and on the server |
| Q9 | Win cap per round | **A: none** (answered while the example was bet 5; see re-confirmation below) | RTP unchanged |
| Q10 | When a win lands on the balance | **A: at once, at the moment of the spin** | No held wins; `deliver` is a no-op |
| Q11 | Rounding of a win to a cent | **A: to the nearest cent** | RTP preserved on average |
| Q12 | Where the game server lives | **A: fork of Z1000k in `trafficstarleads`, server beside the games** | The fork is created only on a separate go-ahead at build time |
| Q13 | Where round results are stored | not answered | Asked again in round 4 |

## Round 4 (grilling) — answered

Recon behind it: with a 50 bet the worst round on Golden Papyrus would be 10 000x = 500 000. The platform half needs little: the CSP already allows any `https://` iframe (`frame-src https://*`), the header balance refreshes through `balance:update` once per wallet leg, the tile image is `VITE_GAMEHUB_CDN_URL` + a relative path from the hub catalogue, and the platform listens to no message from the game iframe.

| Q | Question | Answer | Effect |
|---|---|---|---|
| Q9 (re-confirmed) | Win cap per round, with the bet range reconsidered | **"давай ставку до 10"**, read as: no win cap, and the maximum bet comes down from 50 to **10** | Q8 is superseded: bets **0.10 - 10**. Worst round: 10 000x * 10 = **100 000** on Golden Papyrus. Every client's REAL ladder filter moves from `<= 5` to `<= 10`; the server refuses above 10 |
| Q13 | Where round results are stored | **A: Postgres of the game server**, rounds kept without expiry | Game server has its own Postgres and migrations |
| Q14 | Demo for games | **"без демо"** — no demo at all | The vendor's `demo()` answers Unsupported and `demo_enable` is false for every game. The platform shows its "Play demo" switch whatever `demo_enable` says (it never reads it), so the switch must be hidden for games with `demo_enable = false` — "everything available must work" |
| Q15 | The 15 "Original" tiles | **Hide them** ("скрываем, все что доступно должно работать") | Platform client: the hard-coded Original section on the home page and the in-house entries in the search go; direct `/games/<id>` URLs stop leading to the dead stub |

## Round 5 (grilling) — answered

Recon behind it (hub money path): for one callback carrying bet and win the hub books the **win first, then the bet** (`Spins::money`, `crates/engine/src/spin.rs:630-634`), and the platform checks the bet against the balance **after** the win is credited (`legs.js:117-121`); an under-funded player would keep every winning round and lose nothing on losing ones. A leg left unconfirmed is swept by nobody; only the vendor's retry resolves it (`sweeper.rs` re-sends ROLLBACK rows only). Sessions live 24 h in Redis, renewed by every callback. Images enter the catalogue only through the `UpdateImage` RPC (`CATALOG_ADMIN_KEY`, keys `1x1/2x3/4x3/3x2`, relative paths).

| Q | Question | Answer | Effect |
|---|---|---|---|
| Q16 | One hub call with bet and win, or two | **A: two calls** — bet alone first, win alone after | Bet is checked against the balance before the result is paid; a bet that is refused ends the spin with "not enough funds". Transaction ids: `<key>:bet` and `<key>:win`, one round id; a zero-win round is a single bet call with `round_close` |
| Q17 | Win cannot be credited after the bet was debited | **A: result is shown, the win is marked "being credited" and a background job on the game server retries until credited** | Rounds table keeps a status (bet debited / win pending / settled); the game server owns a sweeper |
| Q18 | Balance too low for the bet | **B** (the user wrote "в", read as B): message plus a "Deposit" button | Platform: a `message` listener in `GamehubGame.jsx` checking `event.origin` and `event.source`, navigating to the deposit page |
| Q19 | Provider name in the lobby | Not answered in words. The user wrote "просто вместо ориджинал ставим" — put the new games **in place of the "Original" block** on the home page | Platform: the hard-coded Original block (`HomePage.jsx:100-143`) gives way to a row of the new games. Provider name taken as **APEXSLOTS** (the recommended option) — an **assumption**, one line to change |
| Q20 | Address of the game server | **A: own subdomain with https** ("поддомены"). Noted by the user: at deploy time the needed resources must be worked out ("надо будет понять скок чего надо") | Deploy sizing for the game server, its Postgres and the subdomain certificate is an open item of the deploy step, not of the spec |

Author questions from `author-qa.md` thereby all answered: Q4 (guests) is moot — "без демо" — and Q5 is closed by Q15 and Q19.

## Defaults taken by the spec (not asked; each goes to `plan.md` Decisions with its alternative)

- Webhook between game server and hub: signed JSON, HMAC-SHA256 over the raw body in `X-Signature` with the partner `secretKey` (the gambutsoft pattern), `nonce` unused, amounts as integer cents, dedup by transaction id.
- The game page gets the hub session token in the URL, the patched client keeps it and sends it as an `Authorization` header (no cookie: the game runs in a third-party iframe).
- Game server RNG: a Web Crypto based implementation of the engines' `RNG` interface, never a client seed.
- The engines are built with a bundler step (extensionless imports), not loaded as raw `.ts`.
- CC BY credit ("Art by APEXSLOTS, apexslots.eu, CC BY 4.0") added to the info screen of every game.
- Tile images uploaded once through `UpdateImage` by a script; the platform's `VITE_GAMEHUB_CDN_URL` must point at the hub's image store.

## Round 6 (spec review, three design findings) — answered

| Q | Finding | Answer | Effect |
|---|---|---|---|
| Q21 | SR1: a definite refusal of a win after its bet was debited ends the retry | **A**: a refused win is never final for the game server; the round stays "win pending", retried with growing pauses and an alert; only `CONFLICT` and `BAD_REQUEST` are parked for an operator | Contract: `Refused` description; feature.md business rule; the game server's sweeper and a test case in its half |
| Q22 | SR2: a signed bet body replayed on `/win` | **A**: the crate refuses with `BAD_REQUEST` any `transactionId` that is not exactly `<roundId>:<last path segment>` | Contract `transactionId`; T002 acceptance; TC18 |
| Q23 | SR5: a win credited after the 24 h session lapsed | **A**: `recovery_requires_launch_token()` is true; the game server keeps each round's token in its journal and sends it on every repeat | Contract `token`; plan Decisions; T002 acceptance; TC17 |

## Open after round 5

- Nothing product-level. Deploy sizing is carried to the deploy step.

## Open after round 4 (superseded)

- Money path inside the hub (one call with bet and win, partial failure) — hub recon running.
- Game launch by token, the session lifetime, what the game does when the balance is too low for a bet (message only, or also a jump to the deposit page).
- Webhook protocol between the game server and the hub; deployment and secrets of the game server; tile images and the CDN base.

## Open after round 2

- Which of the 11 games launch; where the game server's code lives (new repo or beside the hub); how a bonus round's state is held; how the browser client is changed to take a server result; deployment and secrets of the game server.
- Author-qa Q4 (guests) and Q5 (dead "Original" tiles).

## Open after round 1 (superseded by the list above)

- Where the engine runs (server-authoritative is forced by Q1), and how the money path reaches the platform wallet.
- Whether Pragmatic is out of this task (author-qa Q1).
- Author-qa Q4 (guests) and Q5 (dead "Original" tiles).
