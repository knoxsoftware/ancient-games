# Bombermage: Coins, Gamepad Controls & Bug Fixes Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add coin pickups with a board-cleared win condition, a gamepad control panel, powerup rebalancing (shield uniqueness), and fix two bugs (bomb-placement AP threshold, walking onto bomb cells).

**Architecture:** All game logic changes are in `backend/src/games/bombermage/BombermageGame.ts` and `shared/types/session.ts`. Frontend changes are in `BombermageBoard.tsx` (grid rendering, double-tap state, gamepad) and `BombermageControls.tsx` (score display). The gamepad sits below the board inside `BombermageBoard.tsx` so it shares the same move-emit helpers and double-tap state.

**Tech Stack:** TypeScript, React 18, Vitest (backend tests), Tailwind CSS, Socket.io

---

### Task 1: Shared types — add `coinDensity` and `coin` powerup variant

**Files:**
- Modify: `shared/types/session.ts`

**Step 1: Update `BombermageConfig` to include `coinDensity`**

In `shared/types/session.ts`, add `coinDensity` to the config interface:

```ts
export interface BombermageConfig {
  gridSize: BombermageGridSize;
  barrierDensity: BombermageBarrierDensity;
  powerupFrequency: 'rare' | 'normal' | 'common';
  enabledPowerups: BombermagePowerupType[];
  fuseLength: BombermageFuseLength;
  coinDensity: number; // 0–1, fraction of destructible boxes that hide a coin
}
```

**Step 2: Verify TypeScript compiles**

```bash
npm run build:backend 2>&1 | head -40
```
Expected: errors about `coinDensity` missing from usages — that's fine, we'll fix in the next task.

**Step 3: Commit**

```bash
git add shared/types/session.ts
git commit -m "feat(bombermage): add coinDensity to BombermageConfig type"
```

---

### Task 2: Backend — update DEFAULT_CONFIG, map generation, and BombermageState

**Files:**
- Modify: `backend/src/games/bombermage/BombermageGame.ts`

**Step 1: Add `score` to `BombermagePlayer` interface**

In `BombermageGame.ts`, update the `BombermagePlayer` interface:

```ts
export interface BombermagePlayer {
  playerNumber: number;
  position: Position;
  alive: boolean;
  inventory: {
    blastRadius: number;
    maxBombs: number;
    kickBomb: boolean;
    manualDetonation: boolean;
    shield: boolean;
    speedBoostTurnsRemaining: number;
  };
  activeBombCount: number;
  bankedAP: number;
  score: number; // coins collected
}
```

**Step 2: Update `DEFAULT_CONFIG` to include `coinDensity`**

```ts
const DEFAULT_CONFIG: BombermageConfig = {
  gridSize: '11x11',
  barrierDensity: 'normal',
  powerupFrequency: 'normal',
  enabledPowerups: [
    'blast-radius',
    'extra-bomb',
    'kick-bomb',
    'manual-detonation',
    'speed-boost',
    'shield',
  ],
  fuseLength: 3,
  coinDensity: 0.25,
};
```

**Step 3: Update `generateTerrain` to return a `coins` grid and enforce shield uniqueness**

Replace the `generateTerrain` function signature and body:

