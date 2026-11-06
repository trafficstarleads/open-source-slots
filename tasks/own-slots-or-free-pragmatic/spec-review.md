# Spec review — own-slots-or-free-pragmatic

Reviewed: 2026-11-06 · `plan.md`, `tasks.md`, `test-cases.md`, `ui-contract.md`, `flow-overview.md`, `db-model-diff.md`, `api-endpoints-diff.md`, `context/index.md`, `context/grilling.md`, `context/recon.md`, `from-origin/SOURCE.md`, `from-origin/feature.md`, `from-origin/contract.openapi.yaml`, `from-origin/flow-overview.md`, `from-origin/context/{index,request,author-qa,grilling}.md`; origin `feedback/slots-server.md` and origin `plan.md` (R19 line, Decisions "Session older than 24 hours")
Read: `check_traceability.py` (exit 0, no lines); CodeGraph on Casino-Game-Aggregator — `Spins::money` (`crates/engine/src/spin.rs:462-495`, per-wallet lock, `HubError::Busy` when held); slots-server `stellar-sevens/src/game/main.ts:77-78` (client-side low-balance check), `stellar-sevens/src/game/wallet.ts:81-95` (3 attempts, 700 ms); importers of each game's `wallet.ts` (only `main.ts` and `hud.ts`, all inside the items' Files); Inkwell `a4ebefac` (own slots decision), `3a27b01c` (casino-platform hub); Context7 `/websites/node-postgres` (features/types: types without a registered parser come back as strings)
Findings: 6 design · 4 mechanical

## Fitness

| decision or state | profile | verdict |
|---|---|---|
| Round store: Postgres `rounds`, no expiry | permanent; one row per spin, grows with play (~1-2 KB `result` jsonb each); written 2-4 times per round (insert, bet outcome, win outcome), read by `(token, spin_key)` on a repeat and by due time in the sweeper; single writer per row at a time needed; loss = an unpaid or double-paid round | fits |
| `win_cents bigint`, health counts | integer up to 10 000 000 per worst round, contract cap 1 000 000 000; read back by `pg` into the spin answer and `/healthz` | SR5 |
| Retry state on the round row + in-process sweeper over `rounds_due_idx` | lifetime seconds to hours; volume = rounds owing a leg, a handful at a time; access by due time, range scan on a partial index; must run each leg at most once concurrently across replicas; a duplicate is absorbed by the hub's transaction-id idempotency, a loss = a win never credited | SR3 |
| Hold-and-wait of the live spin on the hub (`HUB_CALL_TIMEOUT_MS` 8 000) | per request; the hub's per-wallet lock turns any concurrent call of the same player into `BUSY` | SR4 |
| Launch token stored in clear in `rounds` | 24 h credential, kept forever beside its round; read by the sweeper to repeat a leg | fits (settled with user, origin Q23) |
| Spin identity `unique (token, spin_key)`, server-minted UUID round id | by key, insert-once; protects other players' rounds at the hub | fits |
| Spin key and bet in `sessionStorage` per game and token | tab lifetime; one entry; written on SPIN, cleared on a definite answer; loss = an unseen but paid round | fits (settled with user, Q6) — the bet it carries: SR9 |
| Launch token in the address and `sessionStorage`, sent as Bearer | page lifetime; third-party frame, cookies partitioned | fits |
| Shown balance in the window | refreshed only by a server answer; drives the client-side low-balance block | SR8 |
| Hub wire types by `openapi-typescript` with `--check` | regenerated on contract change | fits (settled with user, Q9) |
| Engines imported in place, bundled by esbuild | build-time dependency on the twelve folders | fits (settled with user, Q10) |
| Secure random adapter over `crypto.getRandomValues` | per draw, 32-bit granularity | fits |
| Integer cents arithmetic | `betCents * units * 2 + LINES` at most 1000 × 250 000 × 2 ≈ 5e8, well inside 2^53 | fits |
| Alert as an error log line + `/healthz` | per attempt after the fifth, win leg only | SR10 |
| Tile upload by a gRPC script over a vendored proto | once per deploy, twelve calls | fits |
| Migrations by `npm run migrate` before start | per deploy | fits |
| `client-kit/` shared browser module | imported by twelve independent Vite projects from outside their roots; build only | fits (settled with user, Q11) |

## Findings

