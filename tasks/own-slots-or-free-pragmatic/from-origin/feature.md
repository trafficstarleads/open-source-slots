# own-slots-or-free-pragmatic — feature

The casino gets twelve ready-made slots of its own, played for the player's real site balance, so it has playable slots without a contract with Pragmatic Play. The slots come from an open-source collection (MIT code, CC BY art) whose games the casino now runs on a game server of its own: the server decides every round, and the existing game hub moves the money between that server and the player's site balance. The Pragmatic integration stays as it is, switched off.

## Actors

| Actor | Role |
|---|---|
| Player | Plays the slots with the real site balance |
| Casino administrator | Switches games and the provider on and off in the hub |
| Game server | Runs the twelve games, decides every round, keeps the round journal, asks the hub to move money |
| Game hub | Lists the games, launches them for a player, accepts the game server's money calls and moves the money on the platform wallet |
| Platform | The casino site: lobby, game window, deposit page, the wallet that holds the balance |

## Requirements

- R1. WHEN a player opens the casino lobby, THE SYSTEM SHALL show the twelve slots of provider APEXSLOTS, each with its tile image and name, in the place of the former "Original" block.
- R2. THE SYSTEM SHALL NOT show the former "Original" tiles, from the lobby or from search, nor lead to their "module required" page.
- R3. THE SYSTEM SHALL NOT offer demo play or guest play for the APEXSLOTS slots, anywhere a demo switch exists.
- R4. WHEN a logged-in player opens an APEXSLOTS slot, THE SYSTEM SHALL start the game for that player and show their site balance in it.
- R5. WHEN a player spins, THE SYSTEM SHALL debit the bet from the site balance before the outcome is revealed, and credit the win to the site balance at the moment of the spin.
- R6. IF the site balance is below the bet, THEN THE SYSTEM SHALL refuse the spin without drawing an outcome, tell the player the funds are insufficient and offer a button that leads to the deposit page.
- R7. THE SYSTEM SHALL decide the outcome of every round on the server with a cryptographically secure random source, and SHALL NOT let the browser decide or change an outcome, a bet or a win.
- R8. THE SYSTEM SHALL accept bets only from 0.10 to 10.00, in the game's own bet ladder.
- R9. WHEN the same spin request is repeated, THE SYSTEM SHALL return the first outcome and SHALL NOT debit, draw or credit again.
- R10. WHEN a win cannot be credited after the bet was debited, THE SYSTEM SHALL show the outcome with the win marked "being credited" and keep trying until the win is credited, exactly once.
- R11. THE SYSTEM SHALL debit each bet exactly once and credit each win exactly once, so that for every round the ledger shows the bet and the win.
- R12. THE SYSTEM SHALL round a win to the nearest cent.
- R13. THE SYSTEM SHALL NOT cap the win of a round, and SHALL credit the total win of a round, free games and bonus steps included, at the moment of the spin, regardless of the animation.
- R14. THE SYSTEM SHALL show on the information screen of every game the credit "Art by APEXSLOTS (apexslots.eu), CC BY 4.0".
- R15. THE SYSTEM SHALL NOT change or remove the existing Pragmatic integration, and SHALL leave it switched off.
- R16. WHEN an administrator disables a game or the provider, THE SYSTEM SHALL stop listing and launching it.
- R17. THE SYSTEM SHALL keep every round, with its bet, outcome, win and status, without expiry.
- R18. IF a call that moves money is unsigned, wrongly signed or comes from an address that is not allowed, THEN THE SYSTEM SHALL refuse it and SHALL NOT move any money.
- R19. WHEN a player's game session has expired, THE SYSTEM SHALL tell the player to reopen the game and SHALL NOT start a round.

## Business rules