```ts
function generateTerrain(
  rows: number,
  cols: number,
  config: BombermageConfig,
): { terrain: TerrainCell[][]; powerups: (BombermagePowerupType | null)[][]; coins: boolean[][] } {
  const terrain: TerrainCell[][] = [];
  const powerups: (BombermagePowerupType | null)[][] = [];
  const coins: boolean[][] = [];
  const fillChance = BARRIER_FILL[config.barrierDensity];
  const powerupChance = POWERUP_CHANCE[config.powerupFrequency];
  const coinDensity = config.coinDensity ?? 0.25;
  let shieldPlaced = false;

  for (let r = 0; r < rows; r++) {
    terrain[r] = [];
    powerups[r] = [];
    coins[r] = [];
    for (let c = 0; c < cols; c++) {
      coins[r][c] = false;
      if (isClearZone(r, c, rows, cols)) {
        terrain[r][c] = 'empty';
        powerups[r][c] = null;
      } else if (r % 2 === 0 && c % 2 === 0) {
        terrain[r][c] = 'indestructible';
        powerups[r][c] = null;
      } else if (Math.random() < fillChance) {
        terrain[r][c] = 'destructible';
        // Assign powerup, enforcing at-most-one shield per map
        if (Math.random() < powerupChance && config.enabledPowerups.length > 0) {
          let candidates = config.enabledPowerups;
          if (shieldPlaced) {
            candidates = candidates.filter(p => p !== 'shield');
          }
          if (candidates.length > 0) {
            const idx = Math.floor(Math.random() * candidates.length);
            const chosen = candidates[idx];
            powerups[r][c] = chosen;
            if (chosen === 'shield') shieldPlaced = true;
          } else {
            powerups[r][c] = null;
          }
        } else {
          powerups[r][c] = null;
        }
        // Independently roll for coin (separate from powerup)
        if (Math.random() < coinDensity) {
          coins[r][c] = true;
        }
      } else {
        terrain[r][c] = 'empty';
        powerups[r][c] = null;
      }
    }
  }

  return { terrain, powerups, coins };
}
```

**Step 4: Update `initializeBoard` to include `coins` in board state and `score` in players**

```ts
initializeBoard(config: BombermageConfig = DEFAULT_CONFIG): BoardState {
  const [rows, cols] = GRID_DIMS[config.gridSize];
  const { terrain, powerups, coins } = generateTerrain(rows, cols, config);
  const corners = cornerPositions(rows, cols);

  const players: BombermagePlayer[] = [0, 1].map((pn) => ({
    playerNumber: pn,
    position: corners[pn],
    alive: true,
    inventory: defaultInventory(),
    activeBombCount: 0,
    bankedAP: 0,
    score: 0,
  }));

  const bombermage: BombermageState = {
    players,
    bombs: [],
    explosions: [],
    totalMoveCount: 0,
    config,
    actionPointsRemaining: null,
  };

  return {
    pieces: [],
    currentTurn: 0,
    diceRoll: null,
    lastMove: null,
    ...(bombermage as any),
    terrain,
    powerups,
    coins,
  };
}
```

**Step 5: Verify build compiles cleanly**

```bash
npm run build:backend 2>&1 | head -40
```
Expected: no errors.

**Step 6: Commit**

```bash
git add backend/src/games/bombermage/BombermageGame.ts shared/types/session.ts
git commit -m "feat(bombermage): add coins grid, score tracking, and shield uniqueness to map gen"
```

---

### Task 3: Backend — coin pickup, box-destroyed reveal, and board-cleared win condition

**Files:**
- Modify: `backend/src/games/bombermage/BombermageGame.ts`
- Modify: `backend/src/games/bombermage/BombermageGame.test.ts`

**Step 1: Write failing tests**

Open `backend/src/games/bombermage/BombermageGame.test.ts` and add:

