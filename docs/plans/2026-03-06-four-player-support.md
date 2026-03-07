# Four-Player Support Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Extend the platform to support N-player games (starting with 4-player Bombermage) without impacting any existing 2-player games.

**Architecture:** Add a `getNextTurn(board, currentPlayer)` method to `GameEngine` with a default implementation of `(current + 1) % playerCount` — correct for all existing 2-player games unchanged. Replace the three hardcoded `% 2` turn-cycling locations in `gameHandlers.ts` with this method. Fix seat-cap logic to derive max players from the engine rather than hardcoding 2. Bombermage overrides `getNextTurn` to skip eliminated (hp <= 0) players.

**Tech Stack:** TypeScript, Node.js/Socket.io backend, React/Vite frontend, shared types in `@ancient-games/shared`

---

### Task 1: Add `getNextTurn` to the shared `GameEngine` interface

**Files:**
- Modify: `shared/types/game.ts` (the `GameEngine` interface around line 241)

**Step 1: Add method to the interface**

In `shared/types/game.ts`, add `getNextTurn` to the `GameEngine` interface:

```ts
export interface GameEngine {
  gameType: GameType;
  playerCount: number;

  initializeBoard(): BoardState;
  rollDice(): number;
  validateMove(board: BoardState, move: Move, player: Player): boolean;
  applyMove(board: BoardState, move: Move): BoardState;
  checkWinCondition(board: BoardState): number | null;
  getValidMoves(board: BoardState, playerNumber: number, diceRoll: number): Move[];
  canMove(board: BoardState, playerNumber: number, diceRoll: number): boolean;
  isCaptureMove(board: BoardState, move: Move): boolean;
  /** Returns the player number whose turn comes after currentPlayer. */
  getNextTurn(board: BoardState, currentPlayer: number): number;
}
```

**Step 2: Add default implementation to abstract base class**

In `backend/src/games/GameEngine.ts`, add the default implementation (after `afterDiceRoll`):

```ts
/** Returns the player number whose turn comes after currentPlayer. Default: round-robin by playerCount. */
getNextTurn(board: BoardState, currentPlayer: number): number {
  return (currentPlayer + 1) % this.playerCount;
}
```

**Step 3: Build shared package to catch any type errors**

```bash
npm run build --workspace=shared
```

Expected: no errors.

**Step 4: Commit**

```bash
git add shared/types/game.ts backend/src/games/GameEngine.ts
git commit -m "feat(engine): add getNextTurn method with default round-robin implementation"
```

---

### Task 2: Replace hardcoded `% 2` turn cycling in `gameHandlers.ts`

**Files:**
- Modify: `backend/src/socket/gameHandlers.ts`

There are three places in `gameHandlers.ts` where the next turn is computed as `% 2`. Each must use `engine.getNextTurn(board, currentTurn)` instead. The `gameEngine` variable is already in scope in each block.

**Step 1: Fix the `game:roll-dice` no-valid-moves auto-skip (around line 483)**

Find:
```ts
const nextTurn = (session.gameState.currentTurn + 1) % 2;
```
Replace with:
```ts
const nextTurn = gameEngine.getNextTurn(session.gameState.board, session.gameState.currentTurn);
```

Note: this is inside `if (!canMove && !hasReroll)` in the `game:roll-dice` handler.

**Step 2: Fix the `game:skip-turn` handler (around line 745)**

Find:
```ts
const nextTurn = (session.gameState.currentTurn + 1) % 2;
```
Replace with (add `const gameEngine = GameRegistry.getGame(session.gameType);` first if not present, then):
```ts
const gameEngine = GameRegistry.getGame(session.gameType);
const nextTurn = gameEngine.getNextTurn(session.gameState.board, session.gameState.currentTurn);
```

**Step 3: Fix the `game:use-power` reroll no-moves fallback (around line 960)**

Find:
```ts
const nextTurn = (gameState.currentTurn + 1) % 2;
```
Replace with:
```ts
const nextTurn = engine.getNextTurn(gameState.board, gameState.currentTurn);
```
(Note: `engine` is already in scope in this handler as the cast `UrRoguelikeGame`; use that variable.)

**Step 4: Build backend to verify no type errors**

```bash
npm run build:backend
```

Expected: no errors.

**Step 5: Commit**

```bash
git add backend/src/socket/gameHandlers.ts
git commit -m "fix(handlers): replace hardcoded % 2 turn cycling with engine.getNextTurn"
```

---

### Task 3: Fix seat-cap in lobby handlers to use engine player count

**Files:**
- Modify: `backend/src/socket/gameHandlers.ts`

