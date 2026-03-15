# Bombermage Improvements Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Seven improvements to Bombermage: input debounce, UI layout changes, chain explosions, updated win condition, death-order tracking, a podium end modal, and a "How to Play" button in the lobby.

**Architecture:** Backend changes are isolated to `BombermageGame.ts`. Frontend changes touch `BombermageControls.tsx`, a new `BombermageEndModal.tsx`, `GameRoom.tsx` (to swap in the new modal), and `SessionLobby.tsx` (new button + modal). The `GameRules` component already exists and is reused as-is.

**Tech Stack:** TypeScript, React 18, Tailwind CSS, Socket.io, Vitest (backend tests)

---

## Chunk 1: Backend — Chain explosions, win condition, death order

### Task 1: Chain bomb explosions

**Files:**
- Modify: `backend/src/games/bombermage/BombermageGame.ts` — `_detonateBomb` and `_resolveExpiredBombs`
- Test: `backend/src/games/bombermage/BombermageGame.test.ts`

- [ ] **Step 1: Write failing test for chain explosions**

Open `backend/src/games/bombermage/BombermageGame.test.ts` and add:

```typescript
it('chain explosion: bomb caught in blast triggers immediately', () => {
  const engine = new BombermageGame();
  // Use initializeBoard with no args, then manually set up the scenario
  const board = engine.initializeBoard() as any;

  // Clear terrain so blasts propagate freely
  for (let r = 0; r < board.terrain.length; r++)
    for (let c = 0; c < board.terrain[0].length; c++)
      if (board.terrain[r][c] === 'destructible') board.terrain[r][c] = 'empty';

  // Place two adjacent bombs: bomb A at (5,5), bomb B at (5,6)
  // Both owned by player 0 (who exists in the default 4-player board)
  board.bombs = [
    { position: { row: 5, col: 5 }, ownerPlayerNumber: 0, placedOnMove: 0, isManual: false },
    { position: { row: 5, col: 6 }, ownerPlayerNumber: 0, placedOnMove: 0, isManual: false },
  ];
  board.players[0].activeBombCount = 2;

  // Trigger _resolveExpiredBombs with a move count past the fuse
  board.totalMoveCount = 10; // fuseLength defaults to 3, so both expired
  board.explosions = [];
  (engine as any)._resolveExpiredBombs(board);

  // Both bombs should be gone (chained)
  expect(board.bombs).toHaveLength(0);
});
```

- [ ] **Step 2: Run test, confirm it fails**

```bash
cd /home/matt/src/games && npm test -- --reporter=verbose 2>&1 | grep -A5 "chain explosion"
```

Expected: FAIL — currently only one bomb detonates.

- [ ] **Step 3: Implement chain explosions in `_detonateBomb`**

In `backend/src/games/bombermage/BombermageGame.ts`, replace `_detonateBomb` with a version that queues up chain reactions. Also clear powerups and coins on blast cells (they become unreachable after box is destroyed, but clearing them now keeps state consistent):