```ts
describe('coin pickup', () => {
  it('increments player score when walking onto a coin cell', () => {
    const engine = new BombermageGame();
    const board = engine.initializeBoard() as any;
    // Place a coin adjacent to player 0's starting position
    const p0 = board.players[0];
    const dest = { row: p0.position.row + 1, col: p0.position.col };
    board.terrain[dest.row][dest.col] = 'empty';
    board.coins[dest.row][dest.col] = true;
    board.actionPointsRemaining = 3;
    board.diceRoll = 3;

    const move = { playerId: 'p1', pieceIndex: 0, from: 0, to: 0, extra: { type: 'move', dest } };
    const next = engine.applyMove(board, move) as any;

    expect(next.players[0].score).toBe(1);
    expect(next.coins[dest.row][dest.col]).toBe(false);
  });

  it('does not increment score on empty cell without coin', () => {
    const engine = new BombermageGame();
    const board = engine.initializeBoard() as any;
    const p0 = board.players[0];
    const dest = { row: p0.position.row + 1, col: p0.position.col };
    board.terrain[dest.row][dest.col] = 'empty';
    board.coins[dest.row][dest.col] = false;
    board.actionPointsRemaining = 3;
    board.diceRoll = 3;

    const move = { playerId: 'p1', pieceIndex: 0, from: 0, to: 0, extra: { type: 'move', dest } };
    const next = engine.applyMove(board, move) as any;

    expect(next.players[0].score).toBe(0);
  });
});

describe('board-cleared win condition', () => {
  it('returns higher-score player when no destructible cells remain and both alive', () => {
    const engine = new BombermageGame();
    const board = engine.initializeBoard() as any;
    // Clear all destructible terrain
    for (let r = 0; r < board.terrain.length; r++) {
      for (let c = 0; c < board.terrain[r].length; c++) {
        if (board.terrain[r][c] === 'destructible') board.terrain[r][c] = 'empty';
      }
    }
    board.players[0].score = 3;
    board.players[1].score = 1;

    expect(engine.checkWinCondition(board)).toBe(0);
  });

  it('returns null when destructible cells still remain', () => {
    const engine = new BombermageGame();
    const board = engine.initializeBoard() as any;
    // Ensure at least one destructible cell
    board.terrain[2][1] = 'destructible';

    expect(engine.checkWinCondition(board)).toBeNull();
  });

  it('player 0 wins tiebreak when scores equal and board cleared', () => {
    const engine = new BombermageGame();
    const board = engine.initializeBoard() as any;
    for (let r = 0; r < board.terrain.length; r++) {
      for (let c = 0; c < board.terrain[r].length; c++) {
        if (board.terrain[r][c] === 'destructible') board.terrain[r][c] = 'empty';
      }
    }
    board.players[0].score = 2;
    board.players[1].score = 2;

    expect(engine.checkWinCondition(board)).toBe(0);
  });
});
```

**Step 2: Run tests to verify they fail**

```bash
npm test --workspace=backend 2>&1 | grep -A 3 "coin pickup\|board-cleared"
```
Expected: FAIL — `score` property missing or logic not implemented.

**Step 3: Update `applyMove` 'move' handler to collect coins**

In the `if (type === 'move')` block, after the existing powerup pickup logic:

```ts
if (type === 'move') {
  const dest: Position = extra.dest;
  p.position = dest;
  bm.actionPointsRemaining = (bm.actionPointsRemaining ?? 0) - 1;
  const powerup = bm.powerups[dest.row][dest.col];
  if (powerup && bm.terrain[dest.row][dest.col] === 'empty') {
    this._applyPowerup(p, powerup);
    bm.powerups[dest.row][dest.col] = null;
  }
  // Collect coin if present
  if (bm.coins?.[dest.row]?.[dest.col]) {
    p.score = (p.score ?? 0) + 1;
    bm.coins[dest.row][dest.col] = false;
  }
}
```

**Step 4: Update `checkWinCondition` to add board-cleared win**

```ts
checkWinCondition(board: BoardState): number | null {
  const bm = board as any;
  const alivePlayers: BombermagePlayer[] = bm.players.filter((p: BombermagePlayer) => p.alive);
  if (alivePlayers.length === 1) return alivePlayers[0].playerNumber;
  if (alivePlayers.length === 0) return bm.currentTurn;

  // Board-cleared win: if no destructible cells remain, highest score wins
  const hasDestructible = bm.terrain?.some((row: TerrainCell[]) =>
    row.some((cell: TerrainCell) => cell === 'destructible')
  );
  if (!hasDestructible) {
    const scores = bm.players.map((p: BombermagePlayer) => p.score ?? 0);
    if (scores[0] >= scores[1]) return 0;
    return 1;
  }

  return null;
}
```