**Step 1: Fix `session:take-seat` handler (around line 259)**

Find:
```ts
const maxPlayers = (currentSession.lobbyFormat ?? 'single') === 'single' ? 2 : 8;
```
Replace with:
```ts
const gameEngine = GameRegistry.getGame(currentSession.gameType);
const maxPlayers = (currentSession.lobbyFormat ?? 'single') === 'single'
  ? gameEngine.playerCount
  : 8;
```

**Step 2: Fix `session:host-take-seat` handler (around line 306)**

Same replacement as above (there's an identical block a few lines later).

**Step 3: Build and commit**

```bash
npm run build:backend
git add backend/src/socket/gameHandlers.ts
git commit -m "fix(lobby): derive max seat count from engine.playerCount instead of hardcoding 2"
```

---

### Task 4: Update Bombermage engine to support 4 players

**Files:**
- Modify: `backend/src/games/bombermage/BombermageGame.ts`
- Modify: `backend/src/games/bombermage/BombermageGame.test.ts`

**Step 1: Write a failing test for `getNextTurn` skipping dead players**

Add to `BombermageGame.test.ts`:

```ts
describe('BombermageGame - getNextTurn', () => {
  it('returns next player in round-robin for 4 players', () => {
    const board = game.initializeBoard() as any;
    expect(game.getNextTurn(board, 0)).toBe(1);
    expect(game.getNextTurn(board, 1)).toBe(2);
    expect(game.getNextTurn(board, 2)).toBe(3);
    expect(game.getNextTurn(board, 3)).toBe(0);
  });

  it('skips eliminated players (hp <= 0)', () => {
    const board = game.initializeBoard() as any;
    // Eliminate player 1
    board.players[1].hp = 0;
    expect(game.getNextTurn(board, 0)).toBe(2);
    expect(game.getNextTurn(board, 2)).toBe(3);
    expect(game.getNextTurn(board, 3)).toBe(0);
  });

  it('skips multiple eliminated players', () => {
    const board = game.initializeBoard() as any;
    board.players[1].hp = 0;
    board.players[2].hp = 0;
    expect(game.getNextTurn(board, 0)).toBe(3);
    expect(game.getNextTurn(board, 3)).toBe(0);
  });
});
```

**Step 2: Run to verify test fails**

```bash
npm test --workspace=backend
```

Expected: FAIL — `getNextTurn` not overridden, so default `% 4` doesn't skip dead players.

**Step 3: Change `playerCount` to 4 in `BombermageGame.ts`**

Find:
```ts
playerCount = 2;
```
Replace with:
```ts
playerCount = 4;
```

**Step 4: Override `getNextTurn` in `BombermageGame.ts`**

Add this method to the `BombermageGame` class (after `afterDiceRoll` or near `playerCount`):

```ts
getNextTurn(board: BoardState, currentPlayer: number): number {
  const players: any[] = board.players ?? [];
  for (let i = 1; i <= this.playerCount; i++) {
    const candidate = (currentPlayer + i) % this.playerCount;
    const candidatePlayer = players.find((p: any) => p.playerNumber === candidate);
    if (!candidatePlayer || candidatePlayer.hp > 0) return candidate;
  }
  // Fallback (all eliminated — shouldn't happen if win condition fires first)
  return (currentPlayer + 1) % this.playerCount;
}
```

**Step 5: Update `initializeBoard` to spawn 4 players**

The board currently spawns 2 players. Bombermage has a 4-corner layout. Update `initializeBoard` to place players in all 4 corners:

- Player 0: top-left `(0, 0)`
- Player 1: top-right `(0, cols-1)`
- Player 2: bottom-left `(rows-1, 0)`
- Player 3: bottom-right `(rows-1, cols-1)`

The current implementation should already handle this since it likely uses `playerCount` or a fixed list. Read the actual `initializeBoard` method first to see what needs changing. The key is: the players array must contain 4 entries (playerNumbers 0–3) with valid starting positions.

**Step 6: Run tests to verify passing**

```bash
npm test --workspace=backend
```

Expected: all tests PASS.

**Step 7: Commit**

```bash
git add backend/src/games/bombermage/BombermageGame.ts backend/src/games/bombermage/BombermageGame.test.ts
git commit -m "feat(bombermage): support 4 players with corner spawns and dead-player turn skipping"
```

---

### Task 5: Update `checkWinCondition` for last-player-standing

**Files:**
- Modify: `backend/src/games/bombermage/BombermageGame.ts`
- Modify: `backend/src/games/bombermage/BombermageGame.test.ts`

**Step 1: Write failing tests**

```ts
describe('BombermageGame - checkWinCondition (4 players)', () => {
  it('returns null when multiple players are alive', () => {
    const board = game.initializeBoard() as any;
    expect(game.checkWinCondition(board)).toBeNull();
  });

  it('returns the surviving player number when 3 are eliminated', () => {
    const board = game.initializeBoard() as any;
    board.players[0].hp = 0;
    board.players[1].hp = 0;
    board.players[2].hp = 0;
    expect(game.checkWinCondition(board)).toBe(3);
  });

  it('returns null when exactly 2 players remain alive', () => {
    const board = game.initializeBoard() as any;
    board.players[0].hp = 0;
    board.players[1].hp = 0;
    expect(game.checkWinCondition(board)).toBeNull();
  });
});
```

**Step 2: Run to verify fail**

```bash
npm test --workspace=backend
```

**Step 3: Update `checkWinCondition` in `BombermageGame.ts`**

The existing win condition likely checks for 1 player at 0 hp (2-player assumption). Update it to:

```ts
checkWinCondition(board: BoardState): number | null {
  const players: any[] = board.players ?? [];
  const alive = players.filter((p: any) => p.hp > 0);
  if (alive.length === 1) return alive[0].playerNumber;
  return null;
}
```

**Step 4: Run tests to verify passing**

```bash
npm test --workspace=backend
```

**Step 5: Commit**

```bash
git add backend/src/games/bombermage/BombermageGame.ts backend/src/games/bombermage/BombermageGame.test.ts
git commit -m "feat(bombermage): update win condition for last-player-standing with 4 players"
```

---

### Task 6: Update shared game manifest for Bombermage

**Files:**
- Modify: `shared/types/game.ts`

**Step 1: Update the Bombermage manifest entry**

Find the `bombermage` entry in `GAME_MANIFESTS` (around line 111):

```ts
bombermage: {
  type: 'bombermage',
  title: 'Bombermage',
  emoji: '💣',
  description: '2 players · bomb tactics',
  playerColors: ['#F97316', '#8B5CF6'],
},
```

Replace with:

```ts
bombermage: {
  type: 'bombermage',
  title: 'Bombermage',
  emoji: '💣',
  description: '4 players · bomb tactics',
  playerColors: ['#F97316', '#8B5CF6', '#22C55E', '#EC4899'],
},
```

The two new colors (green and pink) are for players 2 and 3.

**Step 2: Verify `playerCount` field**

Check that the `GameManifest` interface includes `playerCount: number` (it should be at line 243). If `GAME_MANIFESTS` entries don't include `playerCount`, add it: existing 2-player games add `playerCount: 2`, bombermage gets `playerCount: 4`.

Look at the full `GameManifest` interface to see if `playerCount` is already a required field. If it is required but not present in any manifest entries, add it to all of them. If it is optional, just add it to bombermage.

**Step 3: Build shared**

```bash
npm run build --workspace=shared
```

**Step 4: Commit**

```bash
git add shared/types/game.ts
git commit -m "feat(shared): update Bombermage manifest to 4 players with 4 player colors"
```

---

### Task 7: Update frontend lobby for N-player games

**Files:**
- Modify: `frontend/src/components/lobby/SessionLobby.tsx`

The lobby currently hardcodes `2` in several places for single-match sessions. It needs to use the game manifest's `playerCount` (or a derived value) instead.

**Step 1: Derive required player count from manifest**

At the top of the `SessionLobby` component (where `session` is available), add:

```ts
import { GAME_MANIFESTS } from '@ancient-games/shared';

// inside component:
const requiredPlayers = session ? (GAME_MANIFESTS[session.gameType]?.playerCount ?? 2) : 2;
```

**Step 2: Replace hardcoded `2` references for single-match logic**

There are several places in `SessionLobby.tsx` that hardcode `2` for single format. Update each:

- Line ~469: `session.players.length >= 8` (seat-full for tournament) — leave as-is (tournament handles its own count)
- Line ~565: `canStart` condition:
  ```ts
  const canStart =
    isHost && (format === 'single' ? session.players.length === requiredPlayers : session.players.length >= 2);
  ```
- Line ~817: "waiting for player" message:
  ```ts
  {session.players.length < requiredPlayers && !showBotForm && (
  ```
- Line ~823: Bot add button visibility condition — replace `< 2` with `< requiredPlayers`
- Line ~902: Host "take seat" button:
  ```ts
  {isHost && session.players.length < (format === 'single' ? requiredPlayers : 8) && (
  ```
- Line ~946: Warning when too many players for single:
  ```ts
  {format === 'single' && session.players.length > requiredPlayers && (
  ```
- Line ~1090: Spectator take-seat offer:
  ```ts
  {isSpectator && session.players.length < (format === 'single' ? requiredPlayers : 8) && (
  ```
- Line ~1097–1101: "not enough players" hint text:
  ```ts
  {session.players.length < requiredPlayers
    ? `Waiting for ${requiredPlayers - session.players.length} more player(s)...`
    : ...
  ```

**Step 3: Build frontend to verify no type errors**

```bash
npm run build:frontend
```

Expected: no errors.

**Step 4: Commit**

```bash
git add frontend/src/components/lobby/SessionLobby.tsx
git commit -m "feat(lobby): use game manifest playerCount instead of hardcoded 2 for single match sessions"
```

---

### Task 8: Update Bombermage board UI for 4 players

**Files:**
- Modify: `frontend/src/components/games/bombermage/BombermageBoard.tsx`
- Modify: `frontend/src/components/games/bombermage/BombermageControls.tsx`

The board and controls were built for 2 players. With 4 players, the player panels/HUD need to show all 4 players.

**Step 1: Read both files to understand current structure**

Before making changes, read `BombermageBoard.tsx` and `BombermageControls.tsx` to understand how they iterate/reference players. Look for:
- Any hardcoded `players[0]`/`players[1]` references
- Any `playerColors` arrays with 2 entries
- The HUD/panel layout

**Step 2: Update player color mapping**

The board likely uses a 2-color array. Update to a 4-color array matching the manifest:

```ts
const PLAYER_COLORS = ['#F97316', '#8B5CF6', '#22C55E', '#EC4899'];
```

**Step 3: Update HUD to show all players dynamically**

Rather than rendering 2 specific player panels, render all `board.players` dynamically:

```tsx
{board.players.map((player: any) => (
  <PlayerPanel key={player.playerNumber} player={player} isCurrentTurn={currentTurn === player.playerNumber} color={PLAYER_COLORS[player.playerNumber]} />
))}
```

The layout may need adjusting — for 4 players, consider a 2×2 grid of panels around the board, or a compact row of 4.

**Step 4: Build and visually verify**

```bash
npm run build:frontend
```

Confirm no build errors. Actual visual testing happens when running the dev server.

**Step 5: Commit**

```bash
git add frontend/src/components/games/bombermage/BombermageBoard.tsx frontend/src/components/games/bombermage/BombermageControls.tsx
git commit -m "feat(bombermage): update board and controls HUD for 4 players"
```

---

### Task 9: End-to-end smoke test

**Step 1: Start dev servers**

```bash
# Terminal 1
npm run dev:backend

# Terminal 2
npm run dev:frontend
```

**Step 2: Manual test checklist**

- [ ] Open `http://localhost:5173` — Bombermage lobby shows correctly
- [ ] Create a Bombermage session — lobby requires 4 players before "Start Game" activates
- [ ] Join with 3 additional browser tabs/windows using different names
- [ ] Start the game — board initializes with 4 players in 4 corners
- [ ] Each player can take turns in order: 0 → 1 → 2 → 3 → 0 → ...
- [ ] Open a Ur session with 2 players — still works exactly as before (regression test)
- [ ] In Bombermage, eliminate player 1 (set hp to 0 via manual board manipulation or play to that point) — turn skips player 1

**Step 3: Commit any fixes discovered during smoke test**

```bash
git add -A
git commit -m "fix(bombermage): smoke test fixes"
```

---

### Summary of files changed

| File | Change |
|------|--------|
| `shared/types/game.ts` | Add `getNextTurn` to `GameEngine` interface; update Bombermage manifest to 4 players + 4 colors |
| `backend/src/games/GameEngine.ts` | Add default `getNextTurn` implementation |
| `backend/src/games/bombermage/BombermageGame.ts` | `playerCount = 4`, override `getNextTurn`, update `initializeBoard` for 4 corners, update `checkWinCondition` |
| `backend/src/games/bombermage/BombermageGame.test.ts` | Tests for `getNextTurn` and 4-player win condition |
| `backend/src/socket/gameHandlers.ts` | Replace 3× `% 2` with `engine.getNextTurn`; fix seat-cap to use `engine.playerCount` |
| `frontend/src/components/lobby/SessionLobby.tsx` | Use `GAME_MANIFESTS[gameType].playerCount` instead of hardcoded `2` |
| `frontend/src/components/games/bombermage/BombermageBoard.tsx` | 4-player colors, dynamic player panels |
| `frontend/src/components/games/bombermage/BombermageControls.tsx` | 4-player HUD |
