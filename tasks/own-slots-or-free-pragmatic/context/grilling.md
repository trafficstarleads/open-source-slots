# Grilling record — own-slots-or-free-pragmatic · slots-server

## Round 1 (2026-11-06) — answered "все да": the recommended option of every question

| Q | Question | Answer | Effect |
|---|---|---|---|
| Q6 | After the connection drops mid-spin, does the player see the round? (author question, also in the origin's `context/author-qa.md` Round 2) | **A**: the window keeps the key of the unfinished spin while the tab lives, including a reload; the next SPIN or a reopen shows that same round, nothing is charged twice. Tab closed: the win still lands, unseen | The browser key is stored in `sessionStorage` per game and token, replayed with its own bet; the server answers a repeated key with the first answer |
| Q7 | Language of the game windows (author question) | **A**: English only, `lang` ignored | New messages are English; no catalogue |
| Q8 | Deposit button message | **Yes**: `{type:'apex:deposit'}` posted only on the button press; target origin = origin of the `lobby` parameter, any origin when `lobby` is empty. The two contract amendments go to the hub: A1 the message, A2 the twelve symbols | Contract feedback verdict `AMENDMENTS_REQUIRED` |
| Q9 | Types of the hub wire | **A**: generated from `contract.openapi.yaml` by `openapi-typescript`; `Check:` regenerates with `--check` | First item stands the generated types up |
| Q10 | How the twelve engines reach the server | **A**: imported in place from the games' folders, bundled by esbuild; engines are not edited | Server build depends on the twelve folders |
| Q11 | Client changes | **A**: one shared module (`client-kit/`), every game's `wallet.ts` shrinks to its `GAME` constant plus a re-export | Three variants of `wallet.ts` replaced by one module |
| Q12 | Demo code in clients | **A**: removed; the clients work only against the server; the server runs with a stub hub for development; the idle first grid comes from a constant | R3, R7 |
| Q13 | Server stack | **Yes**: Node 22, TypeScript, Fastify, `pg` with plain SQL, `node-pg-migrate`, vitest, `tsx`, esbuild | `plan.md` §Decisions |
| Q14 | Seams | **Yes**: S1 the HTTP application against real Postgres and a stub hub, S2 `dealRound` over the twelve games, S3 the shared client module plus the real-browser walk | `plan.md` §Seams (S4, the tile upload script against a local gRPC server, is added by the spec and shown at the approval) |
| Q15 | Alert for a stuck win | **A**: an `error` log line `win_pending_alert` per attempt after the fifth, and `GET /healthz` counts | No pager integration here |

## Round 2 (spec review, six design findings) — answered "да": the recommended option of every question

| Q | Finding | Answer | Effect |
|---|---|---|---|
| Q16 | SR2: a bet answered 401, 403 or 404 | **A**: the round ends `refused` (nothing moved), the answer is `unavailable`, the window clears its key; a repeated key of a `parked` round answers the outcome with `creditPending` | FR29, FR10, Decisions; contract amendment A3 (for a bet the game server ends the round, for a win it repeats) |
| Q17 | SR3: `FOR UPDATE SKIP LOCKED` across the hub call | **A**: lease claim in a short transaction, the hub call outside it, the outcome written `WHERE status = <claimed>`; a new `bet_pending` round is not due for 8 s + margin | FR30, Decisions, T005 |
| Q18 | SR4: the hub answers `BUSY` to any concurrent call of the same player | **A**: the spin request repeats `BUSY` every 0.2 s growing to 1 s inside its 8 s budget before it answers `busy` | FR12, F6, stub token `tok-busy-once` |
| Q19 | SR8: the window blocks SPIN on a stale balance | **A**: when the shown balance is below the bet the window asks the session first and refuses only on the fresh balance | FR23, S6, L3 |
| Q20 | SR9: a kept spin replayed with its stored bet | **A**: the stored bet is shown and the bet controls are locked until a definite answer | FR26, S8, S9, L6 |
| Q21 | SR10: no alert for a stuck bet | **A**: `bet_pending_alert` per attempt after the fifth, like the win | FR15 |

Mechanical findings fixed without asking: SR1 (a bet refused `SESSION_NOT_FOUND` ends `refused`), SR5 (`win_cents` is `integer`, health counts cast to `int`), SR6 (stub token `tok-medium`), SR7 (`build:games` before every Verify walk).

## Defaults taken by the spec (not asked; each goes to `plan.md` Decisions with its alternative)

- The token is read from `?token=`, kept in `sessionStorage` and sent as `Authorization: Bearer`; the address bar keeps the token so a reload of the frame still opens the game.
- The browser API keeps the shape the clients already speak (`/api/game/session`, `/api/game/spin`); `/api/game/deliver` is not served and the clients drop it. The server never sends `held` or `pending`.
- The spin key is scoped to the token: the journal key is `(token, spin key)`.
- The game server draws the round, saves it, and calls the hub `bet` before it answers the browser; the browser waits at most `HUB_CALL_TIMEOUT_MS` (8 s) for the bet, then gets `busy` and repeats the same key; the sweeper keeps repeating the bet until the hub answers.
- Retry pauses of the sweeper: 5 s doubling to a ceiling of 1 hour.
- The drawn result of a round whose bet was definitely refused is deleted from the journal: R6 says "without drawing an outcome" and the origin's order of one spin draws first; the player sees nothing either way, so the discarded draw is not kept.
- `FRAME_ANCESTORS` is a required setting, sent as `Content-Security-Policy: frame-ancestors`; the server also sends `Referrer-Policy: no-referrer` because the token is in the address.
- Deployment sizing, the Dockerfile and the subdomain are carried to the deploy step (origin: out of scope).
- The fork under `trafficstarleads` and its remote are created only on the user's separate go-ahead at build time.