**Step 5: Run tests**

```bash
npm test --workspace=backend 2>&1 | tail -20
```
Expected: all tests pass.

**Step 6: Commit**

```bash
git add backend/src/games/bombermage/BombermageGame.ts backend/src/games/bombermage/BombermageGame.test.ts
git commit -m "feat(bombermage): coin pickup, board-cleared win condition"
```

---

### Task 4: Backend — fix the two movement bugs

**Files:**
- Modify: `backend/src/games/bombermage/BombermageGame.ts`
- Modify: `backend/src/games/bombermage/BombermageGame.test.ts`

**Step 1: Write failing tests**

```ts
describe('movement validation bugs', () => {
  it('rejects moving onto a cell that has a bomb', () => {
    const engine = new BombermageGame();
    const board = engine.initializeBoard() as any;
    const p0 = board.players[0];
    const dest = { row: p0.position.row + 1, col: p0.position.col };
    board.terrain[dest.row][dest.col] = 'empty';
    board.bombs = [{ position: dest, ownerPlayerNumber: 1, placedOnMove: 0, isManual: false }];
    board.actionPointsRemaining = 3;
    board.diceRoll = 3;

    const move = { playerId: 'p1', pieceIndex: 0, from: 0, to: 0, extra: { type: 'move', dest } };
    const player = { playerNumber: 0, id: 'p1' } as any;
    expect(engine.validateMove(board, move, player)).toBe(false);
  });

  it('allows placing a bomb with exactly 1 AP remaining', () => {
    const engine = new BombermageGame();
    const board = engine.initializeBoard() as any;
    board.actionPointsRemaining = 1;
    board.diceRoll = 1;
    const p0 = board.players[0];

    const move = {
      playerId: 'p1', pieceIndex: 0, from: 0, to: 0,
      extra: { type: 'place-bomb', dest: p0.position }
    };
    const player = { playerNumber: 0, id: 'p1' } as any;
    expect(engine.validateMove(board, move, player)).toBe(true);
  });
});
```

**Step 2: Run to verify they fail**

```bash
npm test --workspace=backend 2>&1 | grep -A 3 "movement validation bugs"
```
Expected: first test passes (may already block on terrain), second test passes (backend already uses `ap < 1`). If both pass already, note that the bomb-cell block was already partially covered and only the frontend needs fixing. Either way continue.

**Step 3: Fix backend `validateMove` 'move' — block bomb-occupied destination**

In the `if (type === 'move')` block, after the `occupied` check add a bomb check:

```ts
const hasBomb = bm.bombs.some(
  (b: Bomb) => b.position.row === dest.row && b.position.col === dest.col
);
if (hasBomb) return false;
```

Full updated move validation block:

```ts
if (type === 'move') {
  const ap = bm.actionPointsRemaining ?? 0;
  if (ap < 1) return false;
  const dest: Position = extra.dest;
  if (!dest) return false;
  const dr = Math.abs(dest.row - p.position.row);
  const dc = Math.abs(dest.col - p.position.col);
  if ((dr === 1 && dc === 0) || (dr === 0 && dc === 1)) {
    const cell = bm.terrain[dest.row]?.[dest.col];
    if (cell !== 'empty') return false;
    const occupied = bm.players.some(
      (other: BombermagePlayer) =>
        other.alive &&
        other.playerNumber !== player.playerNumber &&
        other.position.row === dest.row &&
        other.position.col === dest.col,
    );
    if (occupied) return false;
    const hasBomb = bm.bombs.some(
      (b: Bomb) => b.position.row === dest.row && b.position.col === dest.col
    );
    return !hasBomb;
  }
  return false;
}
```

**Step 4: Run tests**

```bash
npm test --workspace=backend 2>&1 | tail -20
```
Expected: all pass.

**Step 5: Commit**

