# Author questions — own-slots-or-free-pragmatic

## The task in one paragraph

The request (`context/request.md`) is one sentence: "нужно добавить свои слоты или бесплатную интеграцию прагматик",
plus the remark that the aggregator already has a Pragmatic integration. Read as: the casino should have playable
slots without paying for a Pragmatic Play contract — either slots we build ourselves, or some free way to get
Pragmatic's games. The request names two alternatives and does not say which one, or what "free" means.

## Questions

### Q1. Is there a free way to Pragmatic games, or is the existing integration just waiting for contract details?

- **Requirements say:** "бесплатную интеграцию прагматик" (`request.md`); "в агрегаторе уже есть интеграция прагматика" (`request.md`, relayed remark).
- **Today:** the aggregator really does contain a complete Pragmatic integration: the game list, launching a game, a
  free-play (demo) launch, and the exchange of bets and wins with the player's balance. It starts working only after
  three values from Pragmatic's contract are entered: a partner login, a secret key and Pragmatic's server address.
  Without them the game list is empty and the player sees "games unavailable" instead of Pragmatic games. The free-play
  launch asks Pragmatic through the same three values, so it is not a way around the contract.
  **Unchecked:** whether Pragmatic hands out a free test account, and whether it allows showing its public demo pages
  on another site — no official source was found, only marketing pages about paid routes.
- **Why it matters:** if "free" means "without any agreement with Pragmatic", nothing we build can make that so, and the
  task becomes own slots only. If the three values can be had (a contract, or a test account), no Pragmatic work is
  needed in this task.
- **Options:**
  - A. The three values exist or will come (contract or Pragmatic test account) — no Pragmatic work here.
  - B. They will not come — Pragmatic is out of this task, only own slots.
  - C. Show Pragmatic's public demo pages in our lobby with no agreement (no balance, no real money) — nothing confirms this is allowed.
- **Recommended:** A or B, whichever matches the fact you hold; not C, because permission is unverified.
- **Answer:** (answered by user) B — Pragmatic is out of this task. The existing integration stays switched off, neither touched nor removed.

### Q2. What are "own slots"?

- **Requirements say:** "добавить свои слоты" (`request.md`).
- **Today:** the casino has no game of its own that can be played. The home page shows 15 "Original" tiles (crash,
  mines, plinko, dice, limbo, wheel, hi-lo, keno, blackjack, roulette, baccarat, video poker, dragon tiger, coin flip,
  king of money); each opens a page saying the in-house games module is required. Their engine was part of a closed
  add-on that this copy of the platform does not contain. None of the 15 is a slot machine.
- **Why it matters:** a new slot machine (reels, win lines, bonus rounds) and the 15 table/instant games are different
  amounts of work, and only the first matches the word "слоты".
- **Options:**
  - A. New slot machines written by us.
  - B. Make the 15 listed "Original" games playable.
  - C. A first, then B.
- **Recommended:** A — it is what the request names; the 15 games are fifteen separate projects.
- **Answer:** (answered by user) Take the ready open-source slots from github.com/Z1000k/open-source-slots (11 finished games with art, sound and client; MIT code, CC BY 4.0 art). Chosen after slotopol/server was examined and dropped: it has no screen and its own balance model (see `grilling.md`).

### Q3. Real money or play money for our own games?

- **Requirements say:** nothing.
- **Today:** the platform's balance already handles the bets, wins and cancellations of the aggregator's games with
  full bookkeeping, bonus wagering and loss limits. An own game could use the same balance. No play-money mode exists
  anywhere except Pragmatic's demo.
- **Why it matters:** with real money we set the odds, the casino carries the result and the game's accuracy
  (random-number fairness and its certification). With play money there is no exposure and no revenue.
- **Options:**
  - A. Real money from the player's balance.
  - B. Play money only, no balance change.
  - C. Both, the player chooses.
- **Recommended:** A — free play brings no revenue; certification and licensing stay with you, as for the Pragmatic
  traffic (not checked here).
- **Answer:** (answered by user) A — always the player's real balance ("платим всегда настоящим балансом, всё должно работать").

