# Spec review — own-slots-or-free-pragmatic

Reviewed: 2026-11-06 (second run, after the origin's amendments A1 `6907e0ad` and A2 `d2f3116d` were applied) · `plan.md`, `tasks.md`, `test-cases.md`, `ui-contract.md`, `flow-overview.md`, `db-model-diff.md`, `api-endpoints-diff.md`, `context/index.md`, `context/grilling.md`, `context/recon.md`, `from-origin/SOURCE.md`, `from-origin/feature.md`, `from-origin/contract.openapi.yaml`, `from-origin/flow-overview.md`, `from-origin/context/{index,request,author-qa,grilling}.md`, the previous `spec-review.md`. No `context/design/` (no frames: Axis 6 has nothing to walk).
Read: `check_traceability.py` (exit 0, no lines); CodeGraph on Casino-Game-Aggregator — `Spins::money` (`crates/engine/src/spin.rs:462-495`: the wallet lock is taken before anything else, also for a repeat of an already booked transaction), `Guard::lock_wallet` (`crates/cache/src/guard.rs:86-124`: waits for the lock up to `LOCK_WAIT_MS` with 25-200 ms polls before answering "not taken"), `crates/cache/src/guard.rs:21,24` (`LOCK_TTL_MS = 30_000`, `LOCK_WAIT_MS = 8_000`); `~/.claude/ARCHITECTURE.md` §External effects (saga: "the entity's status is what survives a crash in the middle"); Inkwell `ef798196` (slots-server half decision), `a4ebefac`, `3a27b01c`. Carried from the first run: `stellar-sevens/src/game/main.ts:77-78`, `wallet.ts:81-95`, Context7 `/websites/node-postgres` (types).
Findings: 8 design · 4 mechanical (carried: SR2, SR3, SR4, SR8, SR9, SR10 answered by the user; the fixed mechanical SR1, SR5, SR6, SR7 are not carried; new: SR11-SR16)

## Fitness

| decision or state | profile | verdict |
|---|---|---|
| Round store: Postgres `rounds`, no expiry | permanent; one row per spin, ~1-2 KB `result` jsonb; written 2-4 times per round, read by `(token, spin_key)` on a repeat and by due time in the sweeper; loss = an unpaid or double-paid round | fits |
| `win_cents integer`, health counts cast in SQL | integer up to 10 000 000 per worst round, contract cap 1 000 000 000 | fits (SR5 fixed) |
| `bet_outcome_unknown` flag | sticky boolean per round, written after an attempt ends with `INTERNAL`, a timeout or a transport error; read on every 401/403/404 to a bet; loss = a possibly debited round ended `refused` | SR14 |
| Retry state on the round row + in-process sweeper over `rounds_due_idx`, lease claim | lifetime seconds to hours; a handful of rows at a time; range scan by due time on a partial index; each leg at most once in flight across replicas and the live request; duplicate absorbed by the hub's transaction-id idempotency but costs a hub-side lock wait | SR12, SR13 |
| Live spin waits on the bet (`HUB_CALL_TIMEOUT_MS` 8 000, `BUSY` repeated inside the budget) | per request; the hub itself waits up to 8 000 ms for the player's wallet lock before it answers `BUSY` | SR11 |
| Launch token stored in clear in `rounds` | 24 h credential kept beside its round; read by the sweeper | fits (settled with user, origin Q23) |
| Spin identity `unique (token, spin_key)`, server-minted UUID round id | by key, insert-once | fits |
| Spin key and bet in `sessionStorage` per game and token | tab lifetime; cleared on a definite answer | fits (settled with user, Q6, Q20) — the clear list: SR16 |
| Launch token in the address and `sessionStorage`, sent as Bearer | page lifetime; third-party frame | fits |
| Shown balance in the window, refreshed by a session call before a local refusal | refreshed by every answer and by SPIN under the bet | fits (settled with user, Q19) |
| Hub wire types by `openapi-typescript` with `--check` | regenerated on contract change | fits (settled with user, Q9) |
| Registry `symbol`/`name`/`identity` compared with `x-catalog.games` | twelve constant rows, build and test time | fits |
| Engines imported in place, bundled by esbuild | build-time dependency on the twelve folders | fits (settled with user, Q10) |
| Secure random adapter over `crypto.getRandomValues` | per draw, 32-bit granularity | fits |
| Integer cents arithmetic | at most ≈ 5e8 inside 2^53 | fits |
| Alert as error log lines `bet_pending_alert` / `win_pending_alert` + `/healthz` | per attempt after the fifth | fits (settled with user, Q15, Q21) |
| Deposit message to target origin `*` | one data-less message per DEPOSIT press; the receiver checks `event.source` and `event.origin` | fits (contract `x-game-window-messages.deposit`) |
| Tile upload by a gRPC script over a vendored proto, by hub identity | once per deploy, twelve calls | fits |
| Migrations by `npm run migrate` before start | per deploy | fits |
| `client-kit/` shared browser module | build only | fits (settled with user, Q11) |
| Stub hub tokens | test and development only; must behave like the hub where a test relies on it | SR11, SR15 |

## Findings

### SR2. A bet answered 401, 403 or 404 maps to `unavailable` with no round status and no rule for the stored key
- **Axis:** flow
- **Kind:** design
- **Where:** `api-endpoints-diff.md` `POST /api/game/spin`; `plan.md` FR9, FR12; `tasks.md` T007 Cases; `ui-contract.md` S11
- **Evidence:** contract §Forbidden, §NotFound (first run)
- **Consequence:** a bet debited hours after the player was told the game was unavailable, or an orphan `bet_pending` row
- **Recommendation:** list every exit of the spin handler per hub answer
- **Alternatives:** keep them swept; or end the round `refused`
- **Status:** → user: A (Q16) — 401/403/404 on a bet end the round `refused`, answer `unavailable`, the window clears its key; a repeat of a `parked` round answers with `creditPending`; FR29, FR10, Decisions, contract amendment A3 (accepted by the origin as A1 `6907e0ad`, with the unknown-outcome exception now FR31)

### SR3. `FOR UPDATE SKIP LOCKED` only keeps two sweepers apart while a transaction stays open across the hub call
- **Axis:** canon
- **Kind:** design
- **Where:** `plan.md` §Decisions "Retry of unfinished legs"; `db-model-diff.md` `next_attempt_at`; `tasks.md` T005
- **Evidence:** `~/.claude/ARCHITECTURE.md` §External effects (first run)
- **Consequence:** two replicas send one leg, or a transaction pins a connection for 8 s
- **Recommendation:** lease claim in a short transaction, call outside, conditional write
- **Alternatives:** keep the transaction open across the call
- **Status:** → user: A (Q17) — lease claim in a short transaction, hub call outside it, conditional write; FR30, Decisions, T005 cases

### SR4. The hub answers `BUSY` to any concurrent call of the same player, and the live spin has no rule for it
- **Axis:** flow
- **Kind:** design
- **Where:** `plan.md` FR12; `ui-contract.md` F6
- **Evidence:** `Casino-Game-Aggregator/crates/engine/src/spin.rs:468-477` (first run)
- **Consequence:** routine false "busy" messages
- **Recommendation:** repeat `BUSY` inside the 8 s budget
- **Alternatives:** answer `busy` at once
- **Status:** → user: A (Q18) — the spin request repeats `BUSY` inside its 8 s budget; FR12, F6, Decisions, `tok-busy-once`, TC. Reopened on a new fact as SR11

### SR8. The window blocks SPIN on its own stale balance, so after a deposit elsewhere it keeps saying NOT ENOUGH FUNDS
- **Axis:** ui behavior
- **Kind:** design
- **Where:** `ui-contract.md` S6, L3; `plan.md` FR23
- **Evidence:** `stellar-sevens/src/game/main.ts:77-78` (first run)
- **Consequence:** SPIN refused locally forever after a deposit in another tab
- **Recommendation:** ask the session before refusing
- **Alternatives:** drop the client check
- **Status:** → user: A (Q19) — the window asks the session first and refuses only on the fresh balance; FR23, S6, L3, Decisions, TC43

### SR9. A kept spin is replayed with its stored bet while the bet controls stay free, so the window can show one bet and charge another
- **Axis:** ui behavior
- **Kind:** design
- **Where:** `plan.md` FR26; `ui-contract.md` S8, S9, L6
- **Evidence:** FR26 and L6 (first run)
- **Consequence:** the HUD reads 5.00 while 1.00 is charged
- **Recommendation:** show the stored bet and lock the controls
- **Alternatives:** free controls, stored bet shown only in the replayed round
- **Status:** → user: A (Q20) — the stored bet is shown and the bet controls are locked until a definite answer; FR26, S8, S9, L6, Decisions, TC44

### SR10. A bet stuck with an unknown outcome raises no alert
- **Axis:** flow
- **Kind:** design
- **Where:** `plan.md` FR15, §Decisions "Alert"
- **Evidence:** contract §Retry `INTERNAL` (first run)
- **Consequence:** possibly debited players with no error line
- **Recommendation:** `bet_pending_alert` after the fifth failure
- **Alternatives:** `/healthz` only
- **Status:** → user: A (Q21) — `bet_pending_alert` for the bet leg; FR15, Decisions, TC42

### SR11. The hub waits up to 8 s for the wallet lock before it answers `BUSY`, the same 8 s the game server waits for the call, so a collision ends as a timeout and marks the bet's outcome unknown
- **Axis:** flow
- **Kind:** design
- **Where:** `plan.md` §Decisions "Wait for the bet" ("the hub answers `BUSY` to any second call of the same player"), FR12, FR31; `api-endpoints-diff.md` §Settings `HUB_CALL_TIMEOUT_MS` (8000), stub token `tok-busy-once` ("the first bet call of a round answers `503 BUSY`"); `db-model-diff.md` `bet_outcome_unknown`; `ui-contract.md` F6; `test-cases.md` TC41 ("ответ приходит с исходом примерно через секунду")
- **Evidence:** `Spins::money` takes the wallet lock before it looks at the transaction id (`crates/engine/src/spin.rs:468-477`), and `Guard::lock_wallet` does not refuse at once: it polls every 25-200 ms until `LOCK_WAIT_MS = 8_000` has passed and only then returns "not taken", which `money` turns into `BUSY` (`crates/cache/src/guard.rs:24,96-119`). The first run and Q18 had only `spin.rs`; the wait is a fact absent from `context/`.
- **Consequence:** example — the player has a win being retried by the sweeper, or a second window spinning, and that call holds the wallet for longer than a moment (the platform's wallet is slow). The live bet queues at the hub; at 8 s the game server's per-call timeout fires first (or together with the hub's `BUSY`), so the attempt counts as a timeout: `bet_outcome_unknown` is set although nothing moved, and from then on a 401/403/404 never ends that round (FR31) — it is repeated with `bet_pending_alert` until the configuration is fixed. The in-request `BUSY` loop of Q18 (0.2 s growing to 1 s) never runs against the real hub: a `BUSY` arrives only after 8 s, when the budget is gone. When the holder finishes within 8 s the hub simply serialises the two calls, so F6's "the second spin waits a moment" holds, but because of the hub's wait, not the loop. `tok-busy-once` answers `BUSY` at once, so T005's case and TC41 pass on behavior the hub does not have.
- **Recommendation:** decide the per-call timeout against the hub's 8 s lock wait and record it in §Decisions with the hub's `LOCK_WAIT_MS` as the reason; make `tok-busy-once` answer `BUSY` after a configurable lock wait (8 s by default) so the tests see the hub's timing; restate F6 and TC41 accordingly.
- **Alternatives:** (A) per-call timeout above the hub's wait (for example 10 s) with the browser budget raised to match — a hub `BUSY` is then seen as "nothing moved" and the flag stays correct, at the cost of a spin answer that can take ~10 s on a collision; (B) keep 8 s, drop the in-request `BUSY` loop as unreachable, and accept that a collision longer than 8 s counts as an unknown outcome — shorter waits, but a hub configuration fault after such a collision keeps the round open with an alert instead of ending it.
- **Status:** → user: A (Q22) — `HUB_CALL_TIMEOUT_MS` and the bet budget are 10 s, longer than the hub's 8 s wait for a busy wallet; `tok-busy-once` answers `BUSY` after a configurable lock wait (8 s); FR12, Decisions "Wait for the bet", F6, TC

### SR12. A spin request can outlive its 8 s guard and the lease has no length, so the sweeper repeats a leg the live request is still making
- **Axis:** flow
- **Kind:** mechanical
- **Where:** `plan.md` FR30 ("a round saved by a spin request SHALL NOT be due before that request's 8 seconds have passed"), §Decisions "Retry of unfinished legs" (`next_attempt_at = now() + 8 s + margin`, `now() + lease`), FR6, FR12; `db-model-diff.md` `next_attempt_at`; `api-endpoints-diff.md` §Settings (no lease setting); `tasks.md` T005 Cases
- **Evidence:** the bet may be accepted near the end of the 8 s budget, and FR6 then makes the win call in the same request with its own `HUB_CALL_TIMEOUT_MS` (8 000), so the request lives up to ~16 s; an in-budget bet attempt started at 7.5 s also runs to 15.5 s unless it is cut to the remaining budget, which nothing states. The only due time the live request sets is the one at insert. The lease length appears nowhere, and no row says it must exceed the per-call timeout.
- **Consequence:** the sweeper claims the round at 8 s + margin and sends the win (or the bet) while the live request still waits on the same leg; the hub serialises them on the wallet lock (SR11), the live request may time out and answer `creditPending` for a win that is being credited, `attempts` is counted twice, and FR30's "no two callers repeat one leg" fails. A lease shorter than the call timeout lets a second replica reclaim a round whose call is still in flight.
- **Recommendation:** cut every in-request attempt to the remaining budget; before each hub call the live request makes (each bet attempt and the win), set `next_attempt_at = now() + HUB_CALL_TIMEOUT_MS + margin` in the same write that records the leg; make the lease a named setting `SWEEP_LEASE_MS` that defaults to `HUB_CALL_TIMEOUT_MS` + margin and is refused at start when it is not larger; add T005 cases "a bet accepted at 7 s keeps the round not due until its win call has ended" and "a lease shorter than the call timeout fails the start".
- **Status:** fixed: an attempt is cut to the remaining budget, the request moves `next_attempt_at` to `now() + SWEEP_LEASE_MS` before each hub call, `SWEEP_LEASE_MS` defaults to the call timeout + 2 s and the start fails when it is not larger; FR30, Decisions, db-model-diff, T005 cases

### SR13. A repeated key that finds its round `bet_pending` calls the hub without taking the lease, so it races the sweeper and the first request
- **Axis:** flow
- **Kind:** design
- **Where:** `plan.md` §Decisions "One request in flight per key" ("a repeat of the key that finds a round still `bet_pending` takes the round over from the stored state"), FR10, FR30; `tasks.md` T004 Cases ("two requests with one key at once make one round"); `test-cases.md` TC17 step 3, TC38 step 2
- **Evidence:** FR30 claims only the sweeper's calls by lease; the takeover path writes no `next_attempt_at` and checks none. "Two requests with one key at once" means the second finds the row the first has just inserted and is still betting on.
- **Consequence:** a double-click or a client retry sends the same bet twice at once; a SPIN pressed after `busy` sends it while the sweeper holds the lease on the round. The hub absorbs the money by transaction id, but the second call queues on the wallet lock for up to 8 s (SR11) and can time out, setting `bet_outcome_unknown` on a bet whose only uncertainty was our own duplicate; both callers write `attempts` and `last_error`.
- **Recommendation:** route the takeover through the same claim as the sweeper (`UPDATE … SET next_attempt_at = now() + lease WHERE id = $1 AND status = 'bet_pending' AND next_attempt_at <= now()`), and state what a repeat answers when the claim fails; add a T004 case.
- **Alternatives:** (A) claim by lease and, when the lease is held, wait for the holder's outcome up to the 8 s budget and answer it or `busy` — the player sees the round as soon as it lands, one more wait loop; (B) a repeat never calls the hub for a `bet_pending` round and answers `busy` until the sweeper settles it — one caller only and less code, but after a `busy` the player waits for the sweeper's next attempt (5 s, then 10 s, 20 s …) instead of the press of SPIN.
- **Status:** → user: A (Q23) — a repeated key that finds the round `bet_pending` takes the same lease, makes the call itself when it is free, waits for the holder's outcome up to the budget when it is held; FR30, Decisions "One request in flight per key", T004 and T005 cases, TC

### SR14. `bet_outcome_unknown` is written only after a failure is seen, so a restart in the middle of a bet call loses it and a later 403 ends a possibly debited round
- **Axis:** canon
- **Kind:** mechanical
- **Where:** `db-model-diff.md` `bet_outcome_unknown` ("set when an attempt of the bet ended with `INTERNAL`, a timeout or a transport error"); `plan.md` FR29, FR31, §Decisions "A bet refused for good by the hub's configuration"; `tasks.md` T004 and T005 Cases
- **Evidence:** `~/.claude/ARCHITECTURE.md` §External effects, saga: "the entity's status is what survives a crash in the middle". The round row is written before the call (`bet_pending`) and the flag after the answer; a process killed between the two — a rolling deploy's SIGTERM, an OOM — leaves `bet_pending` with the flag false although the hub may have debited the bet.
- **Consequence:** the hub debits 1.00, the replica is restarted before the answer is read, meanwhile DevOps rotates the secret wrongly; the sweeper's repeat gets 401, sees no unknown outcome, ends the round `refused` and never repeats it — the player is charged for a round that is never paid or shown, the exact case FR31 exists to stop.
- **Recommendation:** record each bet attempt before it leaves, not after: a counter `bet_sends` incremented in the write that precedes the call (with the due time of SR12), and each "nothing moved" answer (`BUSY`) recorded after it; a 401, 403 or 404 ends the round only when every earlier send has a recorded "nothing moved" answer. Replace the flag in `db-model-diff.md`, FR31's wording ("an earlier attempt ended with an unknown outcome or was never answered") and add a T005 case "a round left `bet_pending` with a send and no recorded answer is not ended by a 403".
- **Status:** fixed: counters `bet_sends` (written before the call leaves) and `bet_busy_answers` replace `bet_outcome_unknown`; a 401/403/404 ends the round only when every earlier send was answered "nothing moved"; FR29, FR31, db-model-diff, T004 and T005 cases

### SR15. TC17 uses `tok-slow`, whose every bet answers after 12 s, so the repeated key never returns the round it expects
- **Axis:** completeness
- **Kind:** mechanical
- **Where:** `test-cases.md` TC17 (precondition `tok-slow`, step 3 "через 15 секунд отправить тот же ключ", expected "второй ответ содержит раунд"); `api-endpoints-diff.md` stub token `tok-slow` ("the bet answers after 12 seconds"); §Settings `HUB_CALL_TIMEOUT_MS` (8000)
- **Evidence:** every bet call of `tok-slow`, repeats included, outlasts the 8 s call timeout, so the sweeper's attempts and the repeated key's attempt all time out; nothing ever records the bet as accepted.
- **Consequence:** the second answer is again `busy` and TC17 fails on a correct server (or passes only if the stub is quietly made faster than its definition).
- **Recommendation:** define `tok-slow` as "the first bet call of a transaction answers after 12 s; a repeat of a transaction the stub has already booked answers at once" (the hub's idempotent answer), or give TC17 its own token with that behavior; keep TC7 and TC36 on the first-call delay.
- **Status:** fixed: `tok-slow` answers the first call of a transaction after 12 s and a repeat of a booked transaction at once

### SR16. T007's Cases list the answers that clear the stored key without `unavailable`
- **Axis:** completeness
- **Kind:** mechanical
- **Where:** `tasks.md` T007 Cases ("the stored key is cleared by `ok`, `insufficient_funds`, `bet_refused` and `session_expired` and kept by a lost connection and by `busy`"); `plan.md` FR28 ("a `bet_refused` or `unavailable` answer clearing it"); `ui-contract.md` S11
- **Evidence:** FR28 and S11 clear the key on `unavailable` (Q16); the case list a test is written from omits it, so a kit that keeps the key on `unavailable` passes the listed cases.
- **Consequence:** after a configuration fault the window keeps replaying a key whose round is `refused`, each SPIN answering `unavailable` with the bet controls locked (FR26) until the tab is closed.
- **Recommendation:** add `unavailable` to the clearing answers in T007's Cases.
- **Status:** fixed: `unavailable` added to the answers that clear the stored key in T007's Cases
