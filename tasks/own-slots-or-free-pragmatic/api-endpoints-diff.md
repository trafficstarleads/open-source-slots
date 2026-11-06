# API endpoints diff — the game server

Source of truth: the application factory `server/src/app.ts` and the route files under `server/src/http/` (created by T003-T005). The server is new, so every row is added. The hub's webhook it calls is the origin's contract, `from-origin/contract.openapi.yaml`. Built by `plan.md` steps 3-5.

## Pages — `server/src/http/static.ts`

| Endpoint | Status | What changes |
|---|---|---|
| `GET /play/{symbol}` | added | the page of one of the twelve games (`index.html` of the bundle built with `GAME_BASE=/play/{symbol}/`), with `Content-Security-Policy: frame-ancestors <FRAME_ANCESTORS>` and `Referrer-Policy: no-referrer`; the query (`token`, `lang`, `lobby`) is read by the page, not the server. Unknown symbol: 404. Built by T003 (fixture page) and T012 (the twelve bundles) |
| `GET /play/{symbol}/assets/*` | added | the bundle's files, from `PUBLIC_DIR`; a path that leaves the folder: 404 |

## Browser API — `server/src/http/session.ts`, `spin.ts`

All calls carry `Authorization: Bearer <launch token>` and are same-origin (the pages come from this server). A failure is `{ok: false, error: <code>, balanceCents?}`.

| Endpoint | Status | What changes |
|---|---|---|
| `GET /api/game/session?game={symbol}` | added | `200 {ok: true, balanceCents}` from the hub's `balance`; `401 session_expired` (no token, or the hub's `SESSION_NOT_FOUND`); `503 unavailable` (hub `UNAUTHORIZED`, 403, 404, no answer); `400 bad_request` (unknown game). T003 |
| `POST /api/game/spin` | added | body `{game, key, betCents, play: {type: 'base'}}`. `200 {ok: true, roundId, round, winCents, costCents, balanceCents, replay?, creditPending?}`: `round` is the engine's round, `costCents` equals `betCents`, `replay` is true for a repeated key, `creditPending` is true while the win is not credited. A repeated key of a round that still owes its win or is parked answers `200` with the outcome and `creditPending: true`. Failures: `400 bad_request` (game or bet off the ladder), `401 session_expired` (no token, or the bet refused `SESSION_NOT_FOUND`: the round ends `refused`), `422 insufficient_funds` (with `balanceCents`), `422 bet_refused` (`LIMIT_EXCEEDED`, `REFUSED`, `CONFLICT`, `BAD_REQUEST`; the round ends `refused`), `503 busy` (no definite answer to the bet within 8 s, `BUSY` repeated inside the budget every 0.2 s growing to 1 s; the round stays `bet_pending`), `503 unavailable` (the bet answered 401, 403 or 404, nothing moved: the round ends `refused`). A key answered `bet_refused`, `insufficient_funds`, `session_expired` or `unavailable` returns the same answer when repeated. T004, T005 |
| `POST /api/game/deliver` | not-doing | the win is credited at the spin, so there is nothing to deliver; the clients drop the call and the server answers 404 |
| `GET /healthz` | added | `{waitingBet, waitingWin, parked, oldestWaitingSeconds}`, all integers (cast in SQL); no token. T005 |

Below the router:

- `server/src/hub/client.ts`: the three hub calls with a per-call timeout; each body is signed with HMAC-SHA256 under `HUB_SECRET_KEY` and sent with `X-Signature` (`from-origin/contract.openapi.yaml` §`Signature`). `transactionId` is always `<roundId>:bet` or `<roundId>:win`. T003, T004.
- `server/src/games/registry.ts`: the engine of each symbol; a spin runs `dealRound(symbol, rng)` and never reads an outcome from the request. T002.
- `server/src/spin/sweeper.ts`: the repeat of unfinished legs; it calls the same hub client. T005.

## Settings (new) — `server/src/config.ts`

`PORT`, `DATABASE_URL`, `HUB_BASE_URL`, `HUB_PARTNER`, `HUB_SECRET_KEY`, `FRAME_ANCESTORS` (required, no default), `PUBLIC_DIR`, `HUB_CALL_TIMEOUT_MS` (8000), `SWEEP_INTERVAL_MS`, `ALERT_AFTER_ATTEMPTS` (5). The upload script reads `CATALOG_GRPC_ADDRESS` and `CATALOG_ADMIN_KEY`. Listed in `server/.env.example` (T012).

## Stub hub — `server/dev/stub-hub.ts` (development and tests)

Started by `npm --prefix server run dev:stub` on port 9100 together with the game server; it answers the three webhook calls by the contract, checks the `X-Signature` and keeps one wallet per token. Its tokens:

| token | behavior |
|---|---|
| `tok-rich` | balance 100.00; every call is accepted |
| `tok-rich-2` | a second player with balance 100.00 |
| `tok-poor` | balance 0.05; a bet is refused `INSUFFICIENT_FUNDS` |
| `tok-expired` | every call is refused `SESSION_NOT_FOUND` |
| `tok-limit` | a bet is refused `LIMIT_EXCEEDED` |
| `tok-slow` | the bet answers after 12 seconds (longer than the 8 second wait) |
| `tok-medium` | the bet answers after 3 seconds (inside the 8 second wait) |
| `tok-busy-once` | the first bet call of a round answers `503 BUSY`, the next is accepted |
| `tok-forbidden` | every bet call answers `403` with no body |
| `tok-bet-internal` | every bet call answers `503 INTERNAL` |
| `tok-pending-win` | the first two win calls of a round answer `503 BUSY`, the third is accepted |
| `tok-win-conflict` | a win call is refused `CONFLICT` |
| `tok-win-busy` | every win call answers `503 BUSY` |

`GET /host/{symbol}?token=…` serves `server/dev/host.html`: a page of another origin that frames `/play/{symbol}` and shows every message the frame posts. `GET /calls` returns the calls the stub received, in order, with their transaction ids. `POST /deposit/{token}?cents=N` adds N cents to a token's wallet, standing in for a deposit made elsewhere. Added by T003 (the `balance` call, the wallets, `tok-rich`, `tok-rich-2`, `tok-expired`, `/calls`, `/deposit`, `/host`), T004 (the `bet` and `win` calls and the bet tokens `tok-poor`, `tok-limit`, `tok-slow`, `tok-medium`, `tok-forbidden`, `tok-bet-internal`) and T005 (`tok-busy-once` and the win tokens); the tokens `tok-pending-win`, `tok-win-conflict` and `tok-win-busy` by T005.

## Hub calls this half makes outside the contract

- `gamehub.v1.GameService/UpdateImage` over gRPC (T006): unchanged by this task, described in the hub's `proto/gamehub/v1/catalog.proto`; the upload script keeps a copy of that file.
