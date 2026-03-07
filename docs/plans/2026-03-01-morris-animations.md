# Morris Animations & Controls Cleanup Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add piece-move animations to Nine Men's Morris (live moves and move-log replay) and remove the redundant "Your turn / Waiting for…" controls panel.

**Architecture:** Extend the existing `AnimationOverlay` DOM-overlay system (already used by Ur and Senet) to cover Morris by tagging each SVG position node with a `data-cell` attribute, providing game-specific helpers, and wiring Morris into `GameRoom`. A direct (non-stepped) path is used since Morris pieces jump point-to-point. Removal moves (to=99) naturally fade out at the source because no destination DOM node exists for position 99.

**Tech Stack:** React 18, TypeScript, SVG, existing `AnimationOverlay` component (`frontend/src/components/AnimationOverlay.tsx`).

---

### Task 1: Remove the "Your turn / Waiting for…" controls panel

**Files:**
- Modify: `frontend/src/components/games/morris/MorrisControls.tsx`
- Modify: `frontend/src/components/GameControls.tsx`

**Step 1: Make MorrisControls return null**

Replace the entire body of `MorrisControls.tsx` with:

```tsx
import { GameControlsProps } from '../../GameControls';

export default function MorrisControls(_props: GameControlsProps) {
  return null;
}
```

**Step 2: Remove morris from the controlsComponents registry**

In `frontend/src/components/GameControls.tsx`, delete the `morris: MorrisControls` line from `controlsComponents` and remove the `MorrisControls` import:

```ts
// Remove this import:
import MorrisControls from './games/morris/MorrisControls';

// Remove this entry from controlsComponents:
morris: MorrisControls,
```

**Step 3: Verify visually**

Run `npm run dev:frontend` and `npm run dev:backend`. Open a Morris game. Confirm the strip below the board no longer shows "Your turn — make your move on the board" or "Waiting for…".

**Step 4: Commit**

```bash
git add frontend/src/components/games/morris/MorrisControls.tsx \
        frontend/src/components/GameControls.tsx
git commit -m "feat(morris): remove redundant turn status panel"
```

---

### Task 2: Add data-cell attributes to Morris SVG and hide animating piece

**Files:**
- Modify: `frontend/src/components/games/morris/MorrisBoard.tsx`

The `AnimationOverlay` locates board cells using `document.querySelector('[data-cell="morris-pos-N"]')`. Each SVG position group needs this attribute. The board also needs to hide a piece that is currently being animated (its position in state has already updated, but the overlay is visually flying it there).

**Step 1: Add data-cell to each position `<g>` node**

In `MorrisBoard.tsx`, find the `Array.from({ length: 24 }, (_, pos) => { ... })` block. The outer `<g>` element currently looks like:

```tsx
<g
  key={pos}
  onClick={() => handleClick(pos)}
  style={{ cursor: isMyTurn ? 'pointer' : 'default' }}
>
```

Add `data-cell={`morris-pos-${pos}`}` to it:

```tsx
<g
  key={pos}
  data-cell={`morris-pos-${pos}`}
  onClick={() => handleClick(pos)}
  style={{ cursor: isMyTurn ? 'pointer' : 'default' }}
>
```

**Step 2: Use the animatingPiece prop to hide the piece being animated**

`MorrisBoard` already receives `animatingPiece?: { playerNumber: number; pieceIndex: number } | null` but ignores it. Add opacity logic to the piece `<circle>`:

Find this section (around the "Piece circle" comment):

```tsx
{piece ? (
  <circle
    cx={cx}
    cy={cy}
    r={13}
    fill={PLAYER_COLOR[piece.playerNumber]}
    stroke={isSelected ? '#FFD700' : inMill ? '#F59E0B' : 'rgba(255,255,255,0.25)'}
    strokeWidth={isSelected ? 2.5 : 1.5}
    style={{ filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.7))' }}
  />
```

Replace with (add `opacity` to the style):

```tsx
{piece ? (
  <circle
    cx={cx}
    cy={cy}
    r={13}
    fill={PLAYER_COLOR[piece.playerNumber]}
    stroke={isSelected ? '#FFD700' : inMill ? '#F59E0B' : 'rgba(255,255,255,0.25)'}
    strokeWidth={isSelected ? 2.5 : 1.5}
    style={{
      filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.7))',
      opacity:
        animatingPiece?.playerNumber === piece.playerNumber &&
        animatingPiece?.pieceIndex === piece.pieceIndex
          ? 0
          : 1,
    }}
  />
```

**Step 3: Commit**

```bash
git add frontend/src/components/games/morris/MorrisBoard.tsx
git commit -m "feat(morris): add data-cell attributes and hide animating piece"
```

---

### Task 3: Create Morris animation helpers

**Files:**
- Create: `frontend/src/components/games/morris/morrisAnimationHelpers.tsx`

The `AnimationOverlay` requires two helpers: `renderPiece` (renders the flying piece visual) and `getExitSelector` (returns a DOM selector for the exit destination — Morris has no exit, so we return a deliberately non-matching selector, causing the overlay to fade out at the source on removal moves).

**Step 1: Create the file**

```tsx
import React from 'react';

const PLAYER_COLOR = ['#3B82F6', '#EF4444']; // blue / red — mirrors MorrisBoard

export const renderPiece = (playerNumber: number, size: number): React.ReactNode => (
  <svg
    viewBox="0 0 26 26"
    width={size}
    height={size}
    style={{ filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.7))' }}
  >
    <circle
      cx={13}
      cy={13}
      r={11}
      fill={PLAYER_COLOR[playerNumber]}
      stroke="rgba(255,255,255,0.25)"
      strokeWidth={1.5}
    />
  </svg>
);

// Morris has no exit cell — returning a non-matching selector causes the
// AnimationOverlay to fade the piece out at the source (correct for captures).
export const getExitSelector = (_playerNumber: number): string =>
  '[data-morris-exit-nonexistent]';
```