```typescript
private _detonateBomb(bm: any, bombIndex: number): void {
  // Track which bomb positions have been detonated to detect chains.
  // We accumulate all blast cells across the whole chain, then re-scan for
  // newly-caught bombs after each detonation — this avoids stale index bugs
  // from splice shifting array positions.
  const pendingPositions: Position[] = [bm.bombs[bombIndex]?.position];
  const detonatedPositions = new Set<string>();

  const posKey = (p: Position) => `${p.row},${p.col}`;

  while (pendingPositions.length > 0) {
    const pos = pendingPositions.shift()!;
    const key = posKey(pos);
    if (detonatedPositions.has(key)) continue;
    detonatedPositions.add(key);

    // Find the bomb at this position (index may have changed due to prior splices)
    const idx = bm.bombs.findIndex((b: Bomb) => b.position.row === pos.row && b.position.col === pos.col);
    if (idx === -1) continue; // bomb already removed

    const bomb: Bomb = bm.bombs[idx];
    const owner: BombermagePlayer = bm.players[bomb.ownerPlayerNumber];
    const radius = owner?.inventory.blastRadius ?? 1;
    const blastCells = this._calcBlast(bm.terrain, bomb.position, radius);
    bm.explosions.push(...blastCells);

    for (const cell of blastCells) {
      if (bm.terrain[cell.row][cell.col] === 'destructible') {
        bm.terrain[cell.row][cell.col] = 'empty';
        if (bm.powerups?.[cell.row]?.[cell.col]) bm.powerups[cell.row][cell.col] = null;
        if (bm.coins?.[cell.row]?.[cell.col]) bm.coins[cell.row][cell.col] = false;
      }
    }

    // Kill/shield players in blast
    for (const player of bm.players) {
      if (!player.alive) continue;
      if (blastCells.some((c: Position) => c.row === player.position.row && c.col === player.position.col)) {
        if (player.inventory.shield) {
          player.inventory.shield = false;
        } else {
          player.alive = false;
          if (player.deathOrder === undefined) {
            player.deathOrder = bm.deathCount ?? 0;
            bm.deathCount = (bm.deathCount ?? 0) + 1;
          }
        }
      }
    }

    // Remove this bomb
    bm.bombs.splice(idx, 1);
    if (owner) owner.activeBombCount = Math.max(0, owner.activeBombCount - 1);

    // Queue any remaining bombs whose positions are inside the blast
    for (const b of bm.bombs) {
      const bKey = posKey(b.position);
      if (!detonatedPositions.has(bKey) && blastCells.some((c: Position) => c.row === b.position.row && c.col === b.position.col)) {
        pendingPositions.push({ ...b.position });
      }
    }
  }
}
```

Note: `_resolveExpiredBombs` iterates bombs in reverse index order and calls `_detonateBomb` per bomb. Since `_detonateBomb` now handles chaining internally and splices as it goes, update `_resolveExpiredBombs` to re-check each time:

```typescript
private _resolveExpiredBombs(bm: any): void {
  const fuseLength: number = bm.config?.fuseLength ?? 3;
  // Iterate forward; re-check length each time since detonations splice the array
  let i = 0;
  while (i < bm.bombs.length) {
    const bomb: Bomb = bm.bombs[i];
    if (!bomb.isManual && bm.totalMoveCount >= bomb.placedOnMove + fuseLength) {
      // _detonateBomb splices bm.bombs[i] out, so don't increment i
      this._detonateBomb(bm, i);
    } else {
      i++;
    }
  }
}
```

- [ ] **Step 4: Run test, confirm it passes**

```bash
cd /home/matt/src/games && npm test -- --reporter=verbose 2>&1 | grep -A5 "chain explosion"
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
cd /home/matt/src/games && git add backend/src/games/bombermage/BombermageGame.ts backend/src/games/bombermage/BombermageGame.test.ts && git commit -m "feat(bombermage): chain explosions and death order tracking"
```

---

### Task 2: Win condition — no items remaining

**Files:**
- Modify: `backend/src/games/bombermage/BombermageGame.ts` — `checkWinCondition`
- Test: `backend/src/games/bombermage/BombermageGame.test.ts`

- [ ] **Step 1: Write failing test**

```typescript
it('win condition: game ends when no destructible cells, powerups, or coins remain', () => {
  const engine = new BombermageGame();
  const board = engine.initializeBoard({ ...DEFAULT_CONFIG, numPlayers: 2 } as any) as any;

  // Kill player 1 so only player 0 is alive
  board.players[1].alive = false;

  // Sanity: with one alive player, win is already triggered (not this path)
  // Reset — both alive
  board.players[1].alive = true;
  board.players[0].score = 10;
  board.players[1].score = 5;

  // Clear all destructible terrain
  for (let r = 0; r < board.terrain.length; r++)
    for (let c = 0; c < board.terrain[0].length; c++)
      if (board.terrain[r][c] === 'destructible') board.terrain[r][c] = 'empty';

  // Clear all powerups and coins
  for (let r = 0; r < board.powerups.length; r++)
    for (let c = 0; c < board.powerups[0].length; c++) {
      board.powerups[r][c] = null;
      board.coins[r][c] = false;
    }

  const winner = engine.checkWinCondition(board);
  expect(winner).toBe(0); // player 0 has higher score
});

it('win condition: does NOT end while powerups remain', () => {
  const engine = new BombermageGame();
  const board = engine.initializeBoard({ ...DEFAULT_CONFIG, numPlayers: 2 } as any) as any;

  board.players[0].score = 10;
  board.players[1].score = 5;

  // Clear all destructible terrain and coins, but leave one powerup
  for (let r = 0; r < board.terrain.length; r++)
    for (let c = 0; c < board.terrain[0].length; c++)
      if (board.terrain[r][c] === 'destructible') board.terrain[r][c] = 'empty';
  for (let r = 0; r < board.coins.length; r++)
    for (let c = 0; c < board.coins[0].length; c++) board.coins[r][c] = false;

  board.powerups[3][3] = 'blast-radius'; // one powerup remains

  const winner = engine.checkWinCondition(board);
  expect(winner).toBeNull();
});
```

