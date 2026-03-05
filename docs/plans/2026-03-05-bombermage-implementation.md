# Bombermage Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add Bombermage — a 2-player dice-driven Bomberman-style board game — to the Ancient Games platform.

**Architecture:** Layered BoardState stored in `BoardState` fields (terrain, bombs, explosions, players as custom fields). The engine extends `GameEngine` and stores all Bombermage-specific state alongside minimal `pieces: []`. Frontend renders a CSS grid with layered cells and a dedicated controls component for AP management.

**Tech Stack:** TypeScript, Node.js/Express/Socket.io (backend), React 18/Vite/Tailwind (frontend), Vitest (tests), `@ancient-games/shared` for shared types.

---

## Task 1: Add shared types

**Files:**
- Modify: `shared/types/game.ts`
- Modify: `shared/types/session.ts`

**Step 1: Add `'bombermage'` to the `GameType` union** in `shared/types/game.ts`:

```typescript
export type GameType =
  | 'ur'
  | 'senet'
  | 'morris'
  | 'wolves-and-ravens'
  | 'rock-paper-scissors'
  | 'stellar-siege'
  | 'fox-and-geese'
  | 'mancala'
  | 'go'
  | 'ur-roguelike'
  | 'bombermage';
```

**Step 2: Add the `GameManifest` entry** to `GAME_MANIFESTS` in the same file:

```typescript
bombermage: {
  type: 'bombermage',
  title: 'Bombermage',
  emoji: '💣',
  description: '2 players · bomb tactics',
  playerColors: ['#F97316', '#8B5CF6'],
},
```

**Step 3: Add `BombermageConfig` to `shared/types/session.ts`** (add after the existing interfaces):

```typescript
export type BombermageGridSize = '9x9' | '11x11' | '13x11';
export type BombermageBarrierDensity = 'sparse' | 'normal' | 'dense';
export type BombermakePowerupFrequency = 'rare' | 'normal' | 'common';
export type BombermageFuseLength = 2 | 3 | 4;
export type BombermagePowerupType =
  | 'blast-radius'
  | 'extra-bomb'
  | 'kick-bomb'
  | 'manual-detonation'
  | 'speed-boost'
  | 'shield';

export interface BombermageConfig {
  gridSize: BombermageGridSize;
  barrierDensity: BombermageBarrierDensity;
  powerupFrequency: 'rare' | 'normal' | 'common';
  enabledPowerups: BombermagePowerupType[];
  fuseLength: BombermageFuseLength;
}
```

**Step 4: Add `gameOptions` to the `Session` interface** in `shared/types/session.ts`:

```typescript
export interface Session {
  // ... existing fields ...
  gameOptions?: BombermageConfig; // generic game options, only populated for games that use them
}
```

**Step 5: Build shared package to verify no type errors**

Run: `npm run build --workspace=shared`
Expected: exits 0 with no errors

**Step 6: Commit**

```bash
git add shared/types/game.ts shared/types/session.ts
git commit -m "feat(shared): add Bombermage game type and config types"
```

---

## Task 2: Create the Bombermage game engine — types and map generation

**Files:**
- Create: `backend/src/games/bombermage/BombermageGame.ts`
- Create: `backend/src/games/bombermage/BombermageGame.test.ts`

**Step 1: Write failing test for map generation**

In `backend/src/games/bombermage/BombermageGame.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { BombermageGame } from './BombermageGame';

describe('BombermageGame - initializeBoard', () => {
  const game = new BombermageGame();

  it('initializes with default 11x11 grid', () => {
    const board = game.initializeBoard();
    const state = board as any;
    expect(state.terrain).toHaveLength(11);
    expect(state.terrain[0]).toHaveLength(11);
  });

  it('places indestructible pillars at even row/col intersections', () => {
    const board = game.initializeBoard() as any;
    expect(board.terrain[0][0]).toBe('indestructible');
    expect(board.terrain[0][2]).toBe('indestructible');
    expect(board.terrain[2][2]).toBe('indestructible');
    expect(board.terrain[1][1]).not.toBe('indestructible');
  });

  it('guarantees player corners are clear (3x3 zone)', () => {
    // Run many times to be confident against randomness
    for (let i = 0; i < 20; i++) {
      const board = game.initializeBoard() as any;
      const { rows, cols } = getDimensions(board.terrain);
      // Top-left corner: (0,0) to (1,1) must not be destructible
      expect(board.terrain[0][1]).not.toBe('destructible');
      expect(board.terrain[1][0]).not.toBe('destructible');
      // Top-right corner
      expect(board.terrain[0][cols - 2]).not.toBe('destructible');
      expect(board.terrain[1][cols - 1]).not.toBe('destructible');
      // Bottom-left corner
      expect(board.terrain[rows - 2][0]).not.toBe('destructible');
      expect(board.terrain[rows - 1][1]).not.toBe('destructible');
      // Bottom-right corner
      expect(board.terrain[rows - 2][cols - 1]).not.toBe('destructible');
      expect(board.terrain[rows - 1][cols - 2]).not.toBe('destructible');
    }
  });

  it('places players in corners', () => {
    const board = game.initializeBoard() as any;
    const { rows, cols } = getDimensions(board.terrain);
    const positions = board.bombermage.players.map((p: any) => `${p.position.row},${p.position.col}`);
    expect(positions).toContain('0,0');
    expect(positions).toContain(`${rows - 1},${cols - 1}`);
  });

  it('initializes players with default inventory', () => {
    const board = game.initializeBoard() as any;
    const player = board.bombermage.players[0];
    expect(player.alive).toBe(true);
    expect(player.inventory.blastRadius).toBe(1);
    expect(player.inventory.maxBombs).toBe(1);
    expect(player.inventory.kickBomb).toBe(false);
    expect(player.inventory.shield).toBe(false);
    expect(player.activeBombCount).toBe(0);
  });

  it('starts with no bombs or explosions', () => {
    const board = game.initializeBoard() as any;
    expect(board.bombermage.bombs).toHaveLength(0);
    expect(board.bombermage.explosions).toHaveLength(0);
    expect(board.bombermage.totalMoveCount).toBe(0);
  });
});

function getDimensions(terrain: string[][]): { rows: number; cols: number } {
  return { rows: terrain.length, cols: terrain[0].length };
}
```

