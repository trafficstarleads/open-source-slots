# DB model diff — the round journal of the game server

Source of truth: `server/migrations/*.sql` (created by T004 and T005). The database is new and belongs to the game server alone; nothing else in the fork has one. Built by `plan.md` steps 4 and 5.

## Table `rounds`

| Field | Type | Status | Comment |
|---|---|---|---|
| `id` | `uuid` primary key | added | the round id minted by the server per accepted spin key; the hub's `roundId`, and the base of `<id>:bet` and `<id>:win`. Uniqueness across players is the server's duty because the hub never compares the player (origin Decisions, round ids) |
| `game` | `text` not null | added | the symbol, one of the twelve; the engine and the lines come from the registry |
| `token` | `text` not null | added | the launch token the round was opened with; the hub restores a lapsed session only for the round's own token, so a repeat must carry it (R19, R10) |
| `spin_key` | `text` not null | added | the browser's key; `unique (token, spin_key)` makes the first insert the owner and a repeat find the round (R9) |
| `bet_cents` | `integer` not null, check `bet_cents between 10 and 1000` | added | whole cents on the ladder 0.10 to 10.00 (R8) |
| `result` | `jsonb` null | added | the engine's round as drawn, opaque per game (shapes differ by game); null after a definite refusal of the bet, so a refused spin keeps no drawn outcome (R6) |
| `win_cents` | `integer` not null default 0 | added | the whole win of the round in cents; the contract caps `amountCents` at 1 000 000 000, below 2^31 - 1, and the worst documented round is 10 000 times a 10.00 bet = 10 000 000. `integer` rather than `bigint` because `pg` returns `bigint` as a string, which would reach the browser and the signed `win` body as `"4550"` (R12, R13) |
| `status` | `text` not null, check in (`bet_pending`, `win_pending`, `settled`, `refused`, `parked`) | added | `bet_pending`: saved, bet not yet accepted; `win_pending`: bet accepted, win owed; `settled`: nothing owed; `refused`: bet refused for good; `parked`: win `CONFLICT` or `BAD_REQUEST`, for an operator (R10, R11) |
| `refusal_code` | `text` null | added | the hub's code of a refused bet (`INSUFFICIENT_FUNDS`, `LIMIT_EXCEEDED`, `REFUSED`, `CONFLICT`, `BAD_REQUEST`, `SESSION_NOT_FOUND`, `UNAUTHORIZED`, `FORBIDDEN`, `NOT_FOUND`), so a repeated key returns the same refusal (R9) |
| `created_at` | `timestamptz` not null default `now()` | added | the age shown by `/healthz` |
| `updated_at` | `timestamptz` not null default `now()` | added | last transition |

Added by migration `002_round_retry.sql` (T005):

| Field | Type | Status | Comment |
|---|---|---|---|
| `attempts` | `integer` not null default 0 | added | failed attempts of the current leg; drives the pause and the alert after the fifth (R10) |
| `next_attempt_at` | `timestamptz` null | added | when the sweeper may repeat the leg; null when nothing is owed. A spin request inserts a `bet_pending` round with `now() + 8 s + margin`, so the sweeper never races the live request; the sweeper claims a due round by pushing this forward by a lease in a short transaction (`FOR UPDATE SKIP LOCKED`), calls the hub outside any transaction, then writes the outcome `WHERE status = <claimed status>` (R10, R11) |
| `last_error` | `text` null | added | the last code the hub or the network gave, for the operator |

Index `rounds_due_idx` on `(next_attempt_at)` where `status in ('bet_pending', 'win_pending')`: the sweeper reads due rounds with `FOR UPDATE SKIP LOCKED` inside its short claiming transaction. The `/healthz` aggregates are cast to `int` in SQL (`count(*)` and `extract(epoch …)` come back from `pg` as strings).

No expiry job exists: rounds are kept for good (R17).

## Deferred / out of scope

- A `players` table or a player id: the hub gives none, and the token is the only credential.
- Partitioning or archiving of old rounds: volume is not known; revisit at deploy sizing.
- A per-round audit log of every hub attempt: `attempts` and `last_error` are enough for the alert.
- A column for a rollback: no rollback exists (origin).

## Other tables — unchanged

- `pgmigrations` (the migration runner's own table): created by `node-pg-migrate`, not touched by hand.