```bash
git add backend/src/games/bombermage/BombermageGame.ts backend/src/games/bombermage/BombermageGame.test.ts
git commit -m "fix(bombermage): block movement onto bomb cells"
```

---

### Task 5: Frontend — fix AP threshold bug and bomb-cell movement guard

**Files:**
- Modify: `frontend/src/components/games/bombermage/BombermageBoard.tsx`

**Step 1: Fix `ap >= 2` → `ap >= 1` for bomb placement click**

In `handleCellClick`, line ~169, change:

```ts
// Before
if (r === me.position.row && c === me.position.col && ap >= 2) {

// After
if (r === me.position.row && c === me.position.col && ap >= 1) {
```

**Step 2: Fix movement click to block bomb-occupied cells**

In `handleCellClick`, the movement branch currently reads:

```ts
} else if (isAdjacent && terrain[r]?.[c] === 'empty' && ap >= 1) {
```

Add a bomb check:

```ts
const destHasBomb = bombs.some((b: any) => b.position.row === r && b.position.col === c);
} else if (isAdjacent && terrain[r]?.[c] === 'empty' && !destHasBomb && ap >= 1) {
```

Full updated `handleCellClick`:

```ts
function handleCellClick(r: number, c: number) {
  if (!isMyTurn || board.diceRoll === null) return;
  const ap = board.actionPointsRemaining ?? 0;
  const me = players[myPlayerNumber];
  if (!me) return;

  const isAdjacent =
    (Math.abs(r - me.position.row) === 1 && c === me.position.col) ||
    (Math.abs(c - me.position.col) === 1 && r === me.position.row);

  const destHasBomb = bombs.some((b: any) => b.position.row === r && b.position.col === c);
  const socket = socketService.getSocket();
  if (!socket) return;

  if (r === me.position.row && c === me.position.col && ap >= 1) {
    // handled by double-tap logic (added in Task 6)
  } else if (isAdjacent && terrain[r]?.[c] === 'empty' && !destHasBomb && ap >= 1) {
    socket.emit('game:move', {
      sessionCode: session.sessionCode,
      playerId,
      move: Object.assign({ playerId, pieceIndex: 0, from: 0, to: 0 }, { extra: { type: 'move', dest: { row: r, col: c } } }),
    });
  }
}
```

Note: the bomb-placement emit from the own-cell click is intentionally removed here — it will be re-added as the double-tap in Task 6.

**Step 3: Verify frontend builds**

```bash
npm run build:frontend 2>&1 | tail -20
```
Expected: no errors.

**Step 4: Commit**

```bash
git add frontend/src/components/games/bombermage/BombermageBoard.tsx
git commit -m "fix(bombermage): fix bomb placement AP threshold and block movement onto bomb cells"
```

---

### Task 6: Frontend — double-tap to place bomb + coin rendering + score in HUD

**Files:**
- Modify: `frontend/src/components/games/bombermage/BombermageBoard.tsx`
- Modify: `frontend/src/components/games/bombermage/BombermageControls.tsx`

**Step 1: Add double-tap state and bomb emit helper to BombermageBoard**

At the top of the `BombermageBoard` component, add:

```ts
const [pendingBomb, setPendingBomb] = React.useState(false);
const pendingBombTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);

function emitPlaceBomb() {
  const socket = socketService.getSocket();
  if (!socket) return;
  const me = players[myPlayerNumber];
  if (!me) return;
  socket.emit('game:move', {
    sessionCode: session.sessionCode,
    playerId,
    move: Object.assign({ playerId, pieceIndex: 0, from: 0, to: 0 }, {
      extra: { type: 'place-bomb', dest: { row: me.position.row, col: me.position.col } },
    }),
  });
  setPendingBomb(false);
  if (pendingBombTimer.current) clearTimeout(pendingBombTimer.current);
}

function handleBombTap() {
  if (!isMyTurn || board.diceRoll === null) return;
  const ap = board.actionPointsRemaining ?? 0;
  if (ap < 1) return;
  const me = players[myPlayerNumber];
  if (!me || me.activeBombCount >= me.inventory.maxBombs) return;

  if (pendingBomb) {
    emitPlaceBomb();
  } else {
    setPendingBomb(true);
    pendingBombTimer.current = setTimeout(() => setPendingBomb(false), 600);
  }
}
```