- [ ] **Step 2: Run tests, confirm the second test fails**

Note: The first test (`game ends when no destructible cells, powerups, or coins remain`) will already pass because the current code triggers on `!hasDestructible` alone. Only the second test (`does NOT end while powerups remain`) will fail — that's the one we're fixing.

```bash
cd /home/matt/src/games && npm test -- --reporter=verbose 2>&1 | grep -A5 "win condition"
```

- [ ] **Step 3: Update `checkWinCondition`**

```typescript
checkWinCondition(board: BoardState): number | null {
  const bm = board as any;
  const alivePlayers: BombermagePlayer[] = bm.players.filter((p: BombermagePlayer) => p.alive);
  if (alivePlayers.length === 1) return alivePlayers[0].playerNumber;
  if (alivePlayers.length === 0) return bm.currentTurn;

  // Board-cleared win: no destructible cells, no powerups, no coins
  const hasDestructible = bm.terrain?.some((row: TerrainCell[]) =>
    row.some((cell: TerrainCell) => cell === 'destructible')
  );
  const hasPowerup = bm.powerups?.some((row: any[]) =>
    row.some((cell: any) => cell !== null)
  );
  const hasCoin = bm.coins?.some((row: boolean[]) =>
    row.some((cell: boolean) => cell === true)
  );

  if (!hasDestructible && !hasPowerup && !hasCoin) {
    const winner = alivePlayers.reduce((best: BombermagePlayer, p: BombermagePlayer) =>
      p.score > best.score ? p : best
    );
    return winner.playerNumber;
  }

  return null;
}
```

- [ ] **Step 4: Run tests, confirm they pass**

```bash
cd /home/matt/src/games && npm test -- --reporter=verbose 2>&1 | grep -A5 "win condition"
```

- [ ] **Step 5: Run full test suite**

```bash
cd /home/matt/src/games && npm test
```

Expected: all pass

- [ ] **Step 6: Commit**

```bash
cd /home/matt/src/games && git add backend/src/games/bombermage/BombermageGame.ts backend/src/games/bombermage/BombermageGame.test.ts && git commit -m "feat(bombermage): end game only when no items remain on field"
```

---

## Chunk 2: Frontend — Controls UX (debounce, layout, bomb glow)

### Task 3: Input debouncer

**Files:**
- Modify: `frontend/src/components/games/bombermage/BombermageControls.tsx`

No automated test for UI debounce — verify manually.

- [ ] **Step 1: Add `useRef` to the React import and add debounce ref and helper**

First, update the import at the top of the file:

```typescript
import { useEffect, useRef } from 'react';
```

Then, after the existing `const canBomb = ...` line, add:

```typescript
const lastEmitRef = useRef<number>(0);
const DEBOUNCE_MS = 350;

function debounced(fn: () => void) {
  const now = Date.now();
  if (now - lastEmitRef.current < DEBOUNCE_MS) return;
  lastEmitRef.current = now;
  fn();
}
```

- [ ] **Step 2: Wrap all emit calls with `debounced`**

Replace each emit call site:

```typescript
// emitMove — in dpadBtn onClick and onTouchEnd:
onClick={() => { if (me) debounced(() => emitMove({ row: me.position.row + dr, col: me.position.col + dc })); }}
onTouchEnd={(e) => { e.preventDefault(); if (me && enabled) debounced(() => emitMove({ row: me.position.row + dr, col: me.position.col + dc })); }}

// emitPlaceBomb — bomb button onClick and onTouchEnd:
onClick={() => debounced(emitPlaceBomb)}
onTouchEnd={(e) => { e.preventDefault(); if (canBomb) debounced(emitPlaceBomb); }}

// handleEndTurn — end turn button (to be added in Task 4):
onClick={() => debounced(handleEndTurn)}
onTouchEnd={(e) => { e.preventDefault(); debounced(handleEndTurn); }}

// handleRollDice — roll button onClick and onTouchEnd:
onClick={() => debounced(handleRollDice)}
onTouchEnd={(e) => { e.preventDefault(); debounced(handleRollDice); }}
```

