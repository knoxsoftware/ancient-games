# Bombermage UI Redesign Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Fix mobile overflow, add readable CSS gradient terrain patterns, add a missing dice roll button, and split the HUD into a left/center/right 3-column layout.

**Architecture:** All changes are in two frontend files only — `BombermageBoard.tsx` (responsive grid + terrain) and `BombermageControls.tsx` (HUD restructure + roll button). No backend changes needed. No new files.

**Tech Stack:** React 18, Tailwind CSS, inline styles with `repeating-linear-gradient` for terrain patterns, Socket.io client.

---

### Task 1: Responsive board grid

**Files:**
- Modify: `frontend/src/components/games/bombermage/BombermageBoard.tsx`

**Step 1: Remove the fixed CELL_SIZE constant and update the grid container**

Replace this at the top of the file:
```tsx
const CELL_SIZE = 44; // px
```
Delete it entirely. It will no longer be used.

Replace the board container div (currently using `display: grid` inline style with fixed pixel columns):
```tsx
<div
  className="relative border-2 border-stone-600 rounded w-full"
  style={{
    display: 'grid',
    gridTemplateColumns: `repeat(${cols}, 1fr)`,
    maxWidth: `${cols * 40}px`,
  }}
>
```

And remove `style={{ width: CELL_SIZE, height: CELL_SIZE }}` from each cell div, replacing with `className="aspect-square"` added to the cell's existing className.

The cell div should go from:
```tsx
<div
  key={`${r}-${c}`}
  className={`relative flex items-center justify-center cursor-pointer select-none
    ${TERRAIN_STYLE[cell]}
    ${exploding ? 'bg-orange-500' : ''}
  `}
  style={{ width: CELL_SIZE, height: CELL_SIZE }}
  onClick={() => handleCellClick(r, c)}
>
```
To:
```tsx
<div
  key={`${r}-${c}`}
  className={`relative flex items-center justify-center cursor-pointer select-none aspect-square
    ${exploding ? '' : ''}
  `}
  style={terrainStyle(cell, exploding)}
  onClick={() => handleCellClick(r, c)}
>
```

**Step 2: Replace TERRAIN_STYLE with a terrainStyle function using CSS gradients**

Remove:
```tsx
const TERRAIN_STYLE: Record<TerrainCell, string> = {
  empty: 'bg-stone-800',
  indestructible: 'bg-stone-600 border border-stone-500',
  destructible: 'bg-amber-800 border border-amber-600',
};
```

Add this function instead:
```tsx
function terrainStyle(cell: TerrainCell, exploding: boolean): React.CSSProperties {
  if (exploding) {
    return { background: '#f97316', border: '1px solid #ea580c' };
  }
  switch (cell) {
    case 'empty':
      return {
        background: `
          repeating-linear-gradient(
            45deg,
            rgba(255,255,255,0.025) 0px,
            rgba(255,255,255,0.025) 1px,
            transparent 1px,
            transparent 8px
          ),
          repeating-linear-gradient(
            -45deg,
            rgba(255,255,255,0.025) 0px,
            rgba(255,255,255,0.025) 1px,
            transparent 1px,
            transparent 8px
          ),
          #0f172a
        `,
        border: '1px solid #1e293b',
      };
    case 'indestructible':
      return {
        background: `
          repeating-linear-gradient(
            0deg,
            rgba(0,0,0,0.3) 0px,
            rgba(0,0,0,0.3) 1px,
            transparent 1px,
            transparent 12px
          ),
          repeating-linear-gradient(
            90deg,
            rgba(0,0,0,0.2) 0px,
            rgba(0,0,0,0.2) 1px,
            transparent 1px,
            transparent 24px
          ),
          #334155
        `,
        border: '1px solid #64748b',
      };
    case 'destructible':
      return {
        background: `
          repeating-linear-gradient(
            30deg,
            rgba(0,0,0,0.2) 0px,
            rgba(0,0,0,0.2) 2px,
            transparent 2px,
            transparent 10px
          ),
          repeating-linear-gradient(
            -30deg,
            rgba(255,255,255,0.06) 0px,
            rgba(255,255,255,0.06) 1px,
            transparent 1px,
            transparent 10px
          ),
          #92400e
        `,
        border: '1px solid #d97706',
      };
  }
}
```

Note: remove `exploding` from the `className` string since it's now handled in `terrainStyle`. The explosion overlay div can stay as-is.

**Step 3: Wrap board in a centering container**

The outer `flex flex-col items-center gap-4` div in the return should also get `w-full` so it fills the strip properly:
```tsx
<div className="flex flex-col items-center gap-4 w-full px-2">
```

**Step 4: Verify visually**
Run `npm run dev:frontend` and open the game. Check that:
- Board doesn't overflow on a narrow viewport (resize browser to 375px wide)
- Empty cells show a faint crosshatch pattern
- Walls (indestructible) show a darker slate with grid lines
- Crates (destructible) show warm amber with diagonal stripes

**Step 5: Commit**
```bash
git add frontend/src/components/games/bombermage/BombermageBoard.tsx
git commit -m "feat(bombermage): responsive board grid and CSS gradient terrain patterns"
```

---

### Task 2: Dice roll button + 3-column HUD

**Files:**
- Modify: `frontend/src/components/games/bombermage/BombermageControls.tsx`

**Step 1: Add the roll dice handler**

After the existing `handleEndTurn` function, add:
```tsx
function handleRollDice() {
  const socket = socketService.getSocket();
  if (!socket) return;
  socket.emit('game:roll-dice', {
    sessionCode: session.sessionCode,
    playerId,
  });
}
```