**Step 2: Update `handleCellClick` to use double-tap for own cell**

```ts
function handleCellClick(r: number, c: number) {
  if (!isMyTurn || board.diceRoll === null) return;
  const ap = board.actionPointsRemaining ?? 0;
  const me = players[myPlayerNumber];
  if (!me) return;

  const isAdjacent =
    (Math.abs(r - me.position.row) === 1 && c === me.position.col) ||
    (Math.abs(c - me.position.col) === 1 && r === me.position.row);

  const destHasBomb = bombs.some((b: any) => b.position.row === r && b.position.col === c);

  if (r === me.position.row && c === me.position.col) {
    handleBombTap();
    return;
  }

  // Any click not on own cell cancels pending bomb
  setPendingBomb(false);
  if (pendingBombTimer.current) clearTimeout(pendingBombTimer.current);

  const socket = socketService.getSocket();
  if (!socket) return;

  if (isAdjacent && terrain[r]?.[c] === 'empty' && !destHasBomb && ap >= 1) {
    socket.emit('game:move', {
      sessionCode: session.sessionCode,
      playerId,
      move: Object.assign({ playerId, pieceIndex: 0, from: 0, to: 0 }, { extra: { type: 'move', dest: { row: r, col: c } } }),
    });
  }
}
```

**Step 3: Render coins on the board**

Add to the `BombermageBoard` component near the other board data extractions:

```ts
const coins: boolean[][] = board.coins ?? [];
```

Inside the cell render (after the powerup span, before the bomb div), add:

```tsx
{!player && !bomb && terrain[r][c] === 'empty' && coins[r]?.[c] && (
  <span className="text-base leading-none">🪙</span>
)}
```

Also add a visual indicator when `pendingBomb` is true on the player's cell — give the player circle a pulsing ring:

```tsx
{player && (
  <div
    className={`w-7 h-7 rounded-full border-2 flex items-center justify-center text-xs font-bold text-white pointer-events-none${
      player.playerNumber === myPlayerNumber && pendingBomb ? ' animate-pulse ring-2 ring-yellow-400' : ''
    }`}
    style={{ backgroundColor: PLAYER_COLORS[player.playerNumber], borderColor: 'white' }}
  >
    {player.playerNumber + 1}
  </div>
)}
```

**Step 4: Update BombermageControls to show score**

In `BombermageControls.tsx`, in the `renderPlayerPanel` function, add a score line after the bomb count:

```tsx
<div className={`text-xs ${isMe ? 'text-yellow-300' : 'text-stone-500'}`}>
  🪙 {player.score ?? 0}
</div>
```

Also update the badges array to show score in inventory — score is shown inline so no badge needed.

**Step 5: Build and verify**

```bash
npm run build:frontend 2>&1 | tail -20
```
Expected: clean.

**Step 6: Commit**

```bash
git add frontend/src/components/games/bombermage/BombermageBoard.tsx frontend/src/components/games/bombermage/BombermageControls.tsx
git commit -m "feat(bombermage): double-tap bomb placement, coin rendering, score in HUD"
```

---

### Task 7: Frontend — gamepad control panel

**Files:**
- Modify: `frontend/src/components/games/bombermage/BombermageBoard.tsx`

**Step 1: Add `emitMove` helper and gamepad component inside BombermageBoard**

Add a helper function (alongside `emitPlaceBomb`):

```ts
function emitMove(dest: Position) {
  const socket = socketService.getSocket();
  if (!socket) return;
  socket.emit('game:move', {
    sessionCode: session.sessionCode,
    playerId,
    move: Object.assign({ playerId, pieceIndex: 0, from: 0, to: 0 }, { extra: { type: 'move', dest } }),
  });
}
```