- [ ] **Step 3: Verify build compiles**

```bash
cd /home/matt/src/games && npm run build:frontend 2>&1 | tail -20
```

Expected: no TypeScript errors.

- [ ] **Step 4: Commit**

```bash
cd /home/matt/src/games && git add frontend/src/components/games/bombermage/BombermageControls.tsx && git commit -m "feat(bombermage): add 350ms input debounce to controls"
```

---

### Task 4: Reposition End Turn button + bomb glow

**Files:**
- Modify: `frontend/src/components/games/bombermage/BombermageControls.tsx`

- [ ] **Step 1: Remove End Turn from D-pad center cell**

In `centerCell()`, the `diceRoll !== null` branch currently returns a clickable End Turn button. Change it to a non-interactive AP display:

```typescript
if (diceRoll !== null) {
  return (
    <div
      className="w-11 h-11 rounded-lg flex flex-col items-center justify-center gap-0"
      style={{ background: '#0f172a', border: '2px solid #1e293b' }}
    >
      <span className="text-green-400 font-bold text-sm leading-none">{ap}</span>
      <span className="text-[8px] leading-none text-stone-500">AP</span>
    </div>
  );
}
```

- [ ] **Step 2: Add standalone End Turn button and restructure the D-pad + action buttons row**

Replace the current `{/* D-pad + bomb */}` section:

```tsx
{/* D-pad + action buttons */}
<div className="flex items-end gap-3">
  {renderDpad()}
  {/* End Turn + Bomb column, aligned to bottom of dpad */}
  <div className="flex flex-col items-center gap-2 pb-0.5">
    {/* End Turn — only shown when it's my turn and dice has been rolled */}
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
      <div className="h-[26px]" /> /* spacer to keep bomb button position stable */
    )}
    {/* Bomb button */}
    <button
      className="w-14 h-14 rounded-full flex items-center justify-center text-2xl transition-all active:scale-90 disabled:opacity-30"
      style={{
        background: '#7c2d12',
        border: `3px solid #c2410c`,
        ...(canBomb ? { animation: 'bombGlow 2s ease-in-out infinite' } : {}),
      }}
      disabled={!canBomb}
      onClick={() => debounced(emitPlaceBomb)}
      onTouchEnd={(e) => { e.preventDefault(); if (canBomb) debounced(emitPlaceBomb); }}
    >
      💣
    </button>
  </div>
</div>
```

- [ ] **Step 3: Add `bombGlow` keyframe CSS**

In `frontend/src/index.css` (or the global stylesheet), add:

```css
@keyframes bombGlow {
  0%, 100% { box-shadow: 0 0 4px 1px rgba(194, 65, 12, 0.4); }
  50%       { box-shadow: 0 0 14px 5px rgba(249, 115, 22, 0.75); }
}
```

- [ ] **Step 4: Verify build compiles**

```bash
cd /home/matt/src/games && npm run build:frontend 2>&1 | tail -20
```

- [ ] **Step 5: Commit**

```bash
cd /home/matt/src/games && git add frontend/src/components/games/bombermage/BombermageControls.tsx frontend/src/index.css && git commit -m "feat(bombermage): move End Turn button beside bomb, add bomb breathing glow"
```

---

## Chunk 3: Frontend — Podium end modal

### Task 5: Create `BombermageEndModal`

**Files:**
- Create: `frontend/src/components/games/bombermage/BombermageEndModal.tsx`
- Modify: `frontend/src/components/GameRoom.tsx` — swap in new modal for bombermage

The modal receives the full `session` and `gameState` (same props as `GameEndModal`) plus the existing action callbacks. It reads `gameState.board.players` to build podium ordering.

**Podium ordering logic:**
1. Dead players sorted by `deathOrder` ascending (died first = last place).
2. Alive players sorted by `score` descending.
3. Dead players go to the bottom positions; alive players fill the top positions.
4. Display positions are 1st, 2nd, 3rd, 4th (highest = best).

- [ ] **Step 1: Create `BombermageEndModal.tsx`**

```tsx
import { Session, GameState, TournamentMatch, TournamentFormat } from '@ancient-games/shared';

