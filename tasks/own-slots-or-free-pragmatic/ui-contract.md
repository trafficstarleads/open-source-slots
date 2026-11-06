# UI contract — own-slots-or-free-pragmatic · slots-server

One screen: the game window, the same in all twelve games. It runs in a frame of the casino site, opened by the hub's launch address `{playUrl}/play/{symbol}?token=…&lang=…&lobby=…`. Its calls go to this server's `GET /api/game/session` and `POST /api/game/spin` (`api-endpoints-diff.md`). A status `FRn` is the requirement of `plan.md` that states the row; `settled with user` points to `context/grilling.md`; `proposed` is the spec's recommendation, today's behavior of the game where there is one.

## Game window

### States

| Id | State | Trigger | What the user sees | Status |
|---|---|---|---|---|
| S1 | Opening | the page loads with `?token=` in its address | the loader of the game until the session answer arrives; SPIN cannot be pressed | FR18 |
| S2 | Ready | the session answer arrives | the meter shows the balance the server returned in dollars with two decimals, no DEMO label; SPIN and the bet controls work | FR18 |
| S3 | Spinning | SPIN is pressed | the reels roll at once; SPIN and the bet controls are blocked, another press only hurries the reels; once the server accepts the bet the meter shows the balance after the bet | FR20 |
| S4 | Result shown | the spin answer arrives with `ok` | the outcome animates; the round's final win figure equals the credited amount; every figure shown before it (a base win, a bonus win, a free-games tally, a cascade's running total, a ladder's crates, collected pay and total) is a share of the credited amount in proportion to the engine's units for that part, so the base and bonus wins add up to the credited amount and every running tally ends on it; a share is rounded to the cent and can differ by one cent from the engine value times the bet; the win is added to the meter when the animation ends | FR20, FR21, settled with user |
| S5 | Win being credited | the spin answer is marked `creditPending` | the outcome animates as in S4 and the round's win carries the mark BEING CREDITED; the meter stays without that win until a later answer carries it | proposed |
| S6 | Not enough funds | the meter is below the bet and the balance the server returns for a fresh session call is below it too, or the server answers `insufficient_funds` | the reels do not move; the message line reads NOT ENOUGH FUNDS and a DEPOSIT button shows beside it; pressing DEPOSIT posts `{type: 'apex:deposit'}` to the parent; the next SPIN asks the server for the balance again, so a deposit made elsewhere lets the spin through | proposed |
| S7 | Session expired | `session_expired` from the session or the spin, or no token in the address | the message line reads SESSION EXPIRED. REOPEN THE GAME.; SPIN does nothing | proposed |
| S8 | Connection lost | three attempts of a request fail | the line reads Connection lost. Your balance is safe and correct, reconnect to continue.; the key of the unfinished spin is kept, the bet shows the stored bet and the bet controls are locked, and the next SPIN sends the stored key again | settled with user |
| S9 | Server busy | the server answers `busy` | the line reads THE CASINO IS BUSY. PRESS SPIN TO TRY AGAIN.; the key is kept, the bet shows the stored bet and the bet controls are locked, the next SPIN sends the key again | proposed |
| S10 | Bet not accepted | the server answers `bet_refused` | the line reads THIS BET WAS NOT ACCEPTED. NOTHING WAS CHARGED.; no outcome shows; the stored key is cleared, the bet controls unlock and SPIN works with a new key | proposed |
| S11 | Game unavailable | the server answers `unavailable` | the line reads THE GAME IS NOT AVAILABLE NOW. TRY LATER.; a stored spin key is cleared (nothing was charged), the bet controls unlock and SPIN asks again with a new key | proposed |
| S12 | Information screen | the info button is pressed | the existing overlay with the paytable, rules and keys; its last line is Art by APEXSLOTS (apexslots.eu), CC BY 4.0 | FR27 |
| S13 | Resumed spin | the window opens or reloads with an unfinished spin key in the tab's storage | the window sends that key with its stored bet and shows the round the server returns as a normal result (S4 or S5); no SPIN press is needed | settled with user |

