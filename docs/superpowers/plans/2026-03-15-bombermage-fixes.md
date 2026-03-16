# Bombermage Fixes Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix kick-bomb, manual detonation, and speed-boost powerups; add undo button; remove auto-end-turn.

**Architecture:** Backend engine changes in `BombermageGame.ts` (integrate kick into move, fix manual bomb flag, apply speed boost in afterDiceRoll, add undo stack and undo move type, remove auto-end-turn). Frontend changes in `BombermageBoard.tsx` (allow click-to-kick), `BombermageControls.tsx` (add undo button, add detonate buttons), and `BombermageState` type in the shared board state (undoStack field).

**Tech Stack:** TypeScript, Node.js, React 18, Vitest (backend tests), Socket.io

---

## Chunk 1: Backend fixes

### Task 1: Kick bomb — integrate into move action

**Files:**
- Modify: `backend/src/games/bombermage/BombermageGame.ts`
- Test: `backend/src/games/bombermage/BombermageGame.test.ts`

The kick should fire automatically when a player with `kickBomb` moves onto a cell occupied by a bomb. The player moves to that cell; the bomb slides in the same direction until blocked.

- [ ] **Step 1: Write the failing test**

Add to `BombermageGame.test.ts`:

```typescript
describe('kick bomb', () => {
  const makePlayer = (playerNumber: number) => ({ id: `p${playerNumber}`, playerNumber, sessionId: '', name: `P${playerNumber}`, connected: true });

  it('validateMove: allows moving onto bomb cell when player has kickBomb', () => {
    const engine = new BombermageGame();
    const board = engine.initializeBoard() as any;
    const p0 = board.players[0];
    const dest = { row: p0.position.row + 1, col: p0.position.col };
    board.terrain[dest.row][dest.col] = 'empty';
    board.terrain[dest.row + 1][dest.col] = 'empty'; // room to slide
    board.bombs = [{ position: dest, ownerPlayerNumber: 1, placedOnMove: 0, isManual: false }];
    board.actionPointsRemaining = 3;
    board.diceRoll = 3;
    p0.inventory.kickBomb = true;

    const move = { playerId: 'p0', pieceIndex: 0, from: 0, to: 0, extra: { type: 'move', dest } };
    expect(engine.validateMove(board, move as any, makePlayer(0) as any)).toBe(true);
  });

  it('validateMove: still blocks move onto bomb cell when player lacks kickBomb', () => {
    const engine = new BombermageGame();
    const board = engine.initializeBoard() as any;
    const p0 = board.players[0];
    const dest = { row: p0.position.row + 1, col: p0.position.col };
    board.terrain[dest.row][dest.col] = 'empty';
    board.bombs = [{ position: dest, ownerPlayerNumber: 1, placedOnMove: 0, isManual: false }];
    board.actionPointsRemaining = 3;
    board.diceRoll = 3;
    // kickBomb defaults to false

    const move = { playerId: 'p0', pieceIndex: 0, from: 0, to: 0, extra: { type: 'move', dest } };
    expect(engine.validateMove(board, move as any, makePlayer(0) as any)).toBe(false);
  });

  it('applyMove: kick slides bomb in direction of travel', () => {
    const engine = new BombermageGame();
    const board = engine.initializeBoard() as any;
    const p0 = board.players[0];
    // p0 at (0,0), dest (1,0), bomb at (1,0) should slide to (2,0)
    const dest = { row: 1, col: 0 };
    board.terrain[1][0] = 'empty';
    board.terrain[2][0] = 'empty';
    board.terrain[3][0] = 'indestructible'; // stops slide at row 2
    board.bombs = [{ position: { row: 1, col: 0 }, ownerPlayerNumber: 1, placedOnMove: 0, isManual: false }];
    board.actionPointsRemaining = 3;
    board.diceRoll = 3;
    p0.inventory.kickBomb = true;

    const move = { playerId: 'p0', pieceIndex: 0, from: 0, to: 0, extra: { type: 'move', dest } };
    const after = engine.applyMove(board, move) as any;

    expect(after.players[0].position).toEqual({ row: 1, col: 0 });
    expect(after.bombs[0].position).toEqual({ row: 2, col: 0 });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd /home/matt/src/games && npm test --workspace=backend 2>&1 | grep -A 3 'kick bomb'
```