**Step 2: Commit**

```bash
git add frontend/src/components/games/morris/morrisAnimationHelpers.tsx
git commit -m "feat(morris): add animation helpers"
```

---

### Task 4: Update AnimationOverlay to support Morris

**Files:**
- Modify: `frontend/src/components/AnimationOverlay.tsx`

Two functions need Morris cases: `getCellRect` (maps a position number to a DOM rect) and `getPathPositions` (returns the list of intermediate positions the piece travels through).

Morris is a direct-jump game — pieces don't step along a path. So `getPathPositions` always returns just `[to]`. For removal (`to=99`), the destination selector won't match, so `validSteps` is empty and the overlay fades out at source — exactly correct.

**Step 1: Update `getCellRect`**

Find the `function getCellRect(anim: AnimationState, position: number): DOMRect | null` function. It currently has `if (gameType === 'ur')` and `else` (senet) branches. Add a Morris branch **before** the existing branches:

```ts
function getCellRect(anim: AnimationState, position: number): DOMRect | null {
  const { gameType, playerNumber } = anim;
  let selector: string;
  if (gameType === 'morris') {
    if (position === 99 || position < 0) return getExitRect(anim);
    selector = `[data-cell="morris-pos-${position}"]`;
  } else if (gameType === 'ur') {
    // ... existing ur code unchanged ...
  } else {
    // ... existing senet code unchanged ...
  }
  const el = document.querySelector(selector);
  return el ? el.getBoundingClientRect() : null;
}
```

**Step 2: Update `getPathPositions`**

Find `function getPathPositions(gameType: GameType, from: number, to: number): number[]`. Add a Morris case at the top:

```ts
function getPathPositions(gameType: GameType, from: number, to: number): number[] {
  if (gameType === 'morris') {
    // Pieces jump directly — no intermediate steps.
    // from === -1 means placement; to === 99 means removal.
    return [to];
  }
  // Entering from off-board: animate directly to destination in one step
  if (from === -1) return [to];
  // ... existing ur/senet code unchanged ...
}
```

**Step 3: Update PIECE_SIZE for Morris**

In the `AnimationOverlay` component body, find:

```ts
const PIECE_SIZE = gameType === 'ur' ? 28 : 24;
```

Change to:

```ts
const PIECE_SIZE = gameType === 'ur' ? 28 : gameType === 'morris' ? 26 : 24;
```

**Step 4: Commit**

```bash
git add frontend/src/components/AnimationOverlay.tsx
git commit -m "feat(animation-overlay): add Morris support"
```

---

### Task 5: Enable Morris animation in GameRoom and shared manifest

**Files:**
- Modify: `shared/types/game.ts`
- Modify: `frontend/src/components/GameRoom.tsx`

**Step 1: Set supportsAnimation on Morris manifest**

In `shared/types/game.ts`, find the `morris` entry in `GAME_MANIFESTS` and add `supportsAnimation: true`:

```ts
morris: {
  // ... existing fields ...
  supportsAnimation: true,
},
```

**Step 2: Import Morris animation helpers in GameRoom**

At the top of `frontend/src/components/GameRoom.tsx`, add the Morris imports alongside the existing ur/senet ones:

```ts
import {
  renderPiece as morrisRenderPiece,
  getExitSelector as morrisGetExitSelector,
} from './games/morris/morrisAnimationHelpers';
```

**Step 3: Add Morris to the animHelpers switch (live moves)**

Find the block in the `game:move-made` handler that reads:

```ts
const animHelpers =
  gt === 'ur'
    ? { renderPiece: urRenderPiece, getExitSelector: urGetExitSelector }
    : { renderPiece: senetRenderPiece, getExitSelector: senetGetExitSelector };
```

Replace with:

```ts
const animHelpers =
  gt === 'ur' || gt === 'ur-roguelike'
    ? { renderPiece: urRenderPiece, getExitSelector: urGetExitSelector }
    : gt === 'morris'
      ? { renderPiece: morrisRenderPiece, getExitSelector: morrisGetExitSelector }
      : { renderPiece: senetRenderPiece, getExitSelector: senetGetExitSelector };
```

**Step 4: Add Morris to the animHelpers switch (replay)**

Find the `handleReplay` function which has a similar pattern:

```ts
const animHelpers =
  gt === 'ur'
    ? { renderPiece: urRenderPiece, getExitSelector: urGetExitSelector }
    : { renderPiece: senetRenderPiece, getExitSelector: senetGetExitSelector };
```

Apply the same three-way ternary:

```ts
const animHelpers =
  gt === 'ur' || gt === 'ur-roguelike'
    ? { renderPiece: urRenderPiece, getExitSelector: urGetExitSelector }
    : gt === 'morris'
      ? { renderPiece: morrisRenderPiece, getExitSelector: morrisGetExitSelector }
      : { renderPiece: senetRenderPiece, getExitSelector: senetGetExitSelector };
```

**Step 5: Verify the full flow**

1. Run `npm run dev:frontend` + `npm run dev:backend`
2. Open a Morris game with two players (two browser tabs)
3. Make a move — confirm a circle slides from the source position to the destination
4. For a placement move (phase 1), confirm the piece fades in at the destination
5. After a mill is formed, remove an opponent piece — confirm it fades out at the captured position
6. Click a move in the Move History panel — confirm the animation replays

**Step 6: Commit**

```bash
git add shared/types/game.ts frontend/src/components/GameRoom.tsx
git commit -m "feat(morris): enable move animations via AnimationOverlay"
```