### Q4. May guests play free mode without registering?

- **Requirements say:** nothing.
- **Today:** Pragmatic's demo launch works only for a logged-in player; a guest is sent to the login page. No guest play exists.
- **Why it matters:** open free play would show games to visitors before sign-up, and puts the game servers in front of anonymous traffic.
- **Options:**
  - A. Logged-in players only, as today.
  - B. Guests may play free mode.
- **Recommended:** A — the smallest change; revisit when free mode exists.
- **Answer:** (answered by user) Moot: "без демо" — the new games have no demo and no guest play at all.

### Q5. What should the lobby do with the 15 "Original" tiles that open a dead page?

- **Requirements say:** nothing.
- **Today:** the tiles are always shown, to everyone, and every click ends on the "module required" page.
- **Why it matters:** a visitor sees 15 games that cannot be played; if our own slots are added, they would sit among tiles that look broken.
- **Options:**
  - A. Leave them as they are.
  - B. Hide each tile until its game is playable.
- **Recommended:** B — a tile that leads nowhere reads as a bug.
- **Answer:** (answered by user) B — hide them ("скрываем, все что доступно должно работать"); the new games take their place on the home page ("вместо ориджинал ставим").

## Expected next round (waits for Q1-Q3)

Rules of the first own slot — theme, number of reels and win lines, return-to-player percentage, maximum win, bonus
features, how many slots — and how bets on own games count toward bonus wagering.

## Round 2 — the game window (slots-server half)

Raised while planning the game server and the twelve game windows. Both questions are about what the player sees
inside the game window; the requirements above leave them open.

### Q6. What does the player see after the connection drops in the middle of a spin?

- **Requirements say:** "WHEN the same spin request is repeated, THE SYSTEM SHALL return the first outcome and SHALL NOT debit, draw or credit again." (R9, `feature.md`); "Once the bet is debited the round is only ever completed" (business rules, `feature.md`).
- **Today:** each game remembers the spin's identity only while one press of SPIN is being processed. It tries three times and then shows "Connection lost. Your balance is safe and correct, reconnect to continue." The next press of SPIN is a brand-new spin. **Unchecked:** how often a spin is lost after the casino already took the bet; nothing reachable measures it.
- **Why it matters:** example: the player presses SPIN at bet 1.00, the casino takes the 1.00 and draws a win of 5.00, then the player's Wi-Fi drops before the result arrives. The casino always completes that round, so 5.00 reaches the balance. What differs is whether the player ever sees what they won.
- **Options:**
  - A. The game window keeps the identity of the unfinished spin for as long as the window stays open or is reloaded in the same tab. After reconnecting, SPIN (or reopening the window) shows that same round's result and nothing is charged twice. If the tab was closed in between, the win still reaches the balance but is not shown.
  - B. Every press of SPIN is a new spin. The interrupted round is still completed and paid, but the player never sees it; the balance simply rises by 5.00 with no visible cause.
- **Recommended:** A — the player sees what they were paid for; cost is one small stored value per window.
- **Answer:** (answered by user) A — "все да" (2026-11-06, accepting the recommended option of every question of the round).

### Q7. In which language are the game windows?

- **Requirements say:** nothing. The launch link carries the player's language (`lang`), per the contract with the game hub.
- **Today:** all twelve games are in English only: the information screen, the paytable, the game messages. No translation exists. The messages this task adds — "not enough funds" with a Deposit button, "reopen the game", "win being credited" — would be new texts.
- **Why it matters:** example: a player whose site is in Russian opens Tropic Escape and sees English paytable text and an English "Not enough funds" message with an English "Deposit" button.
- **Options:**
  - A. English only; the player's language is ignored.
  - B. The three or four new messages are translated into the site's languages (you name the list); the games' own screens stay English.
  - C. Everything translated, including the information screen of every game.
- **Recommended:** A — the games ship English-only; B or C add a translation catalogue and a decision on who owns the texts.
- **Answer:** (answered by user) A — "все да" (2026-11-06, accepting the recommended option of every question of the round).