Expected: FAIL — the validateMove returns false for kick case, applyMove doesn't slide bomb.

- [ ] **Step 3: Implement kick in validateMove and applyMove**

In `BombermageGame.ts`, in the `validateMove` method, find the `type === 'move'` block. Change the final `return !hasBomb;` to:

```typescript
if (hasBomb) {
  // Allow move onto bomb cell only if player has kickBomb
  return p.inventory.kickBomb === true;
}
return true;
```

In `applyMove`, in the `type === 'move'` block, after setting `p.position = dest;`, add kick logic:

```typescript
// Kick: if a bomb was on the destination and player has kickBomb, slide it
const bombOnDest = bm.bombs.find(
  (b: Bomb) => b.position.row === dest.row && b.position.col === dest.col
);
if (bombOnDest && p.inventory.kickBomb) {
  const dr = dest.row - (bm.players[playerNumber].position?.row ?? dest.row); // NOTE: position already updated, use extra.dest direction
  const dc = dest.col - (bm.players[playerNumber].position?.col ?? dest.col);
  // Recalculate direction from original position stored in the move extra
  const origRow: number = (move as any).extra?.kickOriginRow ?? dest.row;
  const origCol: number = (move as any).extra?.kickOriginCol ?? dest.col;
  // direction is dest minus original player position — passed as origRow/Col or we derive from previous state
}
```

Wait — the player position is already overwritten at this point. Instead, capture the original position before updating:

Replace the entire `type === 'move'` block with:

```typescript
if (type === 'move') {
  const dest: Position = extra.dest;
  const origPos = { ...p.position };
  p.position = dest;
  bm.actionPointsRemaining = (bm.actionPointsRemaining ?? 0) - 1;

  // Kick: slide any bomb that was on the destination in the direction of travel
  const bombOnDestIdx = bm.bombs.findIndex(
    (b: Bomb) => b.position.row === dest.row && b.position.col === dest.col
  );
  if (bombOnDestIdx !== -1 && p.inventory.kickBomb) {
    const dRow = dest.row - origPos.row;
    const dCol = dest.col - origPos.col;
    const bomb = bm.bombs[bombOnDestIdx];
    let nr = bomb.position.row + dRow;
    let nc = bomb.position.col + dCol;
    while (
      nr >= 0 && nr < bm.terrain.length &&
      nc >= 0 && nc < bm.terrain[0].length &&
      bm.terrain[nr][nc] === 'empty' &&
      !bm.bombs.some((b: Bomb) => b !== bomb && b.position.row === nr && b.position.col === nc)
    ) {
      bomb.position = { row: nr, col: nc };
      nr += dRow;
      nc += dCol;
    }
  }

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

- [ ] **Step 4: Remove the now-dead `kick-bomb` branch**

In `applyMove`, delete the entire `else if (type === 'kick-bomb')` block (the one that calls `dirToDelta` and slides the bomb). It is now dead code since kick is handled inside the `move` branch.

Also remove the `kick-bomb` block from `validateMove` (the block that checks `p.inventory.kickBomb` and `extra.bombIndex`).

- [ ] **Step 5: Run tests to verify they pass**

```bash
cd /home/matt/src/games && npm test --workspace=backend 2>&1 | grep -E '(kick bomb|PASS|FAIL|✓|✗)'
```

Expected: all kick bomb tests PASS, no regressions.

- [ ] **Step 6: Commit**

```bash
cd /home/matt/src/games && git add backend/src/games/bombermage/BombermageGame.ts backend/src/games/bombermage/BombermageGame.test.ts && git commit -m "feat(bombermage): integrate kick-bomb into move action"
```

---

### Task 2: Manual detonation — fix isManual flag + speed boost AP bonus

**Files:**
- Modify: `backend/src/games/bombermage/BombermageGame.ts`
- Test: `backend/src/games/bombermage/BombermageGame.test.ts`

Two backend-only fixes:
1. `place-bomb` should set `isManual: true` if player has `manualDetonation`
2. `afterDiceRoll` should apply speed-boost bonus AP and decrement the counter

- [ ] **Step 1: Write failing tests**

Add to `BombermageGame.test.ts`:

```typescript
describe('manual detonation', () => {
  const makePlayer = (playerNumber: number) => ({ id: `p${playerNumber}`, playerNumber, sessionId: '', name: `P${playerNumber}`, connected: true });

  it('place-bomb sets isManual=true when player has manualDetonation', () => {
    const engine = new BombermageGame();
    const board = engine.initializeBoard() as any;
    board.players[0].inventory.manualDetonation = true;
    board.diceRoll = 3;
    board.actionPointsRemaining = 3;
    const move = { playerId: 'p0', pieceIndex: 0, from: 0, to: 0, extra: { type: 'place-bomb', dest: board.players[0].position } };
    const after = engine.applyMove(board, move) as any;
    expect(after.bombs[0].isManual).toBe(true);
  });

  it('place-bomb sets isManual=false when player lacks manualDetonation', () => {
    const engine = new BombermageGame();
    const board = engine.initializeBoard() as any;
    board.diceRoll = 3;
    board.actionPointsRemaining = 3;
    const move = { playerId: 'p0', pieceIndex: 0, from: 0, to: 0, extra: { type: 'place-bomb', dest: board.players[0].position } };
    const after = engine.applyMove(board, move) as any;
    expect(after.bombs[0].isManual).toBe(false);
  });

  it('validateMove: allows detonate when player has manualDetonation and bomb is manual', () => {
    const engine = new BombermageGame();
    const board = engine.initializeBoard() as any;
    board.players[0].inventory.manualDetonation = true;
    board.diceRoll = 3;
    board.actionPointsRemaining = 3;
    board.bombs = [{ position: { row: 2, col: 2 }, ownerPlayerNumber: 0, placedOnMove: 0, isManual: true }];
    board.players[0].activeBombCount = 1;
    const move = { playerId: 'p0', pieceIndex: 0, from: 0, to: 0, extra: { type: 'detonate', bombIndex: 0 } };
    expect(engine.validateMove(board, move as any, makePlayer(0) as any)).toBe(true);
  });

  it('manual bomb does not auto-detonate on fuse expiry', () => {
    const engine = new BombermageGame();
    const board = engine.initializeBoard() as any;
    board.bombs = [{ position: { row: 5, col: 5 }, ownerPlayerNumber: 0, placedOnMove: 0, isManual: true }];
    board.players[0].activeBombCount = 1;
    board.totalMoveCount = 10; // far past fuse length
    board.explosions = [];
    (engine as any)._resolveExpiredBombs(board);
    // Manual bomb should still be there
    expect(board.bombs).toHaveLength(1);
  });
});