const PLAYER_COLORS = ['#F97316', '#8B5CF6', '#22C55E', '#EC4899'];

interface BombermageEndModalProps {
  session: Session;
  gameState: GameState;
  currentPlayer?: { id: string; displayName: string; playerNumber: number };
  isSpectator: boolean;
  hubSession: Session | null;
  onPlayAgain: () => void;
  onReturnToBracket: () => void;
  onLeave: () => void;
  onDismiss: () => void;
}

function getWinsNeeded(format: TournamentFormat): number {
  switch (format) {
    case 'bo3': return 2;
    case 'bo5': return 3;
    case 'bo7': return 4;
    default: return 1;
  }
}

export default function BombermageEndModal({
  session,
  gameState,
  currentPlayer,
  isSpectator,
  hubSession,
  onPlayAgain,
  onReturnToBracket,
  onLeave,
  onDismiss,
}: BombermageEndModalProps) {
  const board = gameState.board as any;
  const bmPlayers: any[] = board?.players ?? [];

  // Build podium: alive players by score desc, then dead players by deathOrder asc (last-died first)
  const alive = bmPlayers
    .filter((p: any) => p.alive)
    .sort((a: any, b: any) => b.score - a.score);
  const dead = bmPlayers
    .filter((p: any) => !p.alive)
    .sort((a: any, b: any) => (b.deathOrder ?? 0) - (a.deathOrder ?? 0)); // higher deathOrder = died later = higher rank
  const podium = [...alive, ...dead]; // index 0 = 1st place

  const isTournamentMatch = !!session.tournamentHubCode;
  let seriesText = '';
  let seriesOver = false;
  let tournamentOver = false;
  let currentMatch: TournamentMatch | null = null;

  if (isTournamentMatch && hubSession?.tournamentState) {
    const ts = hubSession.tournamentState;
    tournamentOver = !!ts.winnerId;
    for (const round of ts.rounds) {
      for (const match of round) {
        if (match.currentSessionCode === session.sessionCode) { currentMatch = match; break; }
      }
      if (currentMatch) break;
    }
    if (currentMatch && ts.format !== 'round-robin') {
      const winsNeeded = getWinsNeeded(ts.format);
      seriesText = `Series: ${currentMatch.player1Wins}–${currentMatch.player2Wins}`;
      seriesOver = currentMatch.player1Wins >= winsNeeded || currentMatch.player2Wins >= winsNeeded || currentMatch.status === 'finished';
    } else if (currentMatch) {
      seriesText = `${currentMatch.player1Wins}–${currentMatch.player2Wins}`;
      seriesOver = currentMatch.status === 'finished';
    }
  }

  const renderButtons = () => {
    if (isSpectator) return (
      <button onClick={onLeave} className="btn bg-white/10 hover:bg-white/20 text-white border border-white/20 px-6 py-2">Leave</button>
    );
    if (!isTournamentMatch) return (
      <>
        <button onClick={onPlayAgain} className="btn px-6 py-2 font-bold" style={{ background: '#C4A030', color: '#1A1008' }}>Play Again</button>
        <button onClick={onLeave} className="btn bg-white/10 hover:bg-white/20 text-white border border-white/20 px-6 py-2">Leave</button>
      </>
    );
    if (tournamentOver) return (
      <>
        <button onClick={onReturnToBracket} className="btn px-6 py-2 font-bold" style={{ background: '#C4A030', color: '#1A1008' }}>Return to Bracket</button>
        <button onClick={onLeave} className="btn bg-white/10 hover:bg-white/20 text-white border border-white/20 px-6 py-2">Leave Tournament</button>
      </>
    );
    if (!seriesOver) return (
      <>
        <button onClick={onPlayAgain} className="btn px-6 py-2 font-bold" style={{ background: '#C4A030', color: '#1A1008' }}>Next Game</button>
        <button onClick={onReturnToBracket} className="btn bg-white/10 hover:bg-white/20 text-white border border-white/20 px-6 py-2">Return to Bracket</button>
      </>
    );
    return (
      <>
        <button onClick={onReturnToBracket} className="btn px-6 py-2 font-bold" style={{ background: '#C4A030', color: '#1A1008' }}>Return to Bracket</button>
        <button onClick={onLeave} className="btn bg-white/10 hover:bg-white/20 text-white border border-white/20 px-6 py-2">Leave Tournament</button>
      </>
    );
  };

  const placeLabel = (i: number) => {
    if (i === 0) return '1st 🥇';
    if (i === 1) return '2nd 🥈';
    if (i === 2) return '3rd 🥉';
    return `${i + 1}th`;
  };

  const podiumHeights = ['h-24', 'h-16', 'h-12', 'h-10'];
  // Reorder visually: 2nd, 1st, 3rd, (4th) — classic podium layout
  // For 2 players: just show 1st left, 2nd right. For 3+: 2nd, 1st, 3rd[, 4th]
  const visualOrder =
    podium.length === 2 ? [0, 1] :
    podium.length === 3 ? [1, 0, 2] :
    [1, 0, 2, 3];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.82)' }}>
      <div
        className="relative w-full max-w-md rounded-xl p-6 text-center"
        style={{ background: '#1A1008', border: '1px solid rgba(196,160,48,0.3)' }}
      >
        <button
          onClick={onDismiss}
          aria-label="View board"
          className="absolute top-3 right-3 w-7 h-7 flex items-center justify-center rounded-full text-sm transition-colors"
          style={{ color: '#8A7A60', background: 'rgba(255,255,255,0.05)' }}
          title="View final board"
        >✕</button>

        <div className="text-2xl font-bold mb-1" style={{ color: '#E8C870' }}>Game Over</div>
        {isTournamentMatch && seriesText && (
          <div className="text-sm mb-3 py-1 px-3 rounded-lg inline-block" style={{ background: 'rgba(196,160,48,0.08)', border: '1px solid rgba(196,160,48,0.2)', color: '#C4A030' }}>
            {seriesText}
          </div>
        )}

        {/* Podium */}
        <div className="flex items-end justify-center gap-2 mt-4 mb-6">
          {visualOrder.map((podiumIdx) => {
            const player = podium[podiumIdx];
            if (!player) return null;
            const sessionPlayer = session.players.find(p => p.playerNumber === player.playerNumber);
            const name = sessionPlayer?.displayName ?? `P${player.playerNumber + 1}`;
            const color = PLAYER_COLORS[player.playerNumber] ?? '#888';
            const isDead = !player.alive;
            const isMe = currentPlayer?.playerNumber === player.playerNumber;

            return (
              <div
                key={player.playerNumber}
                className="flex flex-col items-center gap-1"
                style={{ opacity: isDead ? 0.4 : 1 }}
              >
                <div className="text-[10px] font-semibold truncate max-w-[60px]" style={{ color: isMe ? '#E8C870' : '#d4cdb0' }}>
                  {name}
                </div>
                <div className="text-[10px] text-yellow-300">🪙 {player.score ?? 0}</div>
                {/* Token */}
                <div className="w-8 h-8 rounded-full border-2 flex items-center justify-center text-sm font-bold" style={{ backgroundColor: color, borderColor: 'rgba(255,255,255,0.3)', color: '#fff' }}>
                  {player.playerNumber + 1}
                </div>
                {/* Podium block */}
                <div
                  className={`w-14 ${podiumHeights[podiumIdx] ?? 'h-8'} rounded-t-md flex items-start justify-center pt-1`}
                  style={{ background: podiumIdx === 0 ? '#854d0e' : '#292524', border: '1px solid rgba(255,255,255,0.08)' }}
                >
                  <span className="text-[10px] font-bold" style={{ color: podiumIdx === 0 ? '#fde68a' : '#a8a29e' }}>
                    {placeLabel(podiumIdx)}
                  </span>
                </div>
              </div>
            );
          })}
        </div>

        <div className="flex gap-3 justify-center flex-wrap">{renderButtons()}</div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Wire into `GameRoom.tsx`**

