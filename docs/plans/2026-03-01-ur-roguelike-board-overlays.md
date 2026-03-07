# Ur Roguelike Board Overlays Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Visually mark event squares, barrier squares, and extra rosettes on the Ur board so players can always see which squares will trigger effects.

**Architecture:** All changes are in `UrBoard.tsx`. The `BoardState` already carries `eventSquares`, `barrierSquares`, and `extraRosettes` as optional fields. `UrBoard` reads `gameState.board` in scope, so it can read these fields without any prop changes. Regular Ur games simply have these fields absent and see no change.

**Tech Stack:** TypeScript, React 18, Tailwind CSS, Vitest (no new deps)

---

## Task 1: Merge extra rosettes into shared-square rendering and canMovePiece

**Files:**
- Modify: `frontend/src/components/games/ur/UrBoard.tsx`

The board currently uses a module-level constant `ROSETTE_POSITIONS = [2, 6, 13]` and checks it in two places: `renderShared` (to decide whether to draw the flower SVG) and `canMovePiece` (to decide whether a rosette blocks capture). Neither reads `board.extraRosettes`.

**Step 1: In `renderShared`, compute merged rosettes from board state**

In `renderShared` (around line 359), change:

```tsx
const renderShared = (sharedIndex: number) => {
  const position = sharedIndex + 4;
  const isRosette = ROSETTE_POSITIONS.includes(position);
```

to:

```tsx
const renderShared = (sharedIndex: number) => {
  const position = sharedIndex + 4;
  const allRosettes = [...ROSETTE_POSITIONS, ...(gameState.board.extraRosettes ?? [])];
  const isRosette = allRosettes.includes(position);
```

**Step 2: In `canMovePiece`, merge extra rosettes for the capture-on-rosette check**

In `canMovePiece` (around line 216–222), change:

```tsx
    if (
      to >= SHARED_START &&
      to <= SHARED_END &&
      ROSETTE_POSITIONS.includes(to) &&
      gameState.board.pieces.some((p) => p.playerNumber !== playerNumber && p.position === to)
    ) {
      return false;
    }
```

to:

```tsx
    const allRosettes = [...ROSETTE_POSITIONS, ...(gameState.board.extraRosettes ?? [])];
    if (
      to >= SHARED_START &&
      to <= SHARED_END &&
      allRosettes.includes(to) &&
      gameState.board.pieces.some((p) => p.playerNumber !== playerNumber && p.position === to)
    ) {
      return false;
    }
```

**Step 3: Build frontend to confirm no TypeScript errors**

```bash
npm run build --workspace=frontend 2>&1 | tail -20
```

Expected: builds cleanly.

**Step 4: Commit**

```bash
git add frontend/src/components/games/ur/UrBoard.tsx
git commit -m "feat(frontend): respect extraRosettes in Ur board rendering and move validation"
```

---

## Task 2: Add barrier square overlay in renderShared and block in canMovePiece

**Files:**
- Modify: `frontend/src/components/games/ur/UrBoard.tsx`

Barrier squares are stored in `board.barrierSquares` as `{ position: number; turnsRemaining: number }[]`. They need a visually blocked appearance and a turn-counter badge. They also need to be blocked in the client-side `canMovePiece` check.

**Step 1: Block barrier squares in `canMovePiece`**

After the early-return checks at the top of `canMovePiece` (around line 195), add:

```tsx
    // Barrier squares are impassable
    if ((gameState.board.barrierSquares ?? []).some((b) => b.position === to)) return false;
```

Add it after the `if (piece.position === 99) return false;` line.

**Step 2: Detect barrier in `renderShared` and apply styled overlay**

In `renderShared`, after computing `allRosettes` and `isRosette`, add:

```tsx
  const barrier = (gameState.board.barrierSquares ?? []).find((b) => b.position === position);
  const isBarrier = !!barrier;
```

Then replace the `baseBg` / `baseBorder` block for the shared square:

```tsx
  const baseBg = eg
    ? isRosette ? '#D4C4A0' : '#E8DCC8'
    : isRosette ? '#3A2400' : '#1A1208';
  const baseBorder = eg
    ? isRosette ? '#C0A060' : '#C0A870'
    : isRosette ? '#C4860A' : '#3A2E1C';
```

with:

```tsx
  const baseBg = isBarrier
    ? (eg ? '#3A0A0A' : '#2A0808')
    : eg
      ? isRosette ? '#D4C4A0' : '#E8DCC8'
      : isRosette ? '#3A2400' : '#1A1208';
  const baseBorder = isBarrier
    ? '#8B0000'
    : eg
      ? isRosette ? '#C0A060' : '#C0A870'
      : isRosette ? '#C4860A' : '#3A2E1C';
```

**Step 3: Add barrier badge inside the cell**

In `renderShared`'s returned JSX, after `{isRosette && <RosettePattern />}`, add:

```tsx
        {isBarrier && (
          <div
            className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none z-10"
          >
            <span style={{ fontSize: '14px', lineHeight: 1 }}>🚧</span>
            <span style={{ fontSize: '8px', color: '#FF6060', fontWeight: 700, lineHeight: 1 }}>
              {barrier!.turnsRemaining}
            </span>
          </div>
        )}
```

**Step 4: Build frontend**

```bash
npm run build --workspace=frontend 2>&1 | tail -20
```

Expected: no errors.

**Step 5: Commit**

```bash
git add frontend/src/components/games/ur/UrBoard.tsx
git commit -m "feat(frontend): render barrier squares with blocked styling and turn counter"
```

---

## Task 3: Add event square overlay in renderShared

**Files:**
- Modify: `frontend/src/components/games/ur/UrBoard.tsx`

Event squares are stored in `board.eventSquares` as `number[]`. They should always show a ⚗️ glyph and a teal border when present in the array. They disappear automatically when removed (after being triggered).

**Step 1: Detect event square in `renderShared`**

After the `barrier` / `isBarrier` lines, add:

```tsx
  const isEventSquare = (gameState.board.eventSquares ?? []).includes(position);
```

**Step 2: Factor event square into the border colour**

Update `baseBorder` to also check `isEventSquare` (barriers take priority):

```tsx
  const baseBorder = isBarrier
    ? '#8B0000'
    : isEventSquare
      ? (eg ? '#5A7A8A' : '#2A6A7A')
      : eg
        ? isRosette ? '#C0A060' : '#C0A870'
        : isRosette ? '#C4860A' : '#3A2E1C';
```

And update `baseBg` to give event squares a subtle teal tint:

```tsx
  const baseBg = isBarrier
    ? (eg ? '#3A0A0A' : '#2A0808')
    : isEventSquare
      ? (eg ? '#D8E8EC' : '#0A1E22')
      : eg
        ? isRosette ? '#D4C4A0' : '#E8DCC8'
        : isRosette ? '#3A2400' : '#1A1208';
```

**Step 3: Add ⚗️ badge inside the cell**

After the barrier badge JSX, add:

```tsx
        {isEventSquare && !isBarrier && (
          <div
            className="absolute bottom-0.5 right-0.5 pointer-events-none z-10"
          >
            <span style={{ fontSize: '9px', lineHeight: 1, opacity: 0.85 }}>⚗️</span>
          </div>
        )}
```

The badge is in the corner so it doesn't obscure pieces. It goes away the moment `board.eventSquares` is updated by the server.

**Step 4: Update the board legend in `UrBoard` to mention event squares when present**

In the legend section (around line 514), after the existing "Rosette" and "Shared path" entries, add:

```tsx
            {(gameState.board.eventSquares ?? []).length > 0 && (
              <div className="flex items-center gap-1.5">
                <div
                  className="w-5 h-5 rounded flex items-center justify-center"
                  style={{ background: eg ? '#D8E8EC' : '#0A1E22', border: `1px solid ${eg ? '#5A7A8A' : '#2A6A7A'}` }}
                >
                  <span style={{ fontSize: '9px' }}>⚗️</span>
                </div>
                <span style={{ fontSize: '9px', color: '#908070' }}>Event square — triggers a random effect</span>
              </div>
            )}
```

**Step 5: Remove the redundant text legend from `UrRoguelikeBoard`**

In `frontend/src/components/games/ur-roguelike/UrRoguelikeBoard.tsx`, delete this block (around lines 170–174):

```tsx
      {/* Event square legend */}
      {(board.eventSquares ?? []).length > 0 && (
        <div className="text-xs mb-2" style={{ color: '#7A6A50' }}>
          ⚗️ Event squares: positions {(board.eventSquares ?? []).sort((a, b) => a - b).join(', ')}
        </div>
      )}
```

It's now redundant — the board legend covers this.

**Step 6: Build frontend**

```bash
npm run build --workspace=frontend 2>&1 | tail -20
```

Expected: no errors.

**Step 7: Commit**

```bash
git add frontend/src/components/games/ur/UrBoard.tsx frontend/src/components/games/ur-roguelike/UrRoguelikeBoard.tsx
git commit -m "feat(frontend): highlight event squares on Ur board with teal glow and flask badge"
```

---

## Task 4: Smoke test

Start the dev servers and verify in two browser tabs:

```bash
npm run dev:backend &
npm run dev:frontend
```

Checklist:
- [ ] Regular Ur game looks unchanged (no extra overlays)
- [ ] Ur: Cursed Paths — after draft, three ⚗️ badges visible on the shared track
- [ ] Moving a piece onto an event square: badge disappears on that square after the move
- [ ] `rosette_shift` event: the new rosette renders the gold flower pattern on the affected square
- [ ] `barrier` event: blocked square shows red background + 🚧 + turn counter; count decrements each turn
- [ ] `canMovePiece` correctly disallows clicking a piece that would land on a barrier
- [ ] Board legend shows the ⚗️ entry when event squares remain, disappears when all are consumed