**Step 2: Build helper to render a player panel**

Add this helper inside the component (after `activeInventory`):
```tsx
function renderPlayerPanel(player: any, playerNumber: number, isMe: boolean) {
  if (!player) return <div className="flex-1" />;
  const color = PLAYER_COLORS[playerNumber];
  const inv = player.inventory;
  const badges: string[] = [
    inv.blastRadius > 1 ? `Blast +${inv.blastRadius - 1}` : '',
    inv.maxBombs > 1 ? `${inv.maxBombs} Bombs` : '',
    inv.kickBomb ? 'Kick' : '',
    inv.manualDetonation ? 'Det.' : '',
    inv.shield ? 'Shield' : '',
    inv.speedBoostTurnsRemaining > 0 ? `Speed(${inv.speedBoostTurnsRemaining})` : '',
  ].filter(Boolean);

  return (
    <div className={`flex flex-col gap-1 px-2 ${isMe ? 'items-start' : 'items-end'}`}>
      <div className="flex items-center gap-1.5">
        <div
          className="w-3 h-3 rounded-full border border-white/30 flex-shrink-0"
          style={{ backgroundColor: color }}
        />
        <span className={`text-xs font-semibold truncate max-w-[80px] ${isMe ? 'text-white' : 'text-stone-400'}`}>
          {isMe ? 'You' : (session.players.find(p => p.playerNumber === playerNumber)?.displayName ?? 'Opponent')}
        </span>
      </div>
      <div className={`text-xs ${isMe ? 'text-stone-300' : 'text-stone-500'}`}>
        {player.activeBombCount}/{inv.maxBombs} 💣
      </div>
      <div className={`flex flex-wrap gap-0.5 ${isMe ? '' : 'justify-end'}`}>
        {badges.map(label => (
          <span
            key={label}
            className={`text-[9px] px-1 py-0.5 rounded ${isMe ? 'bg-stone-700 text-stone-200' : 'bg-stone-800 text-stone-500'}`}
          >
            {label}
          </span>
        ))}
      </div>
    </div>
  );
}
```

Note: `PLAYER_COLORS` must be imported or duplicated here. Since it's defined in `BombermageBoard.tsx`, copy the constant into this file:
```tsx
const PLAYER_COLORS = ['#F97316', '#8B5CF6'];
```

**Step 3: Build the center column**

Add this helper inside the component:
```tsx
function renderCenter() {
  const currentTurnName =
    session.players.find(p => p.playerNumber === gameState.board.currentTurn)?.displayName ?? 'Opponent';

  return (
    <div className="flex flex-col items-center justify-center gap-1 px-2 min-w-0">
      {diceRoll === null ? (
        isMyTurn ? (
          <button
            onClick={handleRollDice}
            className="px-3 py-1.5 rounded-lg font-bold text-sm transition-all active:scale-95"
            style={{
              background: 'linear-gradient(135deg, #f97316 0%, #c2410c 100%)',
              color: '#fff',
              border: '2px solid #f97316',
            }}
          >
            Roll Dice
          </button>
        ) : (
          <div className="text-xs text-stone-500 italic text-center">
            Waiting for<br />
            <span className="text-stone-300">{currentTurnName}</span>
          </div>
        )
      ) : (
        <>
          <div className="flex items-center gap-1.5">
            <span className="text-yellow-300 font-bold text-lg">{diceRoll}</span>
            <span className="text-stone-500 text-xs">roll</span>
            <span className="text-stone-600">|</span>
            <span className="text-green-400 font-bold text-lg">{ap}</span>
            <span className="text-stone-500 text-xs">AP</span>
          </div>
          <div className="text-[9px] text-stone-600 flex gap-2">
            <span>Move 1AP</span>
            <span>Bomb 2AP</span>
          </div>
          {isMyTurn && (
            <button
              onClick={handleEndTurn}
              className="mt-0.5 px-2 py-1 bg-stone-600 hover:bg-stone-500 text-white rounded text-xs font-medium"
            >
              End Turn
            </button>
          )}
        </>
      )}
    </div>
  );
}
```

**Step 4: Replace the return statement with the 3-column layout**

Replace the entire `return (...)` with:
```tsx
const opponent = players[1 - myPN];

return (
  <div className="w-full h-full flex items-center">
    <div className="w-full grid grid-cols-3 gap-1 py-2">
      {renderPlayerPanel(me, myPN, true)}
      {renderCenter()}
      {renderPlayerPanel(opponent, 1 - myPN, false)}
    </div>
  </div>
);
```

Also remove the old separate `opponent` variable declaration and the old `activeInventory` variable — they are superseded by `renderPlayerPanel`.

**Step 5: Clean up unused variables**

Remove from the component body:
- `const opponent = players[1 - myPN];` (move inside return as shown above)
- `const activeInventory = [...]` (now handled inside `renderPlayerPanel`)

**Step 6: Verify**

Run `npm run dev:frontend`. Start a Bombermage game. Check:
- At game start, "Roll Dice" button appears in center column
- After rolling, dice result and AP appear in center
- Left column shows your color dot, name, bomb count, powerup badges
- Right column shows opponent's info (grayed)
- End Turn button appears in center after rolling
- On narrow viewport (375px), layout doesn't overflow

**Step 7: Commit**
```bash
git add frontend/src/components/games/bombermage/BombermageControls.tsx
git commit -m "feat(bombermage): 3-column HUD with roll dice button and player panels"
```