**Step 2: Run test to verify it fails**

```bash
npm test --workspace=backend -- --reporter=verbose BombermageGame
```
Expected: FAIL — `BombermageGame` not found

**Step 3: Create the engine file** at `backend/src/games/bombermage/BombermageGame.ts`:

```typescript
import { GameEngine } from '../GameEngine';
import { BoardState, Move, Player, GameType } from '@ancient-games/shared';
import {
  BombermageConfig,
  BombermagePowerupType,
  BombermageGridSize,
} from '@ancient-games/shared';

// ── Types ────────────────────────────────────────────────────────────────────

export type TerrainCell = 'empty' | 'indestructible' | 'destructible';

export interface Position {
  row: number;
  col: number;
}

export interface Bomb {
  position: Position;
  ownerPlayerNumber: number;
  placedOnMove: number;
  isManual: boolean;
}

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
}

export interface BombermageState {
  players: BombermagePlayer[];
  bombs: Bomb[];
  explosions: Position[];
  totalMoveCount: number;
  config: BombermageConfig;
  actionPointsRemaining: number | null; // null = dice not yet rolled
  pendingExplosions: Position[]; // cells hit this turn, cleared next turn
}

// ── Constants ────────────────────────────────────────────────────────────────

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
};

const GRID_DIMS: Record<BombermageGridSize, [number, number]> = {
  '9x9': [9, 9],
  '11x11': [11, 11],
  '13x11': [11, 13],
};

const BARRIER_FILL: Record<string, number> = {
  sparse: 0.4,
  normal: 0.65,
  dense: 0.85,
};

const POWERUP_CHANCE: Record<string, number> = {
  rare: 0.15,
  normal: 0.3,
  common: 0.5,
};

// ── Map generation helpers ───────────────────────────────────────────────────

function isClearZone(row: number, col: number, rows: number, cols: number): boolean {
  // 2-square clear zone in each corner (excludes pillars at 0,0 etc which are indestructible anyway)
  const nearTop = row <= 1;
  const nearBottom = row >= rows - 2;
  const nearLeft = col <= 1;
  const nearRight = col >= cols - 2;
  return (nearTop && nearLeft) || (nearTop && nearRight) || (nearBottom && nearLeft) || (nearBottom && nearRight);
}

function generateTerrain(
  rows: number,
  cols: number,
  config: BombermageConfig,
): { terrain: TerrainCell[][]; powerups: (BombermagePowerupType | null)[][] } {
  const terrain: TerrainCell[][] = [];
  const powerups: (BombermagePowerupType | null)[][] = [];
  const fillChance = BARRIER_FILL[config.barrierDensity];
  const powerupChance = POWERUP_CHANCE[config.powerupFrequency];

  for (let r = 0; r < rows; r++) {
    terrain[r] = [];
    powerups[r] = [];
    for (let c = 0; c < cols; c++) {
      // Indestructible pillar at even-row, even-col intersections
      if (r % 2 === 0 && c % 2 === 0) {
        terrain[r][c] = 'indestructible';
        powerups[r][c] = null;
      } else if (isClearZone(r, c, rows, cols)) {
        terrain[r][c] = 'empty';
        powerups[r][c] = null;
      } else if (Math.random() < fillChance) {
        terrain[r][c] = 'destructible';
        // Assign hidden powerup
        if (Math.random() < powerupChance && config.enabledPowerups.length > 0) {
          const idx = Math.floor(Math.random() * config.enabledPowerups.length);
          powerups[r][c] = config.enabledPowerups[idx];
        } else {
          powerups[r][c] = null;
        }
      } else {
        terrain[r][c] = 'empty';
        powerups[r][c] = null;
      }
    }
  }

  return { terrain, powerups };
}

function cornerPositions(rows: number, cols: number): Position[] {
  return [
    { row: 0, col: 0 },
    { row: rows - 1, col: cols - 1 },
  ];
}

function defaultInventory() {
  return {
    blastRadius: 1,
    maxBombs: 1,
    kickBomb: false,
    manualDetonation: false,
    shield: false,
    speedBoostTurnsRemaining: 0,
  };
}

// ── Engine ───────────────────────────────────────────────────────────────────

export class BombermageGame extends GameEngine {
  gameType: GameType = 'bombermage';
  playerCount = 2;

  initializeBoard(config: BombermageConfig = DEFAULT_CONFIG): BoardState {
    const [rows, cols] = GRID_DIMS[config.gridSize];
    const { terrain, powerups } = generateTerrain(rows, cols, config);
    const corners = cornerPositions(rows, cols);

    const players: BombermagePlayer[] = [0, 1].map((pn) => ({
      playerNumber: pn,
      position: corners[pn],
      alive: true,
      inventory: defaultInventory(),
      activeBombCount: 0,
    }));

    const bombermage: BombermageState = {
      players,
      bombs: [],
      explosions: [],
      totalMoveCount: 0,
      config,
      actionPointsRemaining: null,
      pendingExplosions: [],
    };

    return {
      pieces: [],
      currentTurn: 0,
      diceRoll: null,
      lastMove: null,
      // Store all bombermage state here — BoardState.extra is Schema.Types.Mixed
      ...(bombermage as any),
      terrain,
      powerups,
    };
  }

  rollDice(): number {
    return Math.floor(Math.random() * 6) + 1;
  }

  getValidMoves(board: BoardState, playerNumber: number, diceRoll: number): Move[] {
    // Returns placeholder — actual validation is click-based in frontend.
    // Server validates each submitted move individually via validateMove.
    return [{ playerId: '', pieceIndex: 0, from: 0, to: 0 }];
  }

  canMove(board: BoardState, playerNumber: number, diceRoll: number): boolean {
    return true; // Player always has options (move or pass)
  }

  validateMove(board: BoardState, move: Move, player: Player): boolean {
    if (player.playerNumber !== board.currentTurn) return false;
    if (board.diceRoll === null) return false;
    const state = board as any;
    const bm: BombermageState = state;
    const p = bm.players[player.playerNumber];
    if (!p || !p.alive) return false;

    const extra = (move as any).extra ?? {};
    const type: string = extra.type ?? 'move';

    if (type === 'move') {
      const ap = bm.actionPointsRemaining ?? 0;
      if (ap < 1) return false;
      const dest: Position = extra.dest;
      if (!dest) return false;
      // Must be adjacent (cardinal)
      const dr = Math.abs(dest.row - p.position.row);
      const dc = Math.abs(dest.col - p.position.col);
      if ((dr === 1 && dc === 0) || (dr === 0 && dc === 1)) {
        const cell = state.terrain[dest.row]?.[dest.col];
        return cell === 'empty';
      }
      return false;
    }

    if (type === 'place-bomb') {
      const ap = bm.actionPointsRemaining ?? 0;
      if (ap < 2) return false;
      if (p.activeBombCount >= p.inventory.maxBombs) return false;
      // Can only place on current position
      const dest: Position = extra.dest ?? p.position;
      return dest.row === p.position.row && dest.col === p.position.col;
    }

    if (type === 'kick-bomb') {
      if (!p.inventory.kickBomb) return false;
      const ap = bm.actionPointsRemaining ?? 0;
      if (ap < 1) return false;
      const bombIndex: number = extra.bombIndex;
      return bm.bombs[bombIndex]?.ownerPlayerNumber === player.playerNumber;
    }

    if (type === 'detonate') {
      if (!p.inventory.manualDetonation) return false;
      const bombIndex: number = extra.bombIndex;
      const bomb = bm.bombs[bombIndex];
      return bomb?.ownerPlayerNumber === player.playerNumber && bomb?.isManual === true;
    }

    if (type === 'end-turn') {
      return true;
    }

    return false;
  }

  applyMove(board: BoardState, move: Move): BoardState {
    const state = JSON.parse(JSON.stringify(board)); // deep clone
    const bm = state as any;
    const extra = (move as any).extra ?? {};
    const type: string = extra.type ?? 'move';
    const playerNumber = board.currentTurn;
    const p = bm.players[playerNumber];

    // Clear previous turn explosions
    bm.explosions = bm.pendingExplosions ?? [];
    bm.pendingExplosions = [];

    if (type === 'move') {
      const dest: Position = extra.dest;
      p.position = dest;
      bm.actionPointsRemaining = (bm.actionPointsRemaining ?? 0) - 1;
      // Collect powerup if present
      const powerup = bm.powerups[dest.row][dest.col];
      if (powerup && bm.terrain[dest.row][dest.col] === 'empty') {
        this._applyPowerup(p, powerup);
        bm.powerups[dest.row][dest.col] = null;
      }
    } else if (type === 'place-bomb') {
      const bomb: Bomb = {
        position: { ...p.position },
        ownerPlayerNumber: playerNumber,
        placedOnMove: bm.totalMoveCount,
        isManual: false,
      };
      bm.bombs.push(bomb);
      p.activeBombCount++;
      bm.actionPointsRemaining = (bm.actionPointsRemaining ?? 0) - 2;
    } else if (type === 'kick-bomb') {
      const bombIndex: number = extra.bombIndex;
      const dir: string = extra.direction; // 'up'|'down'|'left'|'right'
      const bomb = bm.bombs[bombIndex];
      if (bomb) {
        const delta = dirToDelta(dir);
        let nr = bomb.position.row + delta[0];
        let nc = bomb.position.col + delta[1];
        while (
          nr >= 0 && nr < bm.terrain.length &&
          nc >= 0 && nc < bm.terrain[0].length &&
          bm.terrain[nr][nc] === 'empty' &&
          !bm.bombs.some((b: Bomb) => b.position.row === nr && b.position.col === nc)
        ) {
          bomb.position = { row: nr, col: nc };
          nr += delta[0];
          nc += delta[1];
        }
      }
      bm.actionPointsRemaining = (bm.actionPointsRemaining ?? 0) - 1;
    } else if (type === 'detonate') {
      const bombIndex: number = extra.bombIndex;
      this._detonateBomb(bm, bombIndex);
    } else if (type === 'end-turn') {
      // Advance turn
      bm.totalMoveCount++;
      bm.currentTurn = 1 - playerNumber;
      bm.diceRoll = null;
      bm.actionPointsRemaining = null;
      // Resolve any bombs whose fuse has expired
      this._resolveExpiredBombs(bm);
      return state;
    }

    // If AP hits 0, auto-advance turn
    if ((bm.actionPointsRemaining ?? 1) <= 0) {
      bm.totalMoveCount++;
      bm.currentTurn = 1 - playerNumber;
      bm.diceRoll = null;
      bm.actionPointsRemaining = null;
      this._resolveExpiredBombs(bm);
    }

    return state;
  }

  checkWinCondition(board: BoardState): number | null {
    const bm = board as any;
    const alivePlayers: BombermagePlayer[] = bm.players.filter((p: BombermagePlayer) => p.alive);
    if (alivePlayers.length === 1) return alivePlayers[0].playerNumber;
    if (alivePlayers.length === 0) return bm.currentTurn; // last to act wins on mutual destruction
    return null;
  }

  isCaptureMove(board: BoardState, move: Move): boolean {
    return false;
  }

  // ── Private helpers ──────────────────────────────────────────────────────

  private _applyPowerup(player: BombermagePlayer, powerup: BombermagePowerupType): void {
    switch (powerup) {
      case 'blast-radius': player.inventory.blastRadius++; break;
      case 'extra-bomb': player.inventory.maxBombs++; break;
      case 'kick-bomb': player.inventory.kickBomb = true; break;
      case 'manual-detonation': player.inventory.manualDetonation = true; break;
      case 'speed-boost': player.inventory.speedBoostTurnsRemaining += 3; break;
      case 'shield': player.inventory.shield = true; break;
    }
  }

  private _detonateBomb(bm: any, bombIndex: number): void {
    const bomb: Bomb = bm.bombs[bombIndex];
    if (!bomb) return;
    const owner: BombermagePlayer = bm.players[bomb.ownerPlayerNumber];
    const radius = owner?.inventory.blastRadius ?? 1;
    const blastCells = this._calcBlast(bm.terrain, bomb.position, radius);
    bm.pendingExplosions.push(...blastCells);
    // Destroy barriers
    for (const cell of blastCells) {
      if (bm.terrain[cell.row][cell.col] === 'destructible') {
        bm.terrain[cell.row][cell.col] = 'empty';
        // Powerup is now revealed (stays in powerups array, player walks over to collect)
      }
    }
    // Hit players
    for (const player of bm.players) {
      if (!player.alive) continue;
      if (blastCells.some((c: Position) => c.row === player.position.row && c.col === player.position.col)) {
        if (player.inventory.shield) {
          player.inventory.shield = false;
        } else {
          player.alive = false;
        }
      }
    }
    // Remove bomb
    bm.bombs.splice(bombIndex, 1);
    if (owner) owner.activeBombCount = Math.max(0, owner.activeBombCount - 1);
  }

  private _resolveExpiredBombs(bm: any): void {
    const fuseLength: number = bm.config?.fuseLength ?? 3;
    const toDetonate: number[] = [];
    for (let i = 0; i < bm.bombs.length; i++) {
      const bomb: Bomb = bm.bombs[i];
      if (!bomb.isManual && bm.totalMoveCount >= bomb.placedOnMove + fuseLength) {
        toDetonate.push(i);
      }
    }
    // Detonate in reverse order to keep indices stable
    for (let i = toDetonate.length - 1; i >= 0; i--) {
      this._detonateBomb(bm, toDetonate[i]);
    }
  }

  private _calcBlast(terrain: TerrainCell[][], center: Position, radius: number): Position[] {
    const cells: Position[] = [center];
    const dirs = [[-1, 0], [1, 0], [0, -1], [0, 1]];
    for (const [dr, dc] of dirs) {
      for (let i = 1; i <= radius; i++) {
        const r = center.row + dr * i;
        const c = center.col + dc * i;
        if (r < 0 || r >= terrain.length || c < 0 || c >= terrain[0].length) break;
        if (terrain[r][c] === 'indestructible') break;
        cells.push({ row: r, col: c });
        if (terrain[r][c] === 'destructible') break; // blast stops after destroying barrier
      }
    }
    return cells;
  }
}

function dirToDelta(dir: string): [number, number] {
  switch (dir) {
    case 'up': return [-1, 0];
    case 'down': return [1, 0];
    case 'left': return [0, -1];
    case 'right': return [0, 1];
    default: return [0, 0];
  }
}
```