### SR1. A bet refused `SESSION_NOT_FOUND` has no round status, so it is either swept forever or the test accepts both outcomes
- **Axis:** flow
- **Kind:** mechanical
- **Where:** `plan.md` FR3, FR9, §Decisions "Round flow"; `db-model-diff.md` `status`; `test-cases.md` TC4 expected result; `tasks.md` T004 Cases
- **Evidence:** the round is inserted `bet_pending` before the bet (`flow-overview.md` Flow 2). FR9 lists `LIMIT_EXCEEDED`, `REFUSED`, `CONFLICT`, `BAD_REQUEST` as final; FR12 lists `BUSY`, `INTERNAL`, no answer as repeated; `SESSION_NOT_FOUND` on a bet is in neither. The origin's R19 line (origin `plan.md:29`) says the hub answers `SESSION_NOT_FOUND` to a call naming a round it does not hold and starts no round: nothing moved, final. TC4 expects "no new round (or a round `refused` with empty `result`)".
- **Consequence:** if the row stays `bet_pending`, the sweeper repeats the bet at 5 s doubling to 1 h forever, each time answered `SESSION_NOT_FOUND`, with no alert (FR15 is win-only) and a permanent `waitingBet` in `/healthz`. The same happens to a swept bet whose 24 h session lapsed while the hub was down.
- **Recommendation:** `SESSION_NOT_FOUND` on a bet (live or swept) marks the round `refused`, `refusal_code` = `SESSION_NOT_FOUND`, `result` null, answers `session_expired`; a repeated key returns `session_expired`. Add it to T004 Cases and make TC4's expected result the single outcome "one row, `refused`, empty `result`".
- **Status:** fixed: FR3 and T004 end a bet refused `SESSION_NOT_FOUND` as `refused`, `db-model-diff.md` lists the code, TC4 expects the single outcome

### SR2. A bet answered 401, 403 or 404 maps to `unavailable` with no round status and no rule for the stored key
- **Axis:** flow
- **Kind:** design
- **Where:** `api-endpoints-diff.md` `POST /api/game/spin` (`503 unavailable`); `plan.md` FR9, FR12; `tasks.md` T007 Cases ("cleared by `ok`, `insufficient_funds`, `bet_refused` and `session_expired` and kept by a lost connection and by `busy`"); `ui-contract.md` S11 "SPIN asks again"; `plan.md` §Decisions "One request in flight per key" (repeat answers `settled`, `win_pending`, `refused` — `parked` missing)
- **Evidence:** the contract says 403 and 404 are "a configuration fault, so the call is retried later and not abandoned", and nothing moved (`from-origin/contract.openapi.yaml` §Forbidden, §NotFound); `UNAUTHORIZED` also moves nothing. The spin handler's exits for these three codes, and the window's handling of `unavailable`, are not listed anywhere.
- **Consequence:** two readings, both shipped by accident. (a) The row stays `bet_pending` and is swept: once DevOps fixes `allowIps` or the secret hours later, the sweeper debits a round the player was told was not available — and if the window cleared the key, the player already spun new rounds and never sees that one. (b) The row is left `bet_pending` but the sweeper does not pick it up: an orphan counted in `/healthz` forever. Separately, a repeat of a key whose round is `parked` has no defined answer.
- **Recommendation:** list every exit of the spin handler per hub answer (200, each 422 code, 401, 403, 404, 503 BUSY/INTERNAL, timeout) with the round status, the browser code and whether the window keeps the key; add the `parked` repeat (outcome with `creditPending`).
- **Alternatives:** keep 401/403/404 `bet_pending` and swept (contract-literal, "not abandoned"), with the window keeping the key on `unavailable` so the player sees the round when it lands — the player may be charged long after the error message; or treat them as final for the round (`refused`, nothing moved) and the window clears the key — no late debit, at the cost of departing from the contract's "retried later" for the bet leg, which then needs contract feedback.
- **Status:** → user: A (Q16) — 401/403/404 on a bet end the round `refused`, answer `unavailable`, the window clears its key; a repeat of a `parked` round answers with `creditPending`; FR29, FR10, Decisions, contract amendment A3