**Step 2: Add `canMoveTo` helper**

```ts
function canMoveTo(dr: number, dc: number): boolean {
  if (!isMyTurn || board.diceRoll === null) return false;
  const ap = board.actionPointsRemaining ?? 0;
  if (ap < 1) return false;
  const me = players[myPlayerNumber];
  if (!me) return false;
  const r = me.position.row + dr;
  const c = me.position.col + dc;
  if (r < 0 || r >= terrain.length || c < 0 || c >= (terrain[0]?.length ?? 0)) return false;
  if (terrain[r]?.[c] !== 'empty') return false;
  if (bombs.some((b: any) => b.position.row === r && b.position.col === c)) return false;
  return true;
}
```

**Step 3: Add the gamepad JSX below the board grid**

Replace the existing hint text div with the full gamepad + hint layout:

```tsx
{/* Hint text */}
<div className="text-xs text-stone-500 text-center space-y-0.5" style={{ visibility: isMyTurn && board.diceRoll !== null ? 'visible' : 'hidden' }}>
  <div>Click board or use controls below</div>
</div>

{/* Gamepad controls — only shown on your turn */}
{isMyTurn && (
  <div className="flex items-center gap-8 mt-1 select-none">
    {/* D-pad */}
    <div className="grid grid-cols-3 gap-1" style={{ gridTemplateRows: 'repeat(3, 1fr)' }}>
      {/* Row 1: up */}
      <div />
      <button
        className="w-12 h-12 rounded-lg flex items-center justify-center text-xl font-bold transition-all active:scale-90 disabled:opacity-30"
        style={{ background: canMoveTo(-1, 0) ? '#334155' : '#1e293b', color: '#e2e8f0', border: '2px solid #475569' }}
        disabled={!canMoveTo(-1, 0)}
        onClick={() => { const me = players[myPlayerNumber]; if (me) emitMove({ row: me.position.row - 1, col: me.position.col }); }}
        onTouchEnd={(e) => { e.preventDefault(); const me = players[myPlayerNumber]; if (me && canMoveTo(-1, 0)) emitMove({ row: me.position.row - 1, col: me.position.col }); }}
      >↑</button>
      <div />
      {/* Row 2: left, center (empty), right */}
      <button
        className="w-12 h-12 rounded-lg flex items-center justify-center text-xl font-bold transition-all active:scale-90 disabled:opacity-30"
        style={{ background: canMoveTo(0, -1) ? '#334155' : '#1e293b', color: '#e2e8f0', border: '2px solid #475569' }}
        disabled={!canMoveTo(0, -1)}
        onClick={() => { const me = players[myPlayerNumber]; if (me) emitMove({ row: me.position.row, col: me.position.col - 1 }); }}
        onTouchEnd={(e) => { e.preventDefault(); const me = players[myPlayerNumber]; if (me && canMoveTo(0, -1)) emitMove({ row: me.position.row, col: me.position.col - 1 }); }}
      >←</button>
      <div className="w-12 h-12 rounded-lg" style={{ background: '#0f172a', border: '2px solid #1e293b' }} />
      <button
        className="w-12 h-12 rounded-lg flex items-center justify-center text-xl font-bold transition-all active:scale-90 disabled:opacity-30"
        style={{ background: canMoveTo(0, 1) ? '#334155' : '#1e293b', color: '#e2e8f0', border: '2px solid #475569' }}
        disabled={!canMoveTo(0, 1)}
        onClick={() => { const me = players[myPlayerNumber]; if (me) emitMove({ row: me.position.row, col: me.position.col + 1 }); }}
        onTouchEnd={(e) => { e.preventDefault(); const me = players[myPlayerNumber]; if (me && canMoveTo(0, 1)) emitMove({ row: me.position.row, col: me.position.col + 1 }); }}
      >→</button>
      {/* Row 3: down */}
      <div />
      <button
        className="w-12 h-12 rounded-lg flex items-center justify-center text-xl font-bold transition-all active:scale-90 disabled:opacity-30"
        style={{ background: canMoveTo(1, 0) ? '#334155' : '#1e293b', color: '#e2e8f0', border: '2px solid #475569' }}
        disabled={!canMoveTo(1, 0)}
        onClick={() => { const me = players[myPlayerNumber]; if (me) emitMove({ row: me.position.row + 1, col: me.position.col }); }}
        onTouchEnd={(e) => { e.preventDefault(); const me = players[myPlayerNumber]; if (me && canMoveTo(1, 0)) emitMove({ row: me.position.row + 1, col: me.position.col }); }}
      >↓</button>
      <div />
    </div>

    {/* Bomb button — separated to avoid accidental press */}
    <button
      className={`w-16 h-16 rounded-full flex items-center justify-center text-3xl transition-all active:scale-90 disabled:opacity-30${pendingBomb ? ' animate-pulse ring-4 ring-yellow-400' : ''}`}
      style={{
        background: pendingBomb ? '#78350f' : '#7c2d12',
        border: `3px solid ${pendingBomb ? '#fbbf24' : '#c2410c'}`,
      }}
      disabled={!isMyTurn || board.diceRoll === null || (board.actionPointsRemaining ?? 0) < 1 || !players[myPlayerNumber] || players[myPlayerNumber].activeBombCount >= players[myPlayerNumber].inventory.maxBombs}
      onClick={handleBombTap}
      onTouchEnd={(e) => { e.preventDefault(); handleBombTap(); }}
    >
      💣
    </button>
  </div>
)}
```