**Step 4: Run tests to verify they pass**

```bash
npm test --workspace=backend -- --reporter=verbose BombermageGame
```
Expected: all tests PASS

**Step 5: Commit**

```bash
git add backend/src/games/bombermage/
git commit -m "feat(backend): add Bombermage game engine with map generation"
```

---

## Task 3: Add bomb and explosion tests

**Files:**
- Modify: `backend/src/games/bombermage/BombermageGame.test.ts`

**Step 1: Add tests for bomb placement and detonation**

Append to the test file:

```typescript
describe('BombermageGame - bomb mechanics', () => {
  const game = new BombermageGame();

  it('places a bomb on player position', () => {
    const board = game.initializeBoard() as any;
    board.diceRoll = 4;
    board.actionPointsRemaining = 4;
    const move = { playerId: 'p1', pieceIndex: 0, from: 0, to: 0, extra: { type: 'place-bomb', dest: { row: 0, col: 0 } } };
    const after = game.applyMove(board, move) as any;
    expect(after.bombs).toHaveLength(1);
    expect(after.players[0].activeBombCount).toBe(1);
    expect(after.actionPointsRemaining).toBe(2); // 4 - 2
  });

  it('blast destroys destructible terrain and reveals powerup', () => {
    const board = game.initializeBoard() as any;
    // Manually place a destructible barrier next to player 0
    board.terrain[0][1] = 'destructible';
    board.powerups[0][1] = 'blast-radius';
    board.diceRoll = 4;
    board.actionPointsRemaining = 4;
    // Place bomb at player position (0,0)
    const placeBomb = { playerId: 'p1', pieceIndex: 0, from: 0, to: 0, extra: { type: 'place-bomb', dest: { row: 0, col: 0 } } };
    let after = game.applyMove(board, placeBomb) as any;
    // Advance totalMoveCount past fuseLength by calling end-turn multiple times
    after.diceRoll = 1;
    after.actionPointsRemaining = 1;
    const endTurn = { playerId: 'p1', pieceIndex: 0, from: 0, to: 0, extra: { type: 'end-turn' } };
    // Move both players for fuseLength turns
    for (let i = 0; i < 3; i++) {
      after.currentTurn = after.currentTurn; // just resolve
      after.diceRoll = 1;
      after.actionPointsRemaining = 1;
      after = game.applyMove(after, endTurn);
    }
    // After fuse expires, terrain should be empty
    expect(after.terrain[0][1]).toBe('empty');
  });

  it('blast eliminates a player in range', () => {
    const board = game.initializeBoard() as any;
    // Move player 1 to (0,1) manually
    board.players[1].position = { row: 0, col: 1 };
    board.terrain[0][1] = 'empty';
    board.diceRoll = 4;
    board.actionPointsRemaining = 4;
    const placeBomb = { playerId: 'p1', pieceIndex: 0, from: 0, to: 0, extra: { type: 'place-bomb', dest: { row: 0, col: 0 } } };
    let after = game.applyMove(board, placeBomb) as any;
    const endTurn = { playerId: 'p1', pieceIndex: 0, from: 0, to: 0, extra: { type: 'end-turn' } };
    for (let i = 0; i < 3; i++) {
      after.diceRoll = 1;
      after.actionPointsRemaining = 1;
      after = game.applyMove(after, endTurn);
    }
    expect(after.players[1].alive).toBe(false);
  });

  it('shield absorbs one blast', () => {
    const board = game.initializeBoard() as any;
    board.players[1].position = { row: 0, col: 1 };
    board.players[1].inventory.shield = true;
    board.terrain[0][1] = 'empty';
    board.diceRoll = 4;
    board.actionPointsRemaining = 4;
    const placeBomb = { playerId: 'p1', pieceIndex: 0, from: 0, to: 0, extra: { type: 'place-bomb', dest: { row: 0, col: 0 } } };
    let after = game.applyMove(board, placeBomb) as any;
    const endTurn = { playerId: 'p1', pieceIndex: 0, from: 0, to: 0, extra: { type: 'end-turn' } };
    for (let i = 0; i < 3; i++) {
      after.diceRoll = 1;
      after.actionPointsRemaining = 1;
      after = game.applyMove(after, endTurn);
    }
    expect(after.players[1].alive).toBe(true);
    expect(after.players[1].inventory.shield).toBe(false);
  });
});

describe('BombermageGame - checkWinCondition', () => {
  const game = new BombermageGame();

  it('returns null when both players alive', () => {
    const board = game.initializeBoard();
    expect(game.checkWinCondition(board)).toBeNull();
  });

  it('returns winner when one player dead', () => {
    const board = game.initializeBoard() as any;
    board.players[1].alive = false;
    expect(game.checkWinCondition(board)).toBe(0);
  });
});
```