At the top of `GameRoom.tsx`, add the import:

```typescript
import BombermageEndModal from './games/bombermage/BombermageEndModal';
```

Find the `{showGameEndModal && ...}` block (around line 1118) and update it to use `BombermageEndModal` for bombermage games:

```tsx
{showGameEndModal && gameState.finished && gameState.winner !== null && (
  session.gameType === 'bombermage' ? (
    <BombermageEndModal
      session={session}
      gameState={gameState}
      currentPlayer={currentPlayer}
      isSpectator={isSpectator}
      hubSession={hubSession}
      onPlayAgain={() => { setShowGameEndModal(false); handleRematch(); }}
      onReturnToBracket={handleReturnToBracket}
      onLeave={handleLeave}
      onDismiss={() => { setShowGameEndModal(false); setGameEndDismissed(true); }}
    />
  ) : (
    <GameEndModal
      session={session}
      gameState={gameState}
      currentPlayer={currentPlayer}
      isSpectator={isSpectator}
      hubSession={hubSession}
      onPlayAgain={() => { setShowGameEndModal(false); handleRematch(); }}
      onReturnToBracket={handleReturnToBracket}
      onLeave={handleLeave}
      onDismiss={() => { setShowGameEndModal(false); setGameEndDismissed(true); }}
    />
  )
)}
```

