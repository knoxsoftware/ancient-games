# Bombermage — Game Design Document

**Date:** 2026-03-05
**Status:** Approved, pending implementation plan

---

## Overview

Bombermage is a 2-player (future: 4-player) tactical board game inspired by Bomberman. Players move characters around a randomly generated grid, place bombs to destroy destructible barriers, collect hidden powerups, and eliminate each other. Gameplay is turn-based and dice-driven, fitting the Ancient Games platform's board game aesthetic.

---

## Rules

### Grid

- Default size: **11×11**; selectable at session creation: 9×9, 11×11, 13×11
- **Indestructible pillars** at every even-row, even-col intersection (checkerboard pattern)
- **Destructible barriers** randomly placed in remaining open cells
- Each corner has a guaranteed 2-square clear zone for player starts
- ~30% of destructible barriers (configurable) hide a powerup, revealed on destruction

### Turn Structure

1. Roll dice (1–6) → receive that many **action points (AP)**
2. Spend AP freely this turn:
   - **1 AP** — move 1 square (cardinal directions only)
   - **2 AP** — place a bomb on current cell
   - **1 AP** — kick a placed bomb 1+ squares in a direction (requires Kick Bomb powerup)
   - **0 AP** — manually detonate one of your bombs (requires Manual Detonation powerup, once per turn)
3. End turn (manually or when AP is exhausted)
4. Resolve bomb detonations (see below)

### Bombs

- A bomb placed when `totalMoveCount = N` detonates when `totalMoveCount >= N + fuseLength`
- `fuseLength` is configurable: 2, **3** (default), or 4 total player turns
- `totalMoveCount` increments every time any player completes a turn (both players' turns count)
- Blast pattern: fixed **+** cross, radius 1 by default (extendable via powerup)
- Blast destroys destructible barriers, reveals hidden powerups, and eliminates players in range
- A player cannot place more bombs than their `maxBombs` inventory value

### Powerups

Powerups are hidden under destructible barriers. On barrier destruction, the powerup is revealed on the cell. A player collects it by moving onto the cell.

| Powerup | Effect |
|---|---|
| Blast Radius +1 | Extends bomb blast cross by 1 square (stackable) |
| Extra Bomb | +1 to maximum simultaneously placed bombs |
| Kick Bomb | Spend 1 AP to slide a placed bomb in a direction (stops at walls/pillars) |
| Manual Detonation | Once per turn: detonate one of your bombs immediately (no AP cost) |
| Speed Boost | +1 AP on each of your next 3 turns |
| Shield | Survive the next blast that would eliminate you (consumed on use) |

### Win Condition

**Last player standing.** A player caught in a bomb blast is immediately eliminated. No lives, no respawn.

---

## Session Configuration Options

Presented in the session creation lobby alongside existing options:

| Option | Values | Default |
|---|---|---|
| Grid size | 9×9, 11×11, 13×11 | 11×11 |
| Barrier density | sparse, normal, dense | normal |
| Powerup frequency | rare, normal, common | normal |
| Enabled powerups | checklist of all 6 | all enabled |
| Fuse length | 2, 3, 4 turns | 3 |

---

## Data Model

All game-specific state lives in `BoardState.extra` as a `BombermageState` object.

```typescript
interface BombermageState {
  // Static map layer (generated once at init)
  terrain: TerrainCell[][];           // 'empty' | 'indestructible' | 'destructible'
  powerups: (PowerupType | null)[][];  // null = no powerup or not yet revealed

  // Dynamic layers
  bombs: Bomb[];
  explosions: Position[];             // cells currently on fire; cleared next turn

  // Player state
  players: BombermagePlayer[];        // indexed by playerNumber

  // Global counter
  totalMoveCount: number;             // increments after each player turn

  // Config snapshot
  config: BombermageConfig;
}

interface Bomb {
  position: Position;
  ownerPlayerNumber: number;
  placedOnMove: number;               // detonates when totalMoveCount >= placedOnMove + fuseLength
  isManual: boolean;                  // true if manual detonation powerup applied
}

interface BombermagePlayer {
  playerNumber: number;
  position: Position;
  alive: boolean;
  inventory: {
    blastRadius: number;              // default 1, +1 per pickup
    maxBombs: number;                 // default 1, +1 per pickup
    kickBomb: boolean;
    manualDetonation: boolean;
    shield: boolean;
    speedBoostTurnsRemaining: number;
  };
  activeBombCount: number;
}

interface BombermageConfig {
  gridSize: '9x9' | '11x11' | '13x11';
  barrierDensity: 'sparse' | 'normal' | 'dense';
  powerupFrequency: 'rare' | 'normal' | 'common';
  enabledPowerups: PowerupType[];
  fuseLength: 2 | 3 | 4;
}

type PowerupType =
  | 'blast-radius'
  | 'extra-bomb'
  | 'kick-bomb'
  | 'manual-detonation'
  | 'speed-boost'
  | 'shield';

interface Position {
  row: number;
  col: number;
}

type TerrainCell = 'empty' | 'indestructible' | 'destructible';
```

### Move Encoding

```typescript
// move.from = player's current position (encoded as row * cols + col)
// move.to   = destination cell (for move) or bomb placement cell
// move.extra.type = 'move' | 'place-bomb' | 'kick-bomb' | 'detonate'
// move.extra.direction = 'up' | 'down' | 'left' | 'right'  (for kick-bomb)
// move.extra.bombIndex = number  (for kick-bomb / detonate — index into bombs[])
```

---

## Architecture

### Backend

- `backend/src/games/bombermage/BombermageGame.ts` — extends `GameEngine`
- Map generation: checkerboard pillars + random destructible fill with guaranteed corner clearings
- `rollDice()` returns 1–6
- `getValidMoves()` returns all legal single-step actions given remaining AP
- `applyMove()` handles move, place-bomb, kick-bomb, detonate; resolves explosions after each turn
- `checkWinCondition()` returns winning playerNumber when only one player is alive

### Frontend

- `frontend/src/components/games/bombermage/BombermageBoard.tsx` — grid renderer
- `frontend/src/components/games/bombermage/BombermageControls.tsx` — AP tracker, end turn button
- `frontend/src/components/games/bombermage/BombermageRules.tsx` — rules modal
- Cell rendering layers (bottom to top): terrain → revealed powerup → bomb (with fuse badge) → explosion overlay → player token
- Player HUD shows: active powerups, bombs placed / max, shield status
- Session lobby extended with Bombermage config options

---

## Future Considerations (4-Player)

- `players[]` array already supports arbitrary player count
- Map generation should guarantee clear corners for each player
- Turn order: clockwise by playerNumber
- `totalMoveCount` semantics unchanged — still counts all turns by all players
- Session lobby will need to support 4-player invitations (platform-level work, not game-level)