**Step 2: Run tests**

```bash
npm test --workspace=backend -- --reporter=verbose BombermageGame
```
Expected: all tests PASS

**Step 3: Commit**

```bash
git add backend/src/games/bombermage/BombermageGame.test.ts
git commit -m "test(backend): add Bombermage bomb mechanics and win condition tests"
```

---

## Task 4: Register the game engine

**Files:**
- Modify: `backend/src/games/GameRegistry.ts`

**Step 1: Add import and registration**

At the top, add:
```typescript
import { BombermageGame } from './bombermage/BombermageGame';
```

In the `Map` constructor, add:
```typescript
['bombermage', new BombermageGame() as GameEngine],
```

**Step 2: Build backend to verify no type errors**

```bash
npm run build:backend
```
Expected: exits 0

**Step 3: Commit**

```bash
git add backend/src/games/GameRegistry.ts
git commit -m "feat(backend): register Bombermage in GameRegistry"
```

---

## Task 5: Create the frontend board component

**Files:**
- Create: `frontend/src/components/games/bombermage/BombermageBoard.tsx`

This is the core visual component. It renders the grid as layered cells.

```tsx
import { Session, GameState } from '@ancient-games/shared';
import { socketService } from '../../../services/socket';
import { PLAYER_ID_KEY } from '../../../services/storage';

interface Props {
  session: Session;
  gameState: GameState;
  playerId: string;
  isMyTurn: boolean;
}

type TerrainCell = 'empty' | 'indestructible' | 'destructible';
interface Position { row: number; col: number; }

const CELL_SIZE = 44; // px

const TERRAIN_STYLE: Record<TerrainCell, string> = {
  empty: 'bg-stone-800',
  indestructible: 'bg-stone-600 border border-stone-500',
  destructible: 'bg-amber-800 border border-amber-600',
};

const POWERUP_ICON: Record<string, string> = {
  'blast-radius': '🔥',
  'extra-bomb': '💣',
  'kick-bomb': '👟',
  'manual-detonation': '⚡',
  'speed-boost': '💨',
  'shield': '🛡️',
};

const PLAYER_COLORS = ['#F97316', '#8B5CF6'];

export default function BombermageBoard({ session, gameState, playerId, isMyTurn }: Props) {
  const board = gameState.board as any;
  const terrain: TerrainCell[][] = board.terrain ?? [];
  const powerups: (string | null)[][] = board.powerups ?? [];
  const bombs: any[] = board.bombs ?? [];
  const explosions: Position[] = board.explosions ?? [];
  const players: any[] = board.players ?? [];

  const myPlayer = session.players.find((p) => p.id === playerId);
  const myPlayerNumber = myPlayer?.playerNumber ?? -1;

  const rows = terrain.length;
  const cols = terrain[0]?.length ?? 0;

  function cellHasExplosion(r: number, c: number) {
    return explosions.some((e) => e.row === r && e.col === c);
  }

  function cellHasBomb(r: number, c: number) {
    return bombs.find((b) => b.position.row === r && b.position.col === c);
  }

  function playerOnCell(r: number, c: number) {
    return players.find((p) => p.alive && p.position.row === r && p.position.col === c);
  }

  function handleCellClick(r: number, c: number) {
    if (!isMyTurn || board.diceRoll === null) return;
    const ap = board.actionPointsRemaining ?? 0;
    const me = players[myPlayerNumber];
    if (!me) return;

    const isAdjacent =
      (Math.abs(r - me.position.row) === 1 && c === me.position.col) ||
      (Math.abs(c - me.position.col) === 1 && r === me.position.row);

    const socket = socketService.getSocket();

    if (r === me.position.row && c === me.position.col && ap >= 2) {
      // Place bomb on current position
      socket.emit('game:move', {
        sessionCode: session.sessionCode,
        playerId,
        move: {
          playerId,
          pieceIndex: 0,
          from: 0,
          to: 0,
          extra: { type: 'place-bomb', dest: { row: r, col: c } },
        },
      });
    } else if (isAdjacent && terrain[r]?.[c] === 'empty' && ap >= 1) {
      // Move
      socket.emit('game:move', {
        sessionCode: session.sessionCode,
        playerId,
        move: {
          playerId,
          pieceIndex: 0,
          from: 0,
          to: 0,
          extra: { type: 'move', dest: { row: r, col: c } },
        },
      });
    }
  }

  return (
    <div className="flex flex-col items-center gap-4">
      <div
        className="relative border-2 border-stone-600 rounded"
        style={{ display: 'grid', gridTemplateColumns: `repeat(${cols}, ${CELL_SIZE}px)` }}
      >
        {terrain.map((row, r) =>
          row.map((cell, c) => {
            const bomb = cellHasBomb(r, c);
            const player = playerOnCell(r, c);
            const powerup = terrain[r][c] === 'empty' ? powerups[r]?.[c] : null;
            const exploding = cellHasExplosion(r, c);

            return (
              <div
                key={`${r}-${c}`}
                className={`relative flex items-center justify-center cursor-pointer select-none
                  ${TERRAIN_STYLE[cell]}
                  ${exploding ? 'bg-orange-500' : ''}
                `}
                style={{ width: CELL_SIZE, height: CELL_SIZE }}
                onClick={() => handleCellClick(r, c)}
              >
                {/* Powerup layer */}
                {powerup && !player && !bomb && (
                  <span className="text-lg opacity-80">{POWERUP_ICON[powerup] ?? '?'}</span>
                )}
                {/* Bomb layer */}
                {bomb && (
                  <div className="relative flex items-center justify-center">
                    <span className="text-xl">💣</span>
                    <span className="absolute -top-1 -right-1 text-xs bg-red-700 text-white rounded-full w-4 h-4 flex items-center justify-center font-bold">
                      {Math.max(0, (board.config?.fuseLength ?? 3) - (board.totalMoveCount - bomb.placedOnMove))}
                    </span>
                  </div>
                )}
                {/* Player layer */}
                {player && (
                  <div
                    className="w-7 h-7 rounded-full border-2 border-white flex items-center justify-center text-xs font-bold text-white"
                    style={{ backgroundColor: PLAYER_COLORS[player.playerNumber] }}
                  >
                    {player.playerNumber + 1}
                  </div>
                )}
                {/* Explosion overlay */}
                {exploding && (
                  <div className="absolute inset-0 bg-orange-400 opacity-70 rounded" />
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
```