### SR3. `FOR UPDATE SKIP LOCKED` only keeps two sweepers apart while a transaction stays open across the hub call
- **Axis:** canon
- **Kind:** design
- **Where:** `plan.md` §Decisions "Retry of unfinished legs" ("`SKIP LOCKED` keeps several replicas from repeating one call"); `db-model-diff.md` `next_attempt_at` ("null when nothing is owed"), `rounds_due_idx`; `tasks.md` T005 Cases ("two sweepers at once make one hub call for one due round")
- **Evidence:** a row lock from `SELECT … FOR UPDATE SKIP LOCKED` lasts until its transaction ends. To exclude a second replica during the hub call, the transaction must stay open for up to `HUB_CALL_TIMEOUT_MS` (8 s) — the external call inside the transaction that `~/.claude/ARCHITECTURE.md` §External effects rules out ("irreversible calls therefore run outside the transaction"; saga: commit pending, call, commit outcome), and it pins one pool connection per in-flight leg. The plan does not say when `next_attempt_at` is first set for a `bet_pending` row, nor that the live spin and the sweeper guard their status writes.
- **Consequence:** if the lock is released before the call, two replicas send the same leg; if `next_attempt_at` is set to now at insert, the sweeper fires the bet while the live request still waits on it — the hub's per-wallet lock answers one of them `BUSY` (SR4), so the player gets `busy` for a bet that is going through. A sweeper writing `bet_pending` + `attempts + 1` after the live request wrote `settled` reverts the round and repeats both legs (absorbed by idempotency, but `/healthz` and the alert count it).
- **Recommendation:** claim by lease in a short transaction — `UPDATE rounds SET next_attempt_at = now() + lease WHERE id IN (SELECT id … FOR UPDATE SKIP LOCKED LIMIT n) RETURNING …`, commit, call the hub, then write the outcome with `WHERE status = <expected>`; insert a `bet_pending` row with `next_attempt_at = now() + HUB_CALL_TIMEOUT_MS + margin`. Record it as a `## Decisions` row and a T005 case.
- **Alternatives:** keep the transaction open across the call — simplest, but against the canon and one connection held per leg for up to 8 s.
- **Status:** → user: A (Q17) — lease claim in a short transaction, hub call outside it, conditional write; FR30, Decisions, T005 cases

### SR4. The hub answers `BUSY` to any concurrent call of the same player, and the live spin has no rule for it
- **Axis:** flow
- **Kind:** design
- **Where:** `plan.md` FR12 ("answer the browser `busy` after 8 seconds"); `ui-contract.md` F6 ("two windows with one token can both spin")
- **Evidence:** `Spins::money` takes `lock_wallet(operator, player, currency)` and returns `HubError::Busy` when it is held (`Casino-Game-Aggregator/crates/engine/src/spin.rs:468-477`). So a sweeper repeating a pending win of that player, a second window, or a repeated key taking over a `bet_pending` round all collide with a live spin. FR12 does not say whether a `BUSY` answer is retried inside the 8 s window or answered at once.
- **Consequence:** answered at once, a player with one stuck win (retried every few seconds at first) or two windows open gets THE CASINO IS BUSY on ordinary spins, and every such spin turns into a swept bet. F6 promises both windows spin.
- **Recommendation:** decide and state in FR12 that the live request repeats `BUSY` with a short pause inside its 8 s budget before answering `busy`; correct F6 to what the player sees on a collision; add a stub token that answers the first bet `BUSY` and a T004/T005 case for it.
- **Alternatives:** answer `busy` at once and rely on the player pressing SPIN again — less code, routine false "busy" messages.
- **Status:** → user: A (Q18) — the spin request repeats `BUSY` inside its 8 s budget; FR12, F6, Decisions, `tok-busy-once`, TC

### SR5. `win_cents bigint` and the `/healthz` counts come back from `pg` as strings
- **Axis:** repo fit
- **Kind:** mechanical
- **Where:** `db-model-diff.md` `win_cents bigint`; `api-endpoints-diff.md` `GET /healthz` `{waitingBet, waitingWin, parked, oldestWaitingSeconds}`; `plan.md` §Decisions "Stack" (`pg` with plain SQL)
- **Evidence:** node-postgres returns a type with no registered parser as a JavaScript string (Context7 `/websites/node-postgres`, features/types "strings by default"); `int8` (`bigint`, `count(*)`) and `numeric` (`extract(epoch …)`) have none by default.
- **Consequence:** a repeated key answers `winCents: "4550"`, the window adds a string to the balance, and the sweeper's win body carries `"amountCents": "4550"`, which the contract's `integer` refuses as `BAD_REQUEST` — parking the round. `/healthz` returns string counts.
- **Recommendation:** make `win_cents` `integer` (the contract caps `amountCents` at 1 000 000 000, below 2^31 − 1), and cast the health aggregates to `int` in SQL; add a case "a repeated winning key answers `winCents` as a number".
- **Status:** fixed: `win_cents` is `integer`, the `/healthz` counts are cast in SQL, T004 and T005 cases

### SR6. TC26 uses `tok-slow`, whose bet answers after 12 s, so the window gets `busy` and never shows the outcome it expects
- **Axis:** completeness
- **Kind:** mechanical
- **Where:** `test-cases.md` TC26 (precondition `tok-slow`); `api-endpoints-diff.md` stub token `tok-slow` ("the bet answers after 12 seconds"); `plan.md` FR12 (8 s)
- **Evidence:** at 8 s the server answers `busy` (FR12, TC17 relies on exactly this), so TC26's "after the answer the balance shows the remainder after the bet" never happens.
- **Recommendation:** add a stub token whose bet answers after about 3 s (below 8 s) and use it in TC26, or use `tok-rich` and check the order in the network panel.
- **Status:** fixed: stub token `tok-medium` (bet after 3 s) added, the TC for FR20 uses it