**Step 4: Build**

```bash
npm run build:frontend 2>&1 | tail -20
```
Expected: clean.

**Step 5: Commit**

```bash
git add frontend/src/components/games/bombermage/BombermageBoard.tsx
git commit -m "feat(bombermage): gamepad d-pad and bomb button below board"
```

---

### Task 8: Frontend — add coinDensity to lobby config UI

**Files:**
- Glob for the Bombermage lobby/config component: `frontend/src/components/**/*ombermage*`
- Likely: `frontend/src/components/games/bombermage/BombermageControls.tsx` or a session creation form

**Step 1: Find the lobby config UI**

```bash
grep -r "barrierDensity\|powerupFrequency\|fuseLength" frontend/src --include="*.tsx" -l
```

**Step 2: Add coinDensity select**

In whatever component renders the Bombermage config options, add alongside the other selects:

```tsx
<label className="flex flex-col gap-1">
  <span className="text-xs text-stone-400">Coin Density</span>
  <select
    value={config.coinDensity ?? 0.25}
    onChange={(e) => setConfig({ ...config, coinDensity: parseFloat(e.target.value) })}
    className="bg-stone-800 border border-stone-600 rounded px-2 py-1 text-sm text-white"
  >
    <option value={0}>None (0%)</option>
    <option value={0.1}>Rare (10%)</option>
    <option value={0.25}>Normal (25%)</option>
    <option value={0.4}>Common (40%)</option>
  </select>
</label>
```

**Step 3: Build**

```bash
npm run build 2>&1 | tail -20
```
Expected: clean full build.

**Step 4: Commit**

```bash
git add frontend/src/components/
git commit -m "feat(bombermage): add coinDensity option to lobby config"
```

---

### Task 9: Final verification

**Step 1: Run all tests**

```bash
npm test --workspace=backend 2>&1 | tail -20
```
Expected: all pass, no failures.

**Step 2: Full build**

```bash
npm run build 2>&1 | tail -10
```
Expected: clean.

**Step 3: Lint**

```bash
npm run lint 2>&1 | tail -20
```
Fix any issues found before final commit.

**Step 4: Final commit if any lint fixes**

```bash
git add -A
git commit -m "chore(bombermage): lint fixes"
```