**Step 2: Commit**

```bash
git add frontend/src/components/games/bombermage/BombermageBoard.tsx
git commit -m "feat(frontend): add Bombermage board component"
```

---

## Task 6: Create the controls component

**Files:**
- Create: `frontend/src/components/games/bombermage/BombermageControls.tsx`

```tsx
import { Session, GameState } from '@ancient-games/shared';
import { socketService } from '../../../services/socket';
import { GameControlsProps } from '../../GameControls';

const POWERUP_LABELS: Record<string, string> = {
  'blast-radius': 'Blast +1',
  'extra-bomb': 'Extra Bomb',
  'kick-bomb': 'Kick Bomb',
  'manual-detonation': 'Manual Det.',
  'speed-boost': 'Speed Boost',
  'shield': 'Shield',
};

export default function BombermageControls({ session, gameState, playerId, isMyTurn }: GameControlsProps) {
  const board = gameState.board as any;
  const players: any[] = board.players ?? [];
  const myPlayer = session.players.find((p) => p.id === playerId);
  const myPN = myPlayer?.playerNumber ?? -1;
  const me = players[myPN];
  const opponent = players[1 - myPN];

  const ap: number = board.actionPointsRemaining ?? 0;
  const diceRoll: number | null = board.diceRoll;

  function handleEndTurn() {
    const socket = socketService.getSocket();
    socket.emit('game:move', {
      sessionCode: session.sessionCode,
      playerId,
      move: { playerId, pieceIndex: 0, from: 0, to: 0, extra: { type: 'end-turn' } },
    });
  }

  if (!me) return null;

  const inv = me.inventory;
  const activeInventory = [
    inv.blastRadius > 1 && `Blast +${inv.blastRadius - 1}`,
    inv.maxBombs > 1 && `${inv.maxBombs} Bombs`,
    inv.kickBomb && 'Kick Bomb',
    inv.manualDetonation && 'Manual Det.',
    inv.shield && 'Shield',
    inv.speedBoostTurnsRemaining > 0 && `Speed (${inv.speedBoostTurnsRemaining})`,
  ].filter(Boolean) as string[];

  return (
    <div className="flex flex-col gap-3 p-3 text-sm">
      {/* AP indicator */}
      <div className="flex items-center gap-2">
        <span className="text-stone-400">Roll:</span>
        <span className="text-yellow-300 font-bold text-lg">{diceRoll ?? '—'}</span>
        <span className="text-stone-400 ml-3">AP remaining:</span>
        <span className="text-green-400 font-bold text-lg">{diceRoll !== null ? ap : '—'}</span>
      </div>

      {/* AP cost legend */}
      <div className="text-xs text-stone-500 flex gap-3">
        <span>Move: 1 AP</span>
        <span>Bomb: 2 AP</span>
        <span>Kick: 1 AP</span>
      </div>

      {/* My inventory */}
      <div>
        <div className="text-stone-400 text-xs mb-1">Your powerups</div>
        {activeInventory.length === 0 ? (
          <span className="text-stone-600 text-xs">None</span>
        ) : (
          <div className="flex flex-wrap gap-1">
            {activeInventory.map((label) => (
              <span key={label} className="bg-stone-700 text-stone-200 px-2 py-0.5 rounded text-xs">
                {label}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Opponent inventory */}
      {opponent && (
        <div>
          <div className="text-stone-400 text-xs mb-1">Opponent powerups</div>
          <div className="flex flex-wrap gap-1">
            {opponent.inventory.blastRadius > 1 && (
              <span className="bg-stone-700 text-stone-400 px-2 py-0.5 rounded text-xs">Blast +{opponent.inventory.blastRadius - 1}</span>
            )}
            {opponent.inventory.maxBombs > 1 && (
              <span className="bg-stone-700 text-stone-400 px-2 py-0.5 rounded text-xs">{opponent.inventory.maxBombs} Bombs</span>
            )}
            {opponent.inventory.kickBomb && (
              <span className="bg-stone-700 text-stone-400 px-2 py-0.5 rounded text-xs">Kick Bomb</span>
            )}
            {opponent.inventory.shield && (
              <span className="bg-stone-700 text-stone-400 px-2 py-0.5 rounded text-xs">Shield</span>
            )}
          </div>
        </div>
      )}

      {/* Active bombs */}
      <div className="text-xs text-stone-400">
        Bombs: {me.activeBombCount}/{me.inventory.maxBombs} placed
      </div>

      {/* End turn */}
      {isMyTurn && diceRoll !== null && (
        <button
          onClick={handleEndTurn}
          className="mt-1 px-3 py-1.5 bg-stone-600 hover:bg-stone-500 text-white rounded text-sm font-medium"
        >
          End Turn
        </button>
      )}

      {!isMyTurn && (
        <div className="text-stone-500 text-xs italic">Opponent's turn...</div>
      )}
    </div>
  );
}
```