### Lifecycle

| Id | Thing that holds state | Tab switch and back | Close by X, Esc, outside | Reopen | Reload | Browser back and forward | An action elsewhere changes what is listed | Sign-out and account switch | The same screen in a second tab | Session expiry | The same event twice with one id | Status |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| L1 | Launch token | keeps | n/a — no dialog holds it | resets — a new launch brings a new token | keeps — the address and the tab's storage hold it | n/a — the frame has no history of its own | n/a — nothing elsewhere changes it | resets — the site opens a new launch | keeps — each tab has its own storage | resets — the player reopens the game | n/a — read once per page load | FR18 |
| L2 | Key and bet of the unfinished spin | keeps | n/a — no dialog holds it | resets — another token is another scope | keeps | n/a — the frame has no history of its own | n/a — nothing elsewhere changes it | resets — the token is gone | n/a — each tab keeps its own | resets — the token is refused | keeps — the server returns the first answer | settled with user |
| L3 | Balance shown | keeps | n/a — no dialog holds it | refreshes — the session call | refreshes — the session call | n/a — the frame has no history of its own | refreshes — a deposit shows at the next answer, at reopen, or when SPIN finds the shown balance below the bet and asks the server | resets | refreshes — at the window's next answer | keeps — the last balance shows, SPIN is off | keeps | proposed |
| L4 | Running animation of a round | keeps — the browser may slow it | n/a — no dialog holds it | resets — the win is already credited | resets — the win is already credited | n/a — the frame has no history of its own | n/a — nothing elsewhere changes it | resets | n/a — each tab animates its own | keeps — a finished round plays out | n/a — one answer starts one animation | FR21 |
| L5 | Information overlay | keeps | resets — it closes | resets | resets | n/a — the frame has no history of its own | n/a — nothing elsewhere changes it | resets | n/a — each tab has its own | keeps | n/a — it opens once per press | proposed |
| L6 | Selected bet | keeps — and while a spin key is stored it is the stored bet and the controls are locked | n/a — no dialog holds it | resets — back to 1.00, or the stored bet while a key is stored | resets — back to 1.00, or the stored bet while a key is stored | n/a — the frame has no history of its own | n/a — nothing elsewhere changes it | resets | n/a — each tab has its own | keeps | n/a — one press changes one step | proposed |
| L7 | Sound setting | keeps | n/a — no dialog holds it | keeps — `localStorage` | keeps — `localStorage` | n/a — the frame has no history of its own | n/a — nothing elsewhere changes it | keeps | refreshes — shared `localStorage` | keeps | n/a — one press toggles once | proposed |

### Forms and requests

The window makes two requests: the spin (F1-F8) and the session (F9-F16).