### SR7. The Verify walks of T007-T011 open `/host/<symbol>` without building the bundles the game server serves
- **Axis:** completeness
- **Kind:** mechanical
- **Where:** `tasks.md` T007-T011 `**Verify:**` lines ("run `npm --prefix server run dev:stub` → open `http://localhost:9100/host/<symbol>…`"); T012 Verify (does run `build:games` first)
- **Evidence:** the game server serves `/play/<symbol>` from `PUBLIC_DIR`, built by `server/scripts/build-games.mjs` (`plan.md` §Decisions "Static serving"; `api-endpoints-diff.md` `GET /play/{symbol}`).
- **Consequence:** the walk shows a 404 frame, or a bundle built before the item's changes, and passes or fails on stale code.
- **Recommendation:** start each first Verify line of T007-T011 with `npm --prefix server run build:games`.
- **Status:** fixed: the first Verify line of T007-T011 starts with `npm --prefix server run build:games -- <symbol>`

### SR8. The window blocks SPIN on its own stale balance, so after a deposit elsewhere it keeps saying NOT ENOUGH FUNDS
- **Axis:** ui behavior
- **Kind:** design
- **Where:** `ui-contract.md` S6 ("the meter is below the bet … SPIN works again once the balance covers the bet"), L3 ("a deposit shows at the next answer or reopen"); `plan.md` FR23
- **Evidence:** today's check is client-side, `if (hud.balance < bet)` before any request (`stellar-sevens/src/game/main.ts:77-78`); the shown balance changes only on a server answer (L3).
- **Consequence:** a player at 0.05 deposits in another tab (or wins in a second window, F6) and comes back: the window still shows 0.05, refuses every SPIN locally and sends nothing, so no answer ever refreshes the meter — S6's "SPIN works again" never happens without reopening the game.
- **Recommendation:** when the shown balance is below the bet, ask `GET /api/game/session` first and refuse only on the fresh balance; state it in S6, L3 and FR23's case list.
- **Alternatives:** drop the client check and send the spin, letting the hub's `INSUFFICIENT_FUNDS` drive S6 — one code path, but a drawn and deleted round for every under-funded press.
- **Status:** → user: A (Q19) — the window asks the session first and refuses only on the fresh balance; FR23, S6, L3, Decisions, TC

### SR9. A kept spin is replayed with its stored bet while the bet controls stay free, so the window can show one bet and charge another
- **Axis:** ui behavior
- **Kind:** design
- **Where:** `plan.md` FR26; `tasks.md` T007 Cases ("sent again, with the stored bet even if the bet was changed meanwhile"); `ui-contract.md` S8, S9, L2, L6
- **Evidence:** after S8 or S9 the key and bet stay stored and the next SPIN sends them (FR26), while L6 says the selected bet keeps whatever the player picks and nothing locks the controls in S8/S9.
- **Consequence:** the player gets `busy` at 1.00, raises the bet to 5.00, presses SPIN: the round shown is charged 1.00 while the HUD reads 5.00, and its win figures (from `winCents`) do not match the bet on screen.
- **Recommendation:** while a key is stored, set the HUD bet to the stored bet and block the bet controls until a definite answer; add the case to S8, S9 and L6.
- **Alternatives:** keep the controls free and show the stored bet only for the replayed round — less blocking, a bet that jumps under the player's finger.
- **Status:** → user: A (Q20) — the stored bet is shown and the bet controls are locked until a definite answer; FR26, S8, S9, L6, Decisions, TC

### SR10. A bet stuck with an unknown outcome raises no alert
- **Axis:** flow
- **Kind:** design
- **Where:** `plan.md` FR15, §Decisions "Alert"; `test-cases.md` TC21
- **Evidence:** `INTERNAL` on a bet "means the outcome is unknown" (`from-origin/contract.openapi.yaml` §Retry), so the player may already be debited; FR15 alerts only after the fifth failed **win** call; a `bet_pending` round shows only as `waitingBet` in `/healthz`, which nothing pages on.
- **Consequence:** with the hub returning `INTERNAL` for an hour, players are possibly debited with no outcome shown and no win credited, and no log line at `error` level says so.
- **Recommendation:** log `win_pending_alert` (or a sibling `bet_pending_alert`) for the bet leg too after `ALERT_AFTER_ATTEMPTS`, and add a T005 case.
- **Alternatives:** leave the bet leg to `/healthz` only — acceptable if the deploy's pager watches `waitingBet` and its age.
- **Status:** → user: A (Q21) — `bet_pending_alert` for the bet leg; FR15, Decisions, TC