**Step 2: Commit**

```bash
git add frontend/src/components/games/bombermage/BombermageControls.tsx
git commit -m "feat(frontend): add Bombermage controls component with AP/inventory HUD"
```

---

## Task 7: Create the rules component

**Files:**
- Create: `frontend/src/components/games/bombermage/BombermageRules.tsx`

```tsx
import { Section } from '../../GameRules';

export default function BombermageRules() {
  return (
    <div className="flex flex-col gap-4 text-sm">
      <Section title="Objective">
        <p>Eliminate your opponent with bombs. Last player standing wins.</p>
      </Section>
      <Section title="Turn Structure">
        <ol className="list-decimal list-inside space-y-1">
          <li>Roll dice (1–6) to receive Action Points (AP)</li>
          <li>Spend AP: Move 1 square (1 AP) or Place a bomb (2 AP)</li>
          <li>Click End Turn when done, or turn auto-ends when AP reaches 0</li>
          <li>Bombs detonate after 3 total player turns</li>
        </ol>
      </Section>
      <Section title="The Map">
        <p>Dark pillars are indestructible. Crates can be destroyed by bomb blasts. Powerups are hidden inside crates — walk over them to collect.</p>
      </Section>
      <Section title="Bombs">
        <p>Bombs blast in a + pattern. The countdown badge shows turns until detonation. Blasts stop at indestructible pillars and destroy the first crate they hit.</p>
      </Section>
      <Section title="Powerups">
        <ul className="space-y-1">
          <li>🔥 <strong>Blast Radius</strong> — extends your bomb cross by 1</li>
          <li>💣 <strong>Extra Bomb</strong> — place an additional bomb simultaneously</li>
          <li>👟 <strong>Kick Bomb</strong> — spend 1 AP to slide a placed bomb (stops at walls)</li>
          <li>⚡ <strong>Manual Detonation</strong> — trigger one bomb early for free</li>
          <li>💨 <strong>Speed Boost</strong> — +1 AP on your next 3 turns</li>
          <li>🛡️ <strong>Shield</strong> — survive one blast</li>
        </ul>
      </Section>
    </div>
  );
}
```

