# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

All commands should be run from the repo root unless noted.

```bash
# Install all workspace dependencies
npm install

# Development (run both concurrently in separate terminals)
npm run dev:frontend        # Vite dev server on :5173 with proxy to backend
npm run dev:backend         # ts-node-dev with hot reload on :3000

# Production builds
npm run build               # builds frontend + backend (runs tsc + vite build)
npm run build:frontend
npm run build:backend

# Run production server (after build)
npm start

# Docker
docker compose up --build   # runs app + MongoDB together
```

There are no tests or linters configured in this project.

The frontend Vite config proxies `/api` and `/socket.io` to `localhost:3000`, so the frontend dev server on `:5173` talks to the backend on `:3000` transparently.

## Architecture

This is an **npm workspaces monorepo** with three packages:

- `shared/` — TypeScript types only, compiled to CommonJS. Both frontend and backend import from `@ancient-games/shared`.
- `backend/` — Node.js + Express + Socket.io. All game logic lives here.
- `frontend/` — React 18 + Vite + Tailwind CSS. Pure UI; no game logic.

### Backend flow

`server.ts` → Express HTTP + Socket.io on port 3000, MongoDB via Mongoose.

**Session lifecycle (REST):**
- `POST /api/sessions` — creates session, generates short code via nanoid, returns `{ session, playerId }`
- `POST /api/sessions/join` — joins by session code
- `GET /api/sessions/:code` — fetch state (used on page load/reconnect)

`playerId` is stored in `localStorage` and passed on every socket event and REST call. There is no auth.

**Real-time flow (Socket.io):**
All game events are in `backend/src/socket/gameHandlers.ts`. The important sequence:
1. Client emits `session:join` after connecting — this subscribes them to the session room
2. `game:start` (host only) initializes board via game engine
3. `game:roll-dice` → server rolls, stores result on `board.diceRoll`, emits `game:dice-rolled`
4. `game:move` → server validates, applies move, clears `diceRoll`, emits `game:move-made` + `game:state-updated`
5. If no valid moves exist after a roll, `game:skip-turn` advances the turn

**Adding a new game** _(use the `/add-game` skill to scaffold all required files)_:
1. Create `backend/src/games/<name>/<Name>Game.ts` extending `GameEngine` (including `isCaptureMove`)
2. Register it in `GameRegistry.ts`
3. Add the game type to the `GameType` union in `shared/types/game.ts`
4. Add a `GameManifest` entry in `GAME_MANIFESTS` in `shared/types/game.ts`
5. Create `frontend/src/components/games/<name>/<Name>Board.tsx` (default export)
6. Create `frontend/src/components/games/<name>/<Name>Rules.tsx` (default export)
7. Optionally create `<Name>Controls.tsx`, `<name>ScoreInfo.ts`, and animation helpers in the game folder
8. Register in lookup records: `boardComponents` in `GameRoom.tsx`, `rulesComponents` in `GameRules.tsx`, optionally `controlComponents` in `GameControls.tsx`, score registry in `gameScoreInfo.ts`

Note: No changes needed to `Home.tsx` (data-driven from manifest), `MoveLog.tsx` (uses manifest colors), or `gameHandlers.ts` (uses engine methods).

### Game engine interface

Every game engine must implement (`backend/src/games/GameEngine.ts`):
- `initializeBoard()` — starting `BoardState`
- `rollDice()` — returns a number
- `validateMove(board, move, player)` — returns boolean; server calls this before applying
- `applyMove(board, move)` — returns new `BoardState`; must set `diceRoll: null` and advance `currentTurn`
- `checkWinCondition(board)` — returns winning `playerNumber` or `null`
- `getValidMoves(board, playerNumber, diceRoll)` — used by `canMove()` to check if turn must be skipped

Position encoding conventions (both games): `-1` = off-board/not entered, `0–N` = board positions, `99` = finished/exited.

### Frontend state

`GameRoom.tsx` owns all socket listeners and holds `session` + `gameState` state. It passes them down as props to the board components — boards do not subscribe to sockets directly. Boards emit socket events themselves (roll, move) but receive state updates only through props.

`socketService` (`frontend/src/services/socket.ts`) is a singleton that holds the Socket.io client connection; call `socketService.getSocket()` from any component.

### Shared types

`shared/types/socket-events.ts` defines `ClientToServerEvents` and `ServerToClientEvents` interfaces — these are the single source of truth for what events exist and their payloads. The backend's Socket.io server and the frontend's client are both typed against these interfaces.

### Deployment

The Dockerfile is a multi-stage build: builder installs all deps and compiles everything, then the production stage copies only the built artifacts and prod deps. The backend serves the compiled frontend as static files in production (`express.static` on the `dist` path).

Kubernetes manifests are in `k8s/`. The Service uses `sessionAffinity: ClientIP` — this is required for WebSocket connections to work correctly across multiple replicas.