describe('speed boost', () => {
  it('afterDiceRoll grants +2 bonus AP when speedBoostTurnsRemaining > 0', () => {
    const engine = new BombermageGame();
    const board = engine.initializeBoard() as any;
    board.players[0].inventory.speedBoostTurnsRemaining = 2;
    board.config.apMin = 5;
    board.config.apMax = 5;
    const after = engine.afterDiceRoll(board, 5) as any;
    // 5 base AP + 2 bonus = 7
    expect(after.actionPointsRemaining).toBe(7);
  });

  it('afterDiceRoll decrements speedBoostTurnsRemaining', () => {
    const engine = new BombermageGame();
    const board = engine.initializeBoard() as any;
    board.players[0].inventory.speedBoostTurnsRemaining = 2;
    board.config.apMin = 5;
    board.config.apMax = 5;
    const after = engine.afterDiceRoll(board, 5) as any;
    expect(after.players[0].inventory.speedBoostTurnsRemaining).toBe(1);
  });

  it('afterDiceRoll grants no bonus AP when speedBoostTurnsRemaining is 0', () => {
    const engine = new BombermageGame();
    const board = engine.initializeBoard() as any;
    board.players[0].inventory.speedBoostTurnsRemaining = 0;
    board.config.apMin = 5;
    board.config.apMax = 5;
    const after = engine.afterDiceRoll(board, 5) as any;
    expect(after.actionPointsRemaining).toBe(5);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd /home/matt/src/games && npm test --workspace=backend 2>&1 | grep -E '(manual detonation|speed boost|PASS|FAIL)'
```

- [ ] **Step 3: Fix place-bomb isManual flag**

In `BombermageGame.ts`, in `applyMove`, in the `type === 'place-bomb'` block, change:

```typescript
const bomb: Bomb = {
  position: { ...p.position },
  ownerPlayerNumber: playerNumber,
  placedOnMove: bm.totalMoveCount,
  isManual: false,
};
```

to:

```typescript
const bomb: Bomb = {
  position: { ...p.position },
  ownerPlayerNumber: playerNumber,
  placedOnMove: bm.totalMoveCount,
  isManual: p.inventory.manualDetonation === true,
};
```

- [ ] **Step 4: Fix speed boost in afterDiceRoll**

In `afterDiceRoll`, after computing `total`, add the speed boost bonus before returning:

Replace:
```typescript
const total = Math.min(banked + actualRoll, cap);
if (p) p.bankedAP = 0;
return { ...board, diceRoll: actualRoll, players: bm.players, actionPointsRemaining: total } as BoardState;
```

With:
```typescript
let total = Math.min(banked + actualRoll, cap);
if (p) {
  p.bankedAP = 0;
  if (p.inventory.speedBoostTurnsRemaining > 0) {
    total += 2;
    p.inventory.speedBoostTurnsRemaining--;
  }
}
return { ...board, diceRoll: actualRoll, players: bm.players, actionPointsRemaining: total } as BoardState;
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
cd /home/matt/src/games && npm test --workspace=backend 2>&1 | tail -20
```

Expected: all tests pass.

- [ ] **Step 6: Commit**

```bash
cd /home/matt/src/games && git add backend/src/games/bombermage/BombermageGame.ts backend/src/games/bombermage/BombermageGame.test.ts && git commit -m "feat(bombermage): fix manual detonation isManual flag and speed boost AP"
```

---

### Task 3: Undo stack + remove auto-end-turn

**Files:**
- Modify: `backend/src/games/bombermage/BombermageGame.ts`
- Test: `backend/src/games/bombermage/BombermageGame.test.ts`

Add `undoStack` to board state. Before each non-end-turn action, push a snapshot. Add `'undo'` move type that pops and restores. Remove the auto-end-turn block.

- [ ] **Step 1: Write failing tests**

Add to `BombermageGame.test.ts`:

```typescript
describe('undo', () => {
  const makePlayer = (playerNumber: number) => ({ id: `p${playerNumber}`, playerNumber, sessionId: '', name: `P${playerNumber}`, connected: true });

  function freshBoard(engine: BombermageGame) {
    const board = engine.initializeBoard() as any;
    board.diceRoll = 5;
    board.actionPointsRemaining = 5;
    board.terrain[0][1] = 'empty';
    board.terrain[1][0] = 'empty';
    return board;
  }

  it('applyMove pushes state to undoStack before a move', () => {
    const engine = new BombermageGame();
    const board = freshBoard(engine);
    const move = { playerId: 'p0', pieceIndex: 0, from: 0, to: 0, extra: { type: 'move', dest: { row: 0, col: 1 } } };
    const after = engine.applyMove(board, move) as any;
    expect(after.undoStack).toHaveLength(1);
  });

  it('undo move restores previous position and AP', () => {
    const engine = new BombermageGame();
    const board = freshBoard(engine);
    const origPos = { ...board.players[0].position };
    const move = { playerId: 'p0', pieceIndex: 0, from: 0, to: 0, extra: { type: 'move', dest: { row: 0, col: 1 } } };
    const after = engine.applyMove(board, move) as any;

    const undoMove = { playerId: 'p0', pieceIndex: 0, from: 0, to: 0, extra: { type: 'undo' } };
    const restored = engine.applyMove(after, undoMove) as any;
    expect(restored.players[0].position).toEqual(origPos);
    expect(restored.actionPointsRemaining).toBe(5);
    expect(restored.undoStack).toHaveLength(0);
  });

  it('undo restores coin to board if it was picked up', () => {
    const engine = new BombermageGame();
    const board = freshBoard(engine);
    board.coins[0][1] = true;
    const move = { playerId: 'p0', pieceIndex: 0, from: 0, to: 0, extra: { type: 'move', dest: { row: 0, col: 1 } } };
    const after = engine.applyMove(board, move) as any;
    expect(after.players[0].score).toBe(1);

    const undoMove = { playerId: 'p0', pieceIndex: 0, from: 0, to: 0, extra: { type: 'undo' } };
    const restored = engine.applyMove(after, undoMove) as any;
    expect(restored.players[0].score).toBe(0);
    expect(restored.coins[0][1]).toBe(true);
  });

  it('undo restores bomb to board if place-bomb was undone', () => {
    const engine = new BombermageGame();
    const board = freshBoard(engine);
    const move = { playerId: 'p0', pieceIndex: 0, from: 0, to: 0, extra: { type: 'place-bomb', dest: board.players[0].position } };
    const after = engine.applyMove(board, move) as any;
    expect(after.bombs).toHaveLength(1);

    const undoMove = { playerId: 'p0', pieceIndex: 0, from: 0, to: 0, extra: { type: 'undo' } };
    const restored = engine.applyMove(after, undoMove) as any;
    expect(restored.bombs).toHaveLength(0);
    expect(restored.players[0].activeBombCount).toBe(0);
  });

  it('end-turn clears the undo stack', () => {
    const engine = new BombermageGame();
    const board = freshBoard(engine);
    const move = { playerId: 'p0', pieceIndex: 0, from: 0, to: 0, extra: { type: 'move', dest: { row: 0, col: 1 } } };
    const after = engine.applyMove(board, move) as any;
    expect(after.undoStack).toHaveLength(1);

    after.diceRoll = 4; // end-turn needs diceRoll set
    const endTurn = { playerId: 'p0', pieceIndex: 0, from: 0, to: 0, extra: { type: 'end-turn' } };
    const ended = engine.applyMove(after, endTurn) as any;
    expect(ended.undoStack).toHaveLength(0);
  });
});

describe('no auto-end-turn', () => {
  it('does NOT auto-end-turn when AP reaches 0 — player must explicitly end turn', () => {
    const engine = new BombermageGame();
    const board = engine.initializeBoard() as any;
    board.diceRoll = 1;
    board.actionPointsRemaining = 1;
    board.terrain[0][1] = 'empty';
    const move = { playerId: 'p0', pieceIndex: 0, from: 0, to: 0, extra: { type: 'move', dest: { row: 0, col: 1 } } };
    const after = engine.applyMove(board, move) as any;
    // Turn should NOT have advanced — currentTurn still 0
    expect(after.currentTurn).toBe(0);
    expect(after.actionPointsRemaining).toBe(0);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd /home/matt/src/games && npm test --workspace=backend 2>&1 | grep -E '(undo|auto-end-turn|FAIL)'
```

- [ ] **Step 3: Add undo stack logic to BombermageGame.ts**

At the top of `applyMove`, after the deep clone and before any action handling, add:

```typescript
// Ensure undoStack exists
if (!bm.undoStack) bm.undoStack = [];
```

Then, before each of the action branches (`move`, `place-bomb`, `kick-bomb`, `detonate`), push the pre-action snapshot. Add a helper constant for this at the top of the method:

```typescript
const UNDO_CAP = 10;

// Snapshot before action (not for end-turn or undo itself)
if (type !== 'end-turn' && type !== 'undo') {
  // Store snapshot of state BEFORE this action (board = original before deep clone)
  const snapshot = JSON.parse(JSON.stringify(board));
  if (bm.undoStack.length >= UNDO_CAP) bm.undoStack.shift();
  bm.undoStack.push(snapshot);
}
```

Add the `undo` move type handling after the `detonate` block:

```typescript
} else if (type === 'undo') {
  const stack: any[] = bm.undoStack ?? [];
  if (stack.length > 0) {
    const prev = stack.pop();
    // Return the previous state with the updated (shrunken) undo stack
    prev.undoStack = stack;
    return prev;
  }
  return state; // nothing to undo
}
```

In the `end-turn` block, clear the undo stack. The existing block in `applyMove` is:

```typescript
} else if (type === 'end-turn') {
  // Bank leftover AP for the current player before ending turn
  p.bankedAP = bm.actionPointsRemaining ?? 0;
  // Explosion phase: increment move count, resolve expired bombs, then advance turn
  bm.totalMoveCount++;
  this._resolveExpiredBombs(bm);
  bm.currentTurn = this.getNextTurn(bm, playerNumber);
  bm.diceRoll = null;
  bm.actionPointsRemaining = null;
  return state;
}
```

Replace with:

```typescript
} else if (type === 'end-turn') {
  // Bank leftover AP for the current player before ending turn
  p.bankedAP = bm.actionPointsRemaining ?? 0;
  bm.undoStack = []; // clear undo history on end turn
  // Explosion phase: increment move count, resolve expired bombs, then advance turn
  bm.totalMoveCount++;
  this._resolveExpiredBombs(bm);
  bm.currentTurn = this.getNextTurn(bm, playerNumber);
  bm.diceRoll = null;
  bm.actionPointsRemaining = null;
  return state;
}
```

- [ ] **Step 4: Remove auto-end-turn**

Delete the following block from the bottom of `applyMove` (the one that fires when `actionPointsRemaining <= 0`):

```typescript
if ((bm.actionPointsRemaining ?? 1) <= 0) {
  // Bank leftover AP (zero in this case) before ending turn
  p.bankedAP = 0;
  // Explosion phase: increment move count, resolve expired bombs, then advance turn
  bm.totalMoveCount++;
  this._resolveExpiredBombs(bm);
  bm.currentTurn = this.getNextTurn(bm, playerNumber);
  bm.diceRoll = null;
  bm.actionPointsRemaining = null;
}
```

- [ ] **Step 5: Run all backend tests**

```bash
cd /home/matt/src/games && npm test --workspace=backend 2>&1 | tail -30
```

Expected: all tests pass (including new ones and no regressions).

- [ ] **Step 6: Commit**

```bash
cd /home/matt/src/games && git add backend/src/games/bombermage/BombermageGame.ts backend/src/games/bombermage/BombermageGame.test.ts && git commit -m "feat(bombermage): add undo stack, undo move type, remove auto-end-turn"
```

---

## Chunk 2: Frontend fixes

### Task 4: Frontend kick-bomb — allow click onto bomb cell

**Files:**
- Modify: `frontend/src/components/games/bombermage/BombermageBoard.tsx`
- Modify: `frontend/src/components/games/bombermage/BombermageControls.tsx`

- [ ] **Step 1: Update BombermageBoard.tsx handleCellClick**

In `handleCellClick`, the current code blocks any click where `destHasBomb` is true. Change the move-emit condition to allow it when the player has `kickBomb`:

Find:
```typescript
if (isAdjacent && terrain[r]?.[c] === 'empty' && !destHasBomb && ap >= 1) {
  emitMove({ row: r, col: c });
}
```

Replace with:
```typescript
const canKick = me.inventory?.kickBomb === true && destHasBomb;
if (isAdjacent && terrain[r]?.[c] === 'empty' && (!destHasBomb || canKick) && ap >= 1) {
  emitMove({ row: r, col: c });
}
```

- [ ] **Step 2: Update BombermageControls.tsx canMoveTo**

In `canMoveTo`, find:
```typescript
if (bombs.some((b: any) => b.position.row === r && b.position.col === c)) return false;
```

Replace with:
```typescript
const cellHasBomb = bombs.some((b: any) => b.position.row === r && b.position.col === c);
if (cellHasBomb && me.inventory?.kickBomb !== true) return false;
```

- [ ] **Step 3: Build frontend to check for TypeScript errors**

```bash
cd /home/matt/src/games && npm run build:frontend 2>&1 | tail -20
```

Expected: build succeeds with no errors.

- [ ] **Step 4: Commit**

```bash
cd /home/matt/src/games && git add frontend/src/components/games/bombermage/BombermageBoard.tsx frontend/src/components/games/bombermage/BombermageControls.tsx && git commit -m "feat(bombermage): allow kick-bomb via move click in UI"
```

---

### Task 5: Manual detonation UI

**Files:**
- Modify: `frontend/src/components/games/bombermage/BombermageControls.tsx`

Add a detonate button per bomb owned by the current player, shown only when the player has `manualDetonation`. Each button emits a `detonate` move with the correct `bombIndex`.

- [ ] **Step 1: Add emitDetonate function**

In `BombermageControls.tsx`, after `emitPlaceBomb`, add:

```typescript
function emitDetonate(bombIndex: number) {
  const socket = socketService.getSocket();
  if (!socket) return;
  socket.emit('game:move', {
    sessionCode: session.sessionCode,
    playerId,
    move: Object.assign({ playerId, pieceIndex: 0, from: 0, to: 0 }, {
      extra: { type: 'detonate', bombIndex },
    }),
  });
}
```

- [ ] **Step 2: Render detonate buttons**

In the return JSX, after the `End Turn` / bomb column, add a detonate section. Find the closing `</div>` of the `flex items-end gap-3` container and add a new column before it:

```tsx
{/* Detonate buttons — shown when player has manual detonation and has active bombs */}
{isMyTurn && diceRoll !== null && me.inventory?.manualDetonation && (
  <div className="flex flex-col gap-1 items-center">
    {bombs
      .map((b: any, idx: number) => ({ bomb: b, idx }))
      .filter(({ bomb }) => bomb.ownerPlayerNumber === myPN)
      .map(({ bomb, idx }) => (
        <button
          key={idx}
          className="px-2 py-1 rounded-lg text-[11px] font-semibold transition-all active:scale-90"
          style={{ background: '#7c2d12', color: '#fca5a5', border: '1px solid #c2410c' }}
          onClick={() => debounced(() => emitDetonate(idx))}
          onTouchEnd={(e) => { e.preventDefault(); debounced(() => emitDetonate(idx)); }}
        >
          💥 {idx + 1}
        </button>
      ))}
  </div>
)}
```

- [ ] **Step 3: Build and verify**

```bash
cd /home/matt/src/games && npm run build:frontend 2>&1 | tail -20
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
cd /home/matt/src/games && git add frontend/src/components/games/bombermage/BombermageControls.tsx && git commit -m "feat(bombermage): add manual detonation UI buttons"
```

---

### Task 6: Undo button UI

**Files:**
- Modify: `frontend/src/components/games/bombermage/BombermageControls.tsx`

- [ ] **Step 1: Add emitUndo function**

In `BombermageControls.tsx`, after `handleEndTurn`, add:

```typescript
function handleUndo() {
  const socket = socketService.getSocket();
  if (!socket) return;
  socket.emit('game:move', {
    sessionCode: session.sessionCode,
    playerId,
    move: Object.assign({ playerId, pieceIndex: 0, from: 0, to: 0 }, { extra: { type: 'undo' } }),
  });
}
```

- [ ] **Step 2: Add canUndo derived value**

After `const canBomb = ...`, add:

```typescript
const undoStack: any[] = board.undoStack ?? [];
const canUndo = isMyTurn && diceRoll !== null && undoStack.length > 0;
```

- [ ] **Step 3: Add Undo button to the controls**

In the `End Turn` / bomb column, add an Undo button alongside End Turn. Currently the column has End Turn on top and bomb button below. Add Undo between them:

Find the exact End Turn button block (lines 235–246 of `BombermageControls.tsx`):
```tsx
          {isMyTurn && diceRoll !== null ? (
            <button
              className="px-3 py-1 rounded-lg text-[11px] font-semibold transition-all active:scale-90"
              style={{ background: '#334155', color: '#94a3b8', border: '1px solid #475569' }}
              onClick={() => debounced(handleEndTurn)}
              onTouchEnd={(e) => { e.preventDefault(); debounced(handleEndTurn); }}
            >
              End Turn
            </button>
          ) : (
            <div className="h-[26px]" />
          )}
```

Replace with:
```tsx
{isMyTurn && diceRoll !== null ? (
  <div className="flex flex-col items-center gap-1">
    <button
      className="px-3 py-1 rounded-lg text-[11px] font-semibold transition-all active:scale-90"
      style={{ background: '#334155', color: '#94a3b8', border: '1px solid #475569' }}
      onClick={() => debounced(handleEndTurn)}
      onTouchEnd={(e) => { e.preventDefault(); debounced(handleEndTurn); }}
    >
      End Turn
    </button>
    <button
      className="px-3 py-1 rounded-lg text-[11px] font-semibold transition-all active:scale-90 disabled:opacity-30"
      style={{ background: '#1e293b', color: '#94a3b8', border: '1px solid #334155' }}
      disabled={!canUndo}
      onClick={() => { if (canUndo) debounced(handleUndo); }}
      onTouchEnd={(e) => { e.preventDefault(); if (canUndo) debounced(handleUndo); }}
    >
      ↩ Undo
    </button>
  </div>
) : (
  <div className="h-[52px]" />
)}
```

Note: update the placeholder `div` height from `h-[26px]` to `h-[52px]` to maintain layout consistency.

- [ ] **Step 4: Build and verify**

```bash
cd /home/matt/src/games && npm run build:frontend 2>&1 | tail -20
```

Expected: no errors.

- [ ] **Step 5: Run all backend tests one final time**

```bash
cd /home/matt/src/games && npm test --workspace=backend 2>&1 | tail -20
```

Expected: all pass.

- [ ] **Step 6: Commit**

```bash
cd /home/matt/src/games && git add frontend/src/components/games/bombermage/BombermageControls.tsx && git commit -m "feat(bombermage): add undo button to controls"
```

---

## Summary of changes

| File | Changes |
|------|---------|
| `backend/src/games/bombermage/BombermageGame.ts` | Kick in move action; isManual from inventory; speed boost AP in afterDiceRoll; undo stack; undo move type; remove auto-end-turn; clear undo stack on end-turn |
| `backend/src/games/bombermage/BombermageGame.test.ts` | Tests for all 4 fixes |
| `frontend/src/components/games/bombermage/BombermageBoard.tsx` | Allow click onto bomb cell when player has kickBomb |
| `frontend/src/components/games/bombermage/BombermageControls.tsx` | Allow d-pad onto bomb cell when kickBomb; detonate buttons; undo button |