- **Money.** USD only, as on the site. Amounts cross between the game server and the hub as whole cents. A bet is whole cents; a win is rounded to the nearest cent before it is sent (R12), so the average return of a game is kept.
- **Order of one spin.** The round is drawn and saved first, then the bet is debited, then the win (if any) is credited. A round with no win ends with the bet call alone; a round with a win ends with the win call. Bet and win are always two separate calls: when both arrive together the hub books the win first, and an under-funded player would keep every winning round and lose nothing on losing ones.
- **A drawn round is never voided.** Once the bet is debited the round is only ever completed: a call whose outcome is unknown is repeated until the other side answers. A definite refusal of the bet (insufficient funds, limit, blocked player) ends the round unplayed and shows no outcome.
- **A refused win is never final.** A win can be refused after its bet moved money (the operator disabled for a moment, the site currency switched, the player record missing). The round then stays "win pending" and is retried with growing pauses and an alert; only a conflict or an unreadable request is parked for an operator.
- **A pending win may outlive the session.** The retry carries the launch token of the round it belongs to, and the hub restores the lapsed session only for that token.
- **A refused bet is final for its round.** Repeating it after a deposit would debit it; the next spin is a new round with a new id. A bet the hub cannot take because of a fault of the setup (wrong signature, unknown or switched-off partner, address not allowed) ends its round unplayed in the same way and shows "game unavailable"; it is not repeated later, so the player is never debited for a round they were told did not happen. The one exception is a bet that an earlier attempt may already have debited (outcome unknown): that is repeated until the hub answers.
- **A spin cut off by a lost connection.** The game window keeps the identity of an unfinished spin for as long as the window stays open or is reloaded in the same tab, so that after reconnecting the player sees that round's result and nothing is charged twice. If the tab was closed in between, the win still reaches the balance but is not shown (author answer, Round 2).
- **Language.** The game windows are in English only, whatever language the player's site is in (author answer, Round 2).
- **What a retry means.** Every spin request carries a key; the same key returns the first answer. Every money call carries a transaction id derived from the round, and the same id returns the first answer and moves nothing.
- **Worst round.** Free games can retrigger without limit and there is no cap, so the largest documented round is 10 000 times the bet, 100 000 at the top bet (Golden Papyrus). The casino carries that tail.
- **Credit timing.** The win is on the balance when the spin returns, even when the player closes the window in the middle of a bonus. The animation only shows what is already credited.
- **Session.** A game session lives 24 hours from the last call to the hub and is renewed by every call; the player who stays idle longer reopens the game.
- **Games.** Twelve fixed games, each with its own return-to-player percentage fixed by its reels (94.14 to 95.66 as published by the source, to be re-checked by the source's own simulators). A game can be switched off alone.

## Targets

| repo | its half of the feature | requirements it closes |
|---|---|---|
| Casino-Game-Aggregator | Vendor `OWNSLOTS` in the hub: constant catalog of the twelve games, launch URL, signed money calls (balance, bet, win), no demo | R1, R3, R4, R5, R6, R9, R11, R15, R16, R18, R19 |
| slots-server | The game server: the twelve games' engines on the server, a cryptographic random source, the round journal, the pending-win retry, the games' browser clients switched to server-decided rounds | R3, R4, R5, R6, R7, R8, R9, R10, R11, R12, R13, R14, R17, R19 |
| vip90-bet-core | The casino site: the lobby row in place of "Original", hiding "Original" and the demo switch, the deposit jump from a game, the tile image base | R1, R2, R3, R6 |

## Out of scope

- Demo play and guest play: decided against, the games have none.
- Pragmatic: stays switched off and untouched until its contract details exist.
- A cap on a round's win: decided against.
- Game coins or any non-USD balance: the site balance is the only money.
- Translating the game windows: decided against, English only (author answer, Round 2).
- Per-game artwork beyond what the collection ships, and new games: later.
- Deployment sizing (how much CPU, memory, database and certificate the game server needs on its subdomain): worked out at deploy time, not here.
- Re-clearing the commercial-slot provenance of the maths: accepted for an internal network.
