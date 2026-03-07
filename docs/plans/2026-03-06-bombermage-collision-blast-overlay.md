# Bombermage Collision & Blast Overlay Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Prevent players sharing a cell, and show blast radius overlays (blinking when imminent) on the board.

**Architecture:** Backend collision check in `validateMove`; frontend mirrors `_calcBlast` logic to compute and render overlays per bomb.

**Tech Stack:** TypeScript (backend), React + Tailwind (frontend)

---

### Task 1: Prevent players occupying the same space

**Files:**
- Modify: `backend/src/games/bombermage/BombermageGame.ts` (validateMove, type === 'move' block)
- Test: `backend/src/games/bombermage/BombermageGame.test.ts`

**Step 1: Write failing test**

In `BombermageGame.test.ts`, add:
```ts
it('should not allow moving onto another player', () => {
  const engine = new BombermageGame();
  const board = engine.initializeBoard();
  const bm = board as any;
  // Place player 1 adjacent to player 0
  bm.players[1].position = { row: 0, col: 1 };
  bm.diceRoll = 3;
  bm.actionPointsRemaining = 3;
  const move = { playerId: 'p0', pieceIndex: 0, from: 0, to: 0, extra: { type: 'move', dest: { row: 0, col: 1 } } };
  const player = { id: 'p0', playerNumber: 0, sessionId: '', name: 'P0', connected: true };
  expect(engine.validateMove(board, move as any, player as any)).toBe(false);
});
```

**Step 2: Run test to verify it fails**
```bash
npm test --workspace=backend
```

**Step 3: Implement fix**

In `BombermageGame.ts`, inside `validateMove`, after the adjacency/terrain check for `type === 'move'`:
```ts
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
  return !occupied;
}
```

**Step 4: Run tests**
```bash
npm test --workspace=backend
```

**Step 5: Commit**
```bash
git add backend/src/games/bombermage/BombermageGame.ts backend/src/games/bombermage/BombermageGame.test.ts
git commit -m "fix(bombermage): prevent players from occupying the same cell"
```

---

### Task 2: Blast radius overlays with blinking when imminent

**Files:**
- Modify: `frontend/src/components/games/bombermage/BombermageBoard.tsx`

No new tests needed (pure rendering logic).

**Step 1: Add calcBlast helper inside BombermageBoard.tsx**

Above the component, add:
```ts
function calcBlast(terrain: TerrainCell[][], center: Position, radius: number): Position[] {
  const cells: Position[] = [{ ...center }];
  const dirs: [number, number][] = [[-1, 0], [1, 0], [0, -1], [0, 1]];
  for (const [dr, dc] of dirs) {
    for (let i = 1; i <= radius; i++) {
      const r = center.row + dr * i;
      const c = center.col + dc * i;
      if (r < 0 || r >= terrain.length || c < 0 || c >= terrain[0].length) break;
      if (terrain[r][c] === 'indestructible') break;
      cells.push({ row: r, col: c });
      if (terrain[r][c] === 'destructible') break;
    }
  }
  return cells;
}
```

**Step 2: Compute blast zone sets inside the component**

Inside the component, before the return:
```ts
const fuseLength: number = board.config?.fuseLength ?? 3;

// Map each cell key "r,c" to whether it's in any blast zone and whether any such bomb is imminent
const blastZoneCells = new Map<string, { inZone: boolean; imminent: boolean }>();
for (const bomb of bombs) {
  const owner = players[bomb.ownerPlayerNumber];
  const radius: number = owner?.inventory?.blastRadius ?? 1;
  const countdown = fuseLength - (board.totalMoveCount - bomb.placedOnMove);
  const imminent = countdown === 1;
  const blastCells = calcBlast(terrain, bomb.position, radius);
  for (const cell of blastCells) {
    const key = `${cell.row},${cell.col}`;
    const existing = blastZoneCells.get(key);
    blastZoneCells.set(key, {
      inZone: true,
      imminent: (existing?.imminent ?? false) || imminent,
    });
  }
}
```

**Step 3: Add helper function**

```ts
function cellBlastInfo(r: number, c: number) {
  return blastZoneCells.get(`${r},${c}`) ?? { inZone: false, imminent: false };
}
```

**Step 4: Render overlay inside each cell div**

Inside the cell map, after the existing `{exploding && ...}` overlay, add:
```tsx
{!exploding && (() => {
  const { inZone, imminent } = cellBlastInfo(r, c);
  if (!inZone) return null;
  return (
    <div
      className={`absolute inset-0 rounded pointer-events-none ${imminent ? 'animate-pulse' : ''}`}
      style={{ backgroundColor: 'rgba(251, 146, 60, 0.25)', zIndex: 1 }}
    />
  );
})()}
```

**Step 5: Verify visually** - run dev server and place a bomb; cells in blast radius should show amber tint. Place one with countdown=1 and it should pulse.

**Step 6: Commit**
```bash
git add frontend/src/components/games/bombermage/BombermageBoard.tsx
git commit -m "feat(bombermage): show blast radius overlay, blink when imminent"
```