**Step 2: Commit**

```bash
git add frontend/src/components/games/bombermage/BombermageRules.tsx
git commit -m "feat(frontend): add Bombermage rules component"
```

---

## Task 8: Register components in frontend lookup tables

**Files:**
- Modify: `frontend/src/components/GameRoom.tsx`
- Modify: `frontend/src/components/GameRules.tsx`
- Modify: `frontend/src/components/GameControls.tsx`

**Step 1: Add board to `GameRoom.tsx`**

In the `boardComponents` record, add:
```typescript
'bombermage': lazy(() => import('./games/bombermage/BombermageBoard')),
```

**Step 2: Add rules to `GameRules.tsx`**

In the `rulesComponents` record, add:
```typescript
'bombermage': lazy(() => import('./games/bombermage/BombermageRules')),
```

**Step 3: Add controls to `GameControls.tsx`**

Add import:
```typescript
import BombermageControls from './games/bombermage/BombermageControls';
```

Add to `controlsComponents`:
```typescript
'bombermage': BombermageControls,
```

**Step 4: Build frontend**

```bash
npm run build:frontend
```
Expected: exits 0 with no type errors

**Step 5: Commit**

```bash
git add frontend/src/components/GameRoom.tsx frontend/src/components/GameRules.tsx frontend/src/components/GameControls.tsx
git commit -m "feat(frontend): register Bombermage board, rules, and controls components"
```

---

## Task 9: Add session lobby config options

**Files:**
- Modify: `frontend/src/components/lobby/SessionLobby.tsx`

The lobby needs to show Bombermage-specific options when the session's `gameType === 'bombermage'`. These options are sent to the backend when the host starts the game.

**Step 1: Add local state for Bombermage options** near the top of the `SessionLobby` component (after existing state declarations):

```typescript
const [bombermageConfig, setBombermageConfig] = useState({
  gridSize: '11x11' as '9x9' | '11x11' | '13x11',
  barrierDensity: 'normal' as 'sparse' | 'normal' | 'dense',
  powerupFrequency: 'normal' as 'rare' | 'normal' | 'common',
  fuseLength: 3 as 2 | 3 | 4,
  enabledPowerups: ['blast-radius', 'extra-bomb', 'kick-bomb', 'manual-detonation', 'speed-boost', 'shield'] as string[],
});
```

