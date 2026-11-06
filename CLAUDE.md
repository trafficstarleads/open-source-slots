# slots-server

Twelve own slot games (one folder each, browser client plus a proven engine) and the game server in
`server/` that draws their rounds and books the money through the game hub's signed webhook
(`balance`, `bet`, `win`). The hub holds the balances, this repository holds the rounds.

## Commands
- Stand up the test database: `docker run -d --name slots-test-pg -e POSTGRES_PASSWORD=test -p 5434:5432 postgres:17` — once; later `docker start slots-test-pg`
- Test database address: `TEST_DATABASE_URL=postgres://postgres:test@localhost:5434/postgres` — the default of `server/vitest.config.ts`, set the variable only to point elsewhere
- Install the server: `npm --prefix server ci`
- Server tests: `npm --prefix server test` — run from the repo root; Postgres from the line above must be up for the tests that use the database
- One server test file: `cd server && npx vitest run --reporter=dot tests/<name>.test.ts`
- Types: `npm --prefix server run typecheck`
- Generate the hub wire types: `npm --prefix server run codegen` — writes `server/src/hub/generated.ts` from the contract
- Check the hub wire types: `npm --prefix server run codegen:check` — exits non-zero when `generated.ts` differs from what the contract generates
- A game's tests: `npm --prefix <game> ci && npm --prefix <game> test` — `<game>` is a folder such as `stellar-sevens`
- Install the twelve games: `for g in bumper-crop discovery-voyage fairytale golden-papyrus house-of-ra nitro-hot pearl-reef samurai scorching-hot stellar-sevens the-dynasty tropic-escape; do npm --prefix $g ci; done` — needed by `build:games` and by the bundle and e2e tests
- Build the twelve bundles: `npm --prefix server run build:games` — type-checks each game and writes `server/public/play/<symbol>/` (gitignored); symbols after `--` build only those
- Run a window locally: `npm --prefix server run dev:stub`, then open `http://localhost:9100/host/<symbol>?token=tok-rich` — needs the built bundles and the test Postgres; `STUB_PORT` and `PORT` move the two servers
- Bundle and end-to-end tests: `cd server && npx vitest run --reporter=dot tests/games-built.test.ts tests/e2e.test.ts` — each file builds the twelve bundles into a temp folder (`GAMES_OUTPUT_DIR`), takes about a minute and needs the twelve games installed
- Client-kit tests: `cd client-kit && npx vitest run` — `npm --prefix client-kit` fails in Git Bash

## Gotchas
- `server/src/hub/generated.ts` is generated → change the contract and run `codegen`, never edit the file — `codegen:check` fails on a hand edit
- The contract is `tasks/own-slots-or-free-pragmatic/from-origin/contract.openapi.yaml`, owned by the hub's repository → an amendment goes through spec, this repository never edits the file
- Test fixtures in `server/tests/fixtures/` copy the contract's examples → when an example changes, `hub-contract.test.ts` fails until the fixture follows
- Test files that use Postgres share one database and run one after another (`fileParallelism: false`) → keep that setting, parallel files would collide on the one database
- `<game>/src/engine` is imported by the server unchanged, and its RTP is proven by the game's own `npm run sim:exact` → change an engine only for a new game or a proven fix
- `npm run dev` of a game folder cannot run a window → build it with `build:games` and open it through `dev:stub`; the window imports `../client-kit`, which the game's Vite dev server does not serve, and it plays only through the game server
- `server/.env.example` lists every setting `loadConfig` and the upload script read (`envExample.test.ts` compares them) → add a new setting to the file and to the README settings table in the same change
- On Windows git converts line endings (`core.autocrlf`), which would break `codegen:check` → `server/.gitattributes` pins `generated.ts` to LF

## Docs beside code
- A change of behaviour, configuration, API, build or deployment ships with `README.md` in the same change