| Id | Case | What happens | Text, verbatim | Status |
|---|---|---|---|---|
| F1 | Spin: submit twice while the response is slow | the second press only hurries the reels; no second request is sent | — | proposed |
| F2 | Spin: a required field empty | n/a — a spin has no field the player types | — | FR22 |
| F3 | Spin: a value over the limit | the bet controls offer no bet above 10.00; a bet outside the ladder sent by other means is refused by the server as `bad_request` and moves nothing | — | FR22 |
| F4 | Spin: a value that duplicates an existing one | the same key sent again returns the first round; nothing is charged twice | — | FR26 |
| F5 | Spin: the server's error | the message of S6, S7, S9, S10 or S11 shows by the code; SPIN works again except in S7 | see S6, S7, S9, S10, S11 | FR28 |
| F6 | Spin: the same submit from two devices | two windows with one token can both spin; each spin has its own key and round; each window follows its own answers; when the hub holds the player's wallet for the other window's call, the hub queues the second call (up to 8 seconds) and the server's call timeout is longer (10 seconds), so the second spin waits instead of failing | — | proposed |
| F7 | Spin: the network lost mid-request | three attempts 700 ms apart, then S8; the key stays | Connection lost. Your balance is safe and correct, reconnect to continue. | settled with user |
| F8 | Spin: the session expiring with the form half filled | the answer is `session_expired`: S7 | SESSION EXPIRED. REOPEN THE GAME. | FR24 |
| F9 | Session: submit twice | a reload sends the call again; each answer carries the current balance | — | proposed |
| F10 | Session: a required field empty | no token in the address: the window shows S7 and sends nothing | SESSION EXPIRED. REOPEN THE GAME. | FR24 |
| F11 | Session: a value over the limit | n/a — the token is the only input and has no bound the player sees | — | FR18 |
| F12 | Session: a value that duplicates an existing one | n/a — repeating the call is a harmless read | — | FR18 |
| F13 | Session: the server's error | `session_expired` shows S7; `unavailable` shows S11 | SESSION EXPIRED. REOPEN THE GAME. / THE GAME IS NOT AVAILABLE NOW. TRY LATER. | FR28 |
| F14 | Session: the same submit from two devices | each window has its own token and its own tab storage | — | FR18 |
| F15 | Session: the network lost mid-request | the window shows the connection-lost line of S8 and SPIN asks for the session again before it spins | Connection lost. Your balance is safe and correct, reconnect to continue. | proposed |
| F16 | Session: the session expiring with the form half filled | n/a — nothing is half filled; S7 shows at the next answer | — | FR24 |

### Errors

The player never sees a hub code. The server maps the contract's codes to the browser codes of `api-endpoints-diff.md`; the text follows the browser code. There are no translation keys: the games are English only (settled with user).

| Id | HTTP + code | User-facing text | i18n key | Status |
|---|---|---|---|---|
| E1 | 401 `UNAUTHORIZED` | THE GAME IS NOT AVAILABLE NOW. TRY LATER. | — | proposed |
| E2 | 403 (no body) | THE GAME IS NOT AVAILABLE NOW. TRY LATER. | — | proposed |
| E3 | 404 (plain text) | THE GAME IS NOT AVAILABLE NOW. TRY LATER. | — | proposed |
| E4 | 422 `INSUFFICIENT_FUNDS` | NOT ENOUGH FUNDS, with the DEPOSIT button | — | FR23 |
| E5 | 422 `LIMIT_EXCEEDED` | THIS BET WAS NOT ACCEPTED. NOTHING WAS CHARGED. | — | proposed |
| E6 | 422 `SESSION_NOT_FOUND` | SESSION EXPIRED. REOPEN THE GAME. | — | FR24 |
| E7 | 422 `CONFLICT` | THIS BET WAS NOT ACCEPTED. NOTHING WAS CHARGED. | — | proposed |
| E8 | 422 `BAD_REQUEST` | THIS BET WAS NOT ACCEPTED. NOTHING WAS CHARGED. | — | proposed |
| E9 | 422 `REFUSED` | THIS BET WAS NOT ACCEPTED. NOTHING WAS CHARGED. | — | proposed |
| E10 | 503 `BUSY` | THE CASINO IS BUSY. PRESS SPIN TO TRY AGAIN. | — | proposed |
| E11 | 503 `INTERNAL` | THE CASINO IS BUSY. PRESS SPIN TO TRY AGAIN. | — | proposed |

A refusal of the win leg (any code) is never shown as a refusal: the round shows S5 and the sweeper keeps trying; a parked round stays marked for an operator and the player sees nothing more.

## Copy source

`from-origin/feature.md` R6, R10, R14 and R19 give the facts each text carries (insufficient funds with a deposit button, a win being credited, the art credit, reopen the game); the wording is the spec's, in the house style of the games (upper case, no dashes in what a player reads, `bumper-crop/src/game/gameinfo.ts:2-3`). The text of S8 is the game's own today. The art credit is the exact string of R14.

`proposed` rows: S5, S6, S7, S9, S10, S11, L3, L5, L6, L7, F1, F6, F9, F15, E1, E2, E3, E5, E7, E8, E9, E10, E11 — 23.