**Step 2: Find where the Start Game button emits `game:start`** in SessionLobby and pass game options:

Find the `game:start` emit and change it to include options:
```typescript
socket.emit('game:start', {
  sessionCode,
  playerId,
  gameOptions: session?.gameType === 'bombermage' ? bombermageConfig : undefined,
});
```

**Step 3: Add the config UI block** in the host controls section, after the format selector and before the Start Game button:

```tsx
{session?.gameType === 'bombermage' && isHost && (
  <div className="flex flex-col gap-2 mt-3 p-3 bg-stone-800 rounded text-sm">
    <div className="font-semibold text-stone-300">Bombermage Settings</div>

    <label className="flex items-center gap-2">
      <span className="text-stone-400 w-32">Grid size</span>
      <select
        value={bombermageConfig.gridSize}
        onChange={(e) => setBombermageConfig((c) => ({ ...c, gridSize: e.target.value as any }))}
        className="bg-stone-700 text-white rounded px-2 py-1"
      >
        <option value="9x9">9×9</option>
        <option value="11x11">11×11 (default)</option>
        <option value="13x11">13×11</option>
      </select>
    </label>

    <label className="flex items-center gap-2">
      <span className="text-stone-400 w-32">Barrier density</span>
      <select
        value={bombermageConfig.barrierDensity}
        onChange={(e) => setBombermageConfig((c) => ({ ...c, barrierDensity: e.target.value as any }))}
        className="bg-stone-700 text-white rounded px-2 py-1"
      >
        <option value="sparse">Sparse</option>
        <option value="normal">Normal</option>
        <option value="dense">Dense</option>
      </select>
    </label>

    <label className="flex items-center gap-2">
      <span className="text-stone-400 w-32">Powerup drops</span>
      <select
        value={bombermageConfig.powerupFrequency}
        onChange={(e) => setBombermageConfig((c) => ({ ...c, powerupFrequency: e.target.value as any }))}
        className="bg-stone-700 text-white rounded px-2 py-1"
      >
        <option value="rare">Rare</option>
        <option value="normal">Normal</option>
        <option value="common">Common</option>
      </select>
    </label>

    <label className="flex items-center gap-2">
      <span className="text-stone-400 w-32">Fuse length</span>
      <select
        value={bombermageConfig.fuseLength}
        onChange={(e) => setBombermageConfig((c) => ({ ...c, fuseLength: Number(e.target.value) as any }))}
        className="bg-stone-700 text-white rounded px-2 py-1"
      >
        <option value={2}>2 turns (fast)</option>
        <option value={3}>3 turns (default)</option>
        <option value={4}>4 turns (slow)</option>
      </select>
    </label>

    <div>
      <div className="text-stone-400 mb-1">Enabled powerups</div>
      <div className="flex flex-wrap gap-2">
        {(['blast-radius', 'extra-bomb', 'kick-bomb', 'manual-detonation', 'speed-boost', 'shield'] as const).map((pu) => (
          <label key={pu} className="flex items-center gap-1 text-xs cursor-pointer">
            <input
              type="checkbox"
              checked={bombermageConfig.enabledPowerups.includes(pu)}
              onChange={(e) =>
                setBombermageConfig((c) => ({
                  ...c,
                  enabledPowerups: e.target.checked
                    ? [...c.enabledPowerups, pu]
                    : c.enabledPowerups.filter((p) => p !== pu),
                }))
              }
            />
            <span className="text-stone-300">{pu}</span>
          </label>
        ))}
      </div>
    </div>
  </div>
)}
```

**Step 4: Handle `gameOptions` on the backend** — find `game:start` handler in `backend/src/socket/gameHandlers.ts` and pass `gameOptions` to `initializeBoard`:

Locate where `engine.initializeBoard()` is called (no args today). Change to:
```typescript
const board = engine.initializeBoard((data as any).gameOptions);
```

This works because `BombermageGame.initializeBoard` accepts optional config and all other engines ignore the argument.

**Step 5: Build both workspaces**

```bash
npm run build
```
Expected: exits 0

**Step 6: Commit**

```bash
git add frontend/src/components/lobby/SessionLobby.tsx backend/src/socket/gameHandlers.ts
git commit -m "feat: add Bombermage session config options to lobby and wire to initializeBoard"
```

---

## Task 10: Manual smoke test

**Step 1: Start dev servers**

Terminal 1: `npm run dev:backend`
Terminal 2: `npm run dev:frontend`

**Step 2: Create a Bombermage session**

- Open `http://localhost:5173`
- Create a new session, select Bombermage
- Verify the lobby shows Bombermage Settings panel
- Change grid size, verify options persist

**Step 3: Join with a second browser tab and start the game**

- Verify the 11×11 grid renders with pillars, crates, and players in corners
- Roll dice, verify AP counter shows
- Click adjacent empty cell — player should move, AP should decrease
- Click own cell with 2+ AP — bomb should appear with countdown badge
- End turn — verify turn switches, countdown ticks

**Step 4: Verify bomb detonation**

- Place a bomb, take 3 total turns (both players), verify blast fires
- Verify a crate in blast radius becomes empty
- Verify a revealed powerup appears on the cell
- Walk over powerup — verify inventory updates in HUD

**Step 5: Verify win condition**

- Position player 1 in blast radius of a bomb, detonate — verify game ends and winner is announced

**Step 6: Commit any fixes found during smoke test**

```bash
git add -p
git commit -m "fix(bombermage): smoke test fixes"
```

---

## Task 11: Final build verification

```bash
npm run build
npm test --workspace=backend
```

Expected: build exits 0, all tests pass.

```bash
git add -A
git commit -m "chore: final Bombermage integration verification"
```