- [ ] **Step 3: Verify build compiles**

```bash
cd /home/matt/src/games && npm run build:frontend 2>&1 | tail -20
```

- [ ] **Step 4: Commit**

```bash
cd /home/matt/src/games && git add frontend/src/components/games/bombermage/BombermageEndModal.tsx frontend/src/components/GameRoom.tsx && git commit -m "feat(bombermage): podium end modal with death-order ranking"
```

---

## Chunk 4: Frontend — "How to Play" in lobby

### Task 6: Add How to Play button to `SessionLobby`

**Files:**
- Modify: `frontend/src/components/lobby/SessionLobby.tsx`

- [ ] **Step 1: Add imports and state**

At the top of `SessionLobby.tsx`, add:

```typescript
import GameRules from '../GameRules';
```

Inside the `SessionLobby` component function, add state after the existing state declarations:

```typescript
const [showRules, setShowRules] = useState(false);
```

- [ ] **Step 2: Add "How to Play" button in the action buttons area**

Find the `{/* Action buttons */}` section (around line 1079). Add the button alongside the existing Start/Leave buttons:

```tsx
<button
  onClick={() => setShowRules(true)}
  className="btn px-4 py-2 text-sm font-medium"
  style={{ background: 'rgba(196,160,48,0.1)', border: '1px solid rgba(196,160,48,0.3)', color: '#C4A030' }}
>
  How to Play
</button>
```

- [ ] **Step 3: Add the rules modal**

At the bottom of the lobby JSX return, after the `FeedbackModal` block and before the outer closing `</div>`, add:

```tsx
{showRules && session && (
  <div
    className="fixed inset-0 z-50 flex items-center justify-center p-4"
    style={{ background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(4px)' }}
    onClick={() => setShowRules(false)}
  >
    <div
      className="relative w-full max-w-2xl max-h-[80vh] overflow-y-auto rounded-xl p-6"
      style={{ background: '#1A1008', border: '1px solid rgba(196,160,48,0.3)' }}
      onClick={(e) => e.stopPropagation()}
    >
      <button
        onClick={() => setShowRules(false)}
        className="absolute top-4 right-4 w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold transition-colors"
        style={{ background: 'rgba(80,60,30,0.5)', color: '#E8C870', border: '1px solid rgba(196,160,48,0.25)' }}
      >
        ✕
      </button>
      <h2 className="text-xl font-bold mb-4" style={{ color: '#E8C870' }}>How to Play</h2>
      <GameRules gameType={session.gameType} />
    </div>
  </div>
)}
```

- [ ] **Step 4: Verify build compiles**

```bash
cd /home/matt/src/games && npm run build:frontend 2>&1 | tail -20
```

- [ ] **Step 5: Commit**

```bash
cd /home/matt/src/games && git add frontend/src/components/lobby/SessionLobby.tsx && git commit -m "feat(lobby): add How to Play button and rules modal"
```

---

## Final verification

- [ ] **Run full test suite**

```bash
cd /home/matt/src/games && npm test
```

Expected: all pass.

- [ ] **Lint check**

```bash
cd /home/matt/src/games && npm run lint
```

Expected: no errors.
