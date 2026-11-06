# from-origin — source of the copy

- Origin workspace: `C:\Users\GamePC\Desktop\projects\alexpay\own-slots-or-free-pragmatic\Casino-Game-Aggregator\tasks\own-slots-or-free-pragmatic`
- Copied: 2026-11-06, refreshed 2026-11-06 after the origin's amendments A1 (`6907e0ad`) and A2 (`d2f3116d`); the contract id is now `d2f3116de475e94b90045b41e9f5c3a0a91b2b94`
- Copy is read and cited, never edited. A change starts as an amendment in the origin workspace and arrives here as a re-copy.
- Not copied: `contract-log.md` (stays in the origin; its absolute path is in the `## Contract` block of `tasks.md`), `plan.md`, `tasks.md`, `test-cases.md`, `spec-review.md` (the hub's half).

| file | what it is |
|---|---|
| `feature.md` | `R1..R19`, actors, business rules, targets, out of scope |
| `contract.openapi.yaml` | the hub webhook the game server calls (`balance`, `bet`, `win`) and the launch URL the game server serves |
| `flow-overview.md` | the origin's downward call tree: lobby, launch, spin with win, refused bet, pending win |
| `context/index.md`, `request.md`, `author-qa.md`, `grilling.md` | the sources and the settled decisions behind `feature.md` |
