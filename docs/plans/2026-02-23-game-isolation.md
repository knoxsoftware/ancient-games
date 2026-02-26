# Game Isolation Refactor Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Decouple all game-specific logic from shared infrastructure so adding a new game only requires files inside its own folder plus one-line registrations.

**Architecture:** Introduce a `GameManifest` type in shared/ that each game provides (title, emoji, description, colors, flags). Frontend and backend registries auto-collect manifests. Game-specific UI (scores, controls, rules, animations) moves into each game's folder and is loaded dynamically. The `GameEngine` interface gains an `isCaptureMove()` method to remove game-specific board knowledge from the generic move handler.

**Tech Stack:** TypeScript, React 18 lazy/Suspense, Vite dynamic imports, Socket.io

---

## Phase 1: Game Manifest & Title Deduplication

This phase creates the manifest type, populates it for all 6 games, and replaces all 3 duplicated title maps.

### Task 1: Create GameManifest type in shared

**Files:**
- Modify: `shared/types/game.ts`

**Step 1: Add the GameManifest interface**

Add after the `GameType` union:

```ts
export interface GameManifest {
  type: GameType;
  title: string;
  emoji: string;
  description: string;
  playerColors: [string, string]; // [player0Color, player1Color]
  supportsAnimation?: boolean;
  supportsHistory?: boolean;
  disabled?: boolean;
  aiGenerated?: boolean;
}
```

**Step 2: Add a GAME_MANIFESTS record and getGameTitle helper**

```ts
export const GAME_MANIFESTS: Record<GameType, GameManifest> = {
  ur: {
    type: 'ur',
    title: 'Royal Game of Ur',
    emoji: '\u{1F3DB}\uFE0F',
    description: '2 players',
    playerColors: ['#2F6BAD', '#7A4A22'],
    supportsAnimation: true,
    supportsHistory: true,
  },
  senet: {
    type: 'senet',
    title: 'Senet',
    emoji: '\u{1F3FA}',
    description: '2 players',
    playerColors: ['#C4A870', '#3A1A00'],
    supportsAnimation: true,
    supportsHistory: true,
  },
  morris: {
    type: 'morris',
    title: "Nine Men's Morris",
    emoji: '\u2B21',
    description: '2 players',
    playerColors: ['#3B82F6', '#EF4444'],
    supportsHistory: true,
  },
  'wolves-and-ravens': {
    type: 'wolves-and-ravens',
    title: 'Wolves & Ravens',
    emoji: '\u{1F43A}',
    description: 'Asymmetric hunt',
    playerColors: ['#C4900A', '#4A4A80'],
    supportsHistory: true,
    aiGenerated: true,
  },
  'rock-paper-scissors': {
    type: 'rock-paper-scissors',
    title: 'Rock Paper Scissors',
    emoji: '\u2702\uFE0F',
    description: 'Single battle',
    playerColors: ['#6B7280', '#6B7280'],
  },
  'stellar-siege': {
    type: 'stellar-siege',
    title: 'Stellar Siege',
    emoji: '\u{1F680}',
    description: 'Asymmetric defense (coming soon!)',
    playerColors: ['#80DFFF', '#7FFF5A'],
    disabled: true,
    aiGenerated: true,
  },
};

export function getGameTitle(gameType: GameType): string {
  return GAME_MANIFESTS[gameType].title;
}
```

**Step 3: Export from shared index**

Make sure `GameManifest`, `GAME_MANIFESTS`, and `getGameTitle` are exported from the shared package's entry point.

**Step 4: Build shared**

Run: `npm run build --workspace=shared`
Expected: compiles cleanly

**Step 5: Commit**

```
feat: add GameManifest type and GAME_MANIFESTS registry in shared
```

### Task 2: Replace backend gameTitle() with shared getGameTitle

**Files:**
- Modify: `backend/src/socket/gameHandlers.ts`

**Step 1: Replace the gameTitle function**

Remove the `gameTitle` function (lines 11-17). Import `getGameTitle` from `@ancient-games/shared`. Replace all calls to `gameTitle(...)` with `getGameTitle(...)`.

**Step 2: Verify build**

Run: `npm run build:backend`
Expected: compiles cleanly

**Step 3: Commit**

```
refactor: use shared getGameTitle in backend gameHandlers
```

### Task 3: Replace frontend title ternary chains with getGameTitle

**Files:**
- Modify: `frontend/src/components/GameRoom.tsx`

**Step 1: Import getGameTitle**

Add `getGameTitle` to the `@ancient-games/shared` import.

**Step 2: Replace all 3 title ternary chains**

1. Header (line ~614): Replace the nested ternary with `{getGameTitle(session.gameType)}`
2. Push notification (line ~232): Replace with `const gameTitle = getGameTitle(gameType);` (delete the variable declaration that was a ternary chain, keep the `gameType` variable above it)
3. Verify there are no other title ternary chains in the file.

**Step 3: Build frontend**

Run: `npm run build:frontend`
Expected: compiles cleanly

**Step 4: Commit**

```
refactor: use shared getGameTitle in frontend GameRoom
```

### Task 4: Replace MoveLog per-game color map with manifest playerColors

**Files:**
- Modify: `frontend/src/components/MoveLog.tsx`

**Step 1: Import GAME_MANIFESTS**

Add import of `GAME_MANIFESTS` from `@ancient-games/shared`.

**Step 2: Widen the gameType prop**

Change the `gameType` prop type from `'ur' | 'senet' | 'morris' | 'wolves-and-ravens'` to `GameType` (import it). This also fixes the cast in GameRoom.tsx.

**Step 3: Replace playerColor function**

Replace the nested ternary `playerColor` function with:

```ts
const playerColor = (pn: number) => {
  const colors = GAME_MANIFESTS[gameType].playerColors;
  return pn === 0 ? colors[0] : colors[1];
};
```

**Step 4: Fix GameRoom.tsx cast**

In `GameRoom.tsx` line ~993, remove the `as 'ur' | 'senet' | 'morris' | 'wolves-and-ravens'` cast — just pass `session.gameType` directly.

**Step 5: Build frontend**

Run: `npm run build:frontend`
Expected: compiles cleanly

**Step 6: Commit**

```
refactor: use manifest playerColors in MoveLog, widen gameType prop
```

### Task 5: Data-driven Home.tsx game picker

**Files:**
- Modify: `frontend/src/components/Home.tsx`

**Step 1: Import GAME_MANIFESTS and GameType**

Add import from `@ancient-games/shared`.

**Step 2: Replace the 6 hard-coded buttons with a map**

Replace the entire `<div className="grid grid-cols-2 gap-3">` block (lines ~137-218) with:

```tsx
<div className="grid grid-cols-2 gap-3">
  {(Object.values(GAME_MANIFESTS) as GameManifest[]).map((manifest) => (
    <button
      key={manifest.type}
      disabled={manifest.disabled}
      onClick={() => setGameType(manifest.type)}
      className={`p-4 rounded-lg border-2 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 ${
        gameType === manifest.type
          ? 'border-primary-500 bg-primary-500/20'
          : 'border-gray-600 hover:border-gray-500'
      }`}
    >
      <div className="text-2xl mb-2">{manifest.emoji}</div>
      <div className="font-semibold text-sm">
        {manifest.title}
        {manifest.disabled ? ' (DISABLED)' : ''}
        {manifest.aiGenerated ? ' *' : ''}
      </div>
      <div className="text-xs text-gray-400 mt-1">{manifest.description}</div>
    </button>
  ))}
</div>
```

Keep the `* AI-generated game` footnote line below.

**Step 3: Build frontend**

Run: `npm run build:frontend`
Expected: compiles cleanly

**Step 4: Commit**

```
refactor: data-driven game picker in Home.tsx using GAME_MANIFESTS
```

---

## Phase 2: Backend Game Engine Isolation

### Task 6: Add isCaptureMove to GameEngine and remove Ur-specific logic from gameHandlers

**Files:**
- Modify: `shared/types/game.ts` (GameEngine interface)
- Modify: `backend/src/games/GameEngine.ts` (abstract class)
- Modify: `backend/src/games/ur/UrGame.ts`
- Modify: `backend/src/games/senet/SenetGame.ts`
- Modify: `backend/src/games/morris/MorrisGame.ts`
- Modify: `backend/src/games/wolves-and-ravens/WolvesAndRavensGame.ts`
- Modify: `backend/src/games/rock-paper-scissors/RockPaperScissorsGame.ts`
- Modify: `backend/src/games/stellar-siege/StellarSiegeGame.ts`
- Modify: `backend/src/socket/gameHandlers.ts`
- Modify: `frontend/src/components/GameRoom.tsx`

**Step 1: Add isCaptureMove to the shared GameEngine interface**

In `shared/types/game.ts`, add to the `GameEngine` interface:

```ts
isCaptureMove(board: BoardState, move: Move): boolean;
```

**Step 2: Add abstract method to backend GameEngine class**

In `backend/src/games/GameEngine.ts`, add:

```ts
abstract isCaptureMove(board: BoardState, move: Move): boolean;
```

**Step 3: Implement in each game engine**

For **UrGame**: A capture occurs when `move.to` is in the shared middle section (positions 4-11), the destination is not a rosette, and an opponent piece occupies that position.

```ts
isCaptureMove(board: BoardState, move: Move): boolean {
  if (move.to === 99 || move.to < 4 || move.to > 11) return false;
  const movingPlayer = board.pieces.find(
    p => p.pieceIndex === move.pieceIndex && p.position !== 99
  );
  if (!movingPlayer) return false;
  return board.pieces.some(
    p => p.playerNumber !== movingPlayer.playerNumber && p.position === move.to
  );
}
```

For **SenetGame**: Captures happen when landing on a square occupied by a single opponent piece (not protected). Check existing `applyMove` logic for the exact capture conditions and replicate them:

```ts
isCaptureMove(board: BoardState, move: Move): boolean {
  if (move.to === 99 || move.to < 0) return false;
  const movingPlayer = board.pieces.find(
    p => p.pieceIndex === move.pieceIndex
  );
  if (!movingPlayer) return false;
  const target = board.pieces.find(
    p => p.playerNumber !== movingPlayer.playerNumber && p.position === move.to
  );
  return !!target;
}
```

For **MorrisGame**: Morris captures happen via mill formation, not by landing. The move handler uses `wasCapture` from the `HistoricalMove` which is already tracked. Return `false` (captures are handled separately via the remove-piece mechanic):

```ts
isCaptureMove(_board: BoardState, _move: Move): boolean {
  return false; // Morris captures happen via mill removal, not landing
}
```

For **WolvesAndRavensGame**: Wolf captures a raven by landing on it:

```ts
isCaptureMove(board: BoardState, move: Move): boolean {
  // Wolf player has exactly 1 piece
  const wolfPN = board.pieces.filter(p => p.playerNumber === 0).length === 1 ? 0 : 1;
  const movingPlayer = board.pieces.find(p => p.pieceIndex === move.pieceIndex);
  if (!movingPlayer || movingPlayer.playerNumber !== wolfPN) return false;
  return board.pieces.some(
    p => p.playerNumber !== wolfPN && p.position === move.to
  );
}
```

For **RockPaperScissorsGame** and **StellarSiegeGame**: No capture mechanic:

```ts
isCaptureMove(_board: BoardState, _move: Move): boolean {
  return false;
}
```

**Step 4: Replace the Ur-specific check in gameHandlers.ts**

In `backend/src/socket/gameHandlers.ts`, replace lines ~438-444:

```ts
// Before:
const isCapturablePosition = session.gameType !== 'ur' || (move.to >= 4 && move.to <= 11);
const wasCapture = move.to !== 99 && isCapturablePosition && session.gameState.board.pieces.some(
  (p) => p.playerNumber !== player.playerNumber && p.position === move.to,
);

// After:
const wasCapture = gameEngine.isCaptureMove(session.gameState.board, move);
```

**Step 5: Replace the Ur-specific check in frontend GameRoom.tsx**

In `frontend/src/components/GameRoom.tsx`, the `game:move-made` handler (lines ~192-199) also computes `wasCapture` client-side. Since the server already sends `wasCapture` in the `HistoricalMove`, check if the server emits it. If so, use the server value. If not, we need to keep a client-side check but make it generic.

Look at the `game:move-made` event payload — it sends `{ move, gameState }`. The `wasCapture` is computed client-side by comparing previous state. Since we can't call the engine client-side, **add `wasCapture` to the `game:move-made` server emit payload** so the client doesn't need to compute it:

In `backend/src/socket/gameHandlers.ts`, when emitting `game:move-made`, add `wasCapture` to the payload.

In `shared/types/socket-events.ts`, update the `game:move-made` event type to include `wasCapture: boolean`.

In `frontend/src/components/GameRoom.tsx`, use the server-provided `wasCapture` instead of computing it client-side. Remove the `isCapturablePosition` logic entirely.

**Step 6: Build everything**

Run: `npm run build`
Expected: compiles cleanly

**Step 7: Run tests**

Run: `npm test`
Expected: all pass

**Step 8: Commit**

```
refactor: add isCaptureMove to GameEngine, remove Ur-specific logic from handlers
```

---

## Phase 3: Frontend Game Component Isolation

### Task 7: Move game rules into each game's folder

**Files:**
- Create: `frontend/src/components/games/ur/UrRules.tsx`
- Create: `frontend/src/components/games/senet/SenetRules.tsx`
- Create: `frontend/src/components/games/morris/MorrisRules.tsx`
- Create: `frontend/src/components/games/wolves-and-ravens/WolvesAndRavensRules.tsx`
- Create: `frontend/src/components/games/rock-paper-scissors/RockPaperScissorsRules.tsx`
- Create: `frontend/src/components/games/stellar-siege/StellarSiegeRules.tsx`
- Modify: `frontend/src/components/GameRules.tsx`

**Step 1: Extract each rules component**

Move each `*Rules` function from `GameRules.tsx` into its own file in the corresponding game folder. Each file exports the component as default. Keep the `Section` helper in `GameRules.tsx` and export it so each rules file can import it.

Example for `frontend/src/components/games/ur/UrRules.tsx`:

```tsx
import { Section } from '../../GameRules';

export default function UrRules() {
  return (
    <>
      {/* ... exact same JSX as current UrRules function ... */}
    </>
  );
}
```

**Step 2: Rewrite GameRules.tsx as a dynamic loader**

```tsx
import { lazy, Suspense } from 'react';
import { GameType } from '@ancient-games/shared';

interface GameRulesProps {
  gameType: GameType;
}

export function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="font-bold mb-2 text-sm tracking-wide" style={{ color: '#E8C870' }}>
        {title}
      </h3>
      <div style={{ color: '#A09070' }}>{children}</div>
    </div>
  );
}

const rulesComponents: Record<GameType, React.LazyExoticComponent<React.ComponentType>> = {
  ur: lazy(() => import('./games/ur/UrRules')),
  senet: lazy(() => import('./games/senet/SenetRules')),
  morris: lazy(() => import('./games/morris/MorrisRules')),
  'wolves-and-ravens': lazy(() => import('./games/wolves-and-ravens/WolvesAndRavensRules')),
  'rock-paper-scissors': lazy(() => import('./games/rock-paper-scissors/RockPaperScissorsRules')),
  'stellar-siege': lazy(() => import('./games/stellar-siege/StellarSiegeRules')),
};

export default function GameRules({ gameType }: GameRulesProps) {
  const RulesComponent = rulesComponents[gameType];
  return (
    <div
      className="rounded-xl p-5 text-sm leading-relaxed space-y-5"
      style={{
        background: 'rgba(8,5,0,0.7)',
        border: '1px solid rgba(42,30,14,0.8)',
        color: '#C0A870',
      }}
    >
      <Suspense fallback={null}>
        <RulesComponent />
      </Suspense>
    </div>
  );
}
```

Note: The `rulesComponents` record still lists all games, but each rules component is code-split and lives in its own game folder. The dispatch is now a simple lookup instead of a conditional chain. Adding a new game means adding one entry here.

**Step 3: Build frontend**

Run: `npm run build:frontend`
Expected: compiles cleanly

**Step 4: Commit**

```
refactor: move game rules into individual game folders
```

### Task 8: Move game controls into each game's folder

**Files:**
- Create: `frontend/src/components/games/ur/UrControls.tsx`
- Create: `frontend/src/components/games/senet/SenetControls.tsx`
- Create: `frontend/src/components/games/morris/MorrisControls.tsx`
- Create: `frontend/src/components/games/wolves-and-ravens/WolvesAndRavensControls.tsx`
- Create: `frontend/src/components/games/stellar-siege/StellarSiegeControls.tsx`
- Modify: `frontend/src/components/GameControls.tsx`

**Step 1: Extract each game's control component**

Move `UrControls`, `SenetControls`, `MorrisControls`, `WolvesAndRavensControls`, and `StellarSiegeControls` from `GameControls.tsx` into their respective game folders. Each file should also take the imports it needs (e.g., `UrControls` takes the `TetraDice` import from `UrBoard`, `SenetControls` takes `ThrowingSticks` from `SenetBoard`).

Move shared helpers (`WaitingMessage`, etc.) to a shared file or keep them in `GameControls.tsx` and export them.

**Step 2: Rewrite GameControls.tsx as a dispatcher using a record lookup**

```tsx
import { memo, lazy, Suspense } from 'react';
import { Session, GameState, GameType } from '@ancient-games/shared';
import { HistoryEntry } from './MoveLog';

export interface GameControlsProps {
  session: Session;
  gameState: GameState;
  playerId: string;
  isMyTurn: boolean;
  lastMove?: HistoryEntry;
}

// Re-export shared helpers for game control components
export { WaitingMessage } from './gameControlsHelpers';

const controlComponents: Partial<Record<GameType, React.LazyExoticComponent<React.ComponentType<GameControlsProps>>>> = {
  ur: lazy(() => import('./games/ur/UrControls')),
  senet: lazy(() => import('./games/senet/SenetControls')),
  morris: lazy(() => import('./games/morris/MorrisControls')),
  'stellar-siege': lazy(() => import('./games/stellar-siege/StellarSiegeControls')),
  'wolves-and-ravens': lazy(() => import('./games/wolves-and-ravens/WolvesAndRavensControls')),
};

function GameControls(props: GameControlsProps) {
  const ControlComponent = controlComponents[props.session.gameType];
  if (!ControlComponent) return null; // rock-paper-scissors has no controls
  return (
    <Suspense fallback={null}>
      <ControlComponent {...props} />
    </Suspense>
  );
}

export default memo(GameControls);
```

This removes the cross-imports of `TetraDice` and `ThrowingSticks` from `GameControls.tsx` — those imports now live inside each game's own controls file.

**Step 3: Build frontend**

Run: `npm run build:frontend`
Expected: compiles cleanly

**Step 4: Commit**

```
refactor: move game controls into individual game folders
```

### Task 9: Move score display logic into each game's folder

**Files:**
- Create: `frontend/src/components/games/ur/UrScoreInfo.ts`
- Create: `frontend/src/components/games/senet/SenetScoreInfo.ts`
- Create: `frontend/src/components/games/morris/MorrisScoreInfo.ts`
- Create: `frontend/src/components/games/stellar-siege/StellarSiegeScoreInfo.ts`
- Create: `frontend/src/components/games/wolves-and-ravens/WolvesAndRavensScoreInfo.ts`
- Create: `frontend/src/utils/gameScoreInfo.ts` (registry)
- Modify: `frontend/src/components/GameRoom.tsx`

**Step 1: Define a score info function type and create per-game implementations**

Each game exports a function: `(pieces: PiecePosition[], seatIndex: number) => string | null`

Example `frontend/src/components/games/ur/UrScoreInfo.ts`:

```ts
import { PiecePosition } from '@ancient-games/shared';

export function getScoreInfo(pieces: PiecePosition[], seatIndex: number): string | null {
  const escaped = pieces.filter(p => p.playerNumber === seatIndex && p.position === 99).length;
  const waiting = pieces.filter(p => p.playerNumber === seatIndex && p.position === -1).length;
  return `${escaped}/7 escaped \u00B7 ${waiting} waiting`;
}
```

**Step 2: Create a registry**

`frontend/src/utils/gameScoreInfo.ts`:

```ts
import { GameType, PiecePosition } from '@ancient-games/shared';

type ScoreInfoFn = (pieces: PiecePosition[], seatIndex: number) => string | null;

const scoreInfoRegistry: Record<GameType, ScoreInfoFn> = {
  ur: (...args) => require('../components/games/ur/UrScoreInfo').getScoreInfo(...args),
  // ... etc
};
```

Actually, since these are pure functions (no React components), we can just do static imports — no need for lazy loading:

```ts
import { GameType, PiecePosition } from '@ancient-games/shared';
import { getScoreInfo as urScore } from '../components/games/ur/UrScoreInfo';
import { getScoreInfo as senetScore } from '../components/games/senet/SenetScoreInfo';
import { getScoreInfo as morrisScore } from '../components/games/morris/MorrisScoreInfo';
import { getScoreInfo as stellarScore } from '../components/games/stellar-siege/StellarSiegeScoreInfo';
import { getScoreInfo as wolvesScore } from '../components/games/wolves-and-ravens/WolvesAndRavensScoreInfo';

type ScoreInfoFn = (pieces: PiecePosition[], seatIndex: number) => string | null;

const scoreInfoRegistry: Partial<Record<GameType, ScoreInfoFn>> = {
  ur: urScore,
  senet: senetScore,
  morris: morrisScore,
  'stellar-siege': stellarScore,
  'wolves-and-ravens': wolvesScore,
};

export function getScoreInfo(gameType: GameType, pieces: PiecePosition[], seatIndex: number): string | null {
  const fn = scoreInfoRegistry[gameType];
  return fn ? fn(pieces, seatIndex) : null;
}
```

**Step 3: Replace the scoreInfo IIFE in GameRoom.tsx**

Replace the entire `const scoreInfo = (() => { ... })()` block (lines ~726-791) with:

```ts
import { getScoreInfo } from '../utils/gameScoreInfo';
// ...
const scoreInfo = getScoreInfo(session.gameType, boardPieces, seatIndex);
```

**Step 4: Build frontend**

Run: `npm run build:frontend`
Expected: compiles cleanly

**Step 5: Commit**

```
refactor: move per-game score logic into game folders
```

### Task 10: Dynamic board loading in GameRoom.tsx

**Files:**
- Modify: `frontend/src/components/GameRoom.tsx`

**Step 1: Replace the 6 lazy imports + 6 conditionals with a record lookup**

Replace the lazy imports at the top (lines 8-15) and the conditional renders (lines 1031-1081) with:

```tsx
import { GameType } from '@ancient-games/shared';

const boardComponents: Record<GameType, React.LazyExoticComponent<React.ComponentType<any>>> = {
  ur: lazy(() => import('./games/ur/UrBoard')),
  senet: lazy(() => import('./games/senet/SenetBoard')),
  morris: lazy(() => import('./games/morris/MorrisBoard')),
  'wolves-and-ravens': lazy(() => import('./games/wolves-and-ravens/WolvesAndRavensBoard')),
  'rock-paper-scissors': lazy(() => import('./games/rock-paper-scissors/RockPaperScissorsBoard')),
  'stellar-siege': lazy(() => import('./games/stellar-siege/StellarSiegeBoard')),
};
```

And in the render:

```tsx
<Suspense fallback={<div className="flex items-center justify-center py-16 text-sm" style={{ color: 'rgba(196,168,107,0.5)' }}>Loading…</div>}>
  {(() => {
    const BoardComponent = boardComponents[session.gameType];
    return (
      <BoardComponent
        session={session}
        gameState={gameState}
        playerId={playerId!}
        isMyTurn={isMyTurn}
        animatingPiece={animatingPiece}
      />
    );
  })()}
</Suspense>
```

Note: Some boards don't accept `animatingPiece` prop — that's fine, they'll just ignore it.

**Step 2: Build frontend**

Run: `npm run build:frontend`
Expected: compiles cleanly

**Step 3: Commit**

```
refactor: dynamic board loading via record lookup in GameRoom
```

---

## Phase 4: Animation Isolation

### Task 11: Decouple AnimationOverlay from specific game imports

**Files:**
- Modify: `frontend/src/components/AnimationOverlay.tsx`
- Modify: `frontend/src/components/games/ur/UrBoard.tsx` (export a piece renderer)
- Modify: `frontend/src/components/games/senet/SenetBoard.tsx` (export a piece renderer)
- Modify: `frontend/src/components/GameRoom.tsx`

**Step 1: Widen AnimationState gameType**

Change `gameType: 'ur' | 'senet'` to `gameType: GameType` in the `AnimationState` interface. Import `GameType` from shared.

**Step 2: Pass piece renderer as a prop instead of importing directly**

Instead of `AnimationOverlay` importing `UrPiece` and `ConePiece`/`SpoolPiece`, have each game provide a `renderPiece` function. Add a prop to `AnimationOverlay`:

```ts
renderPiece: (playerNumber: number, size: number) => React.ReactNode;
```

Move the piece selection logic out of `AnimationOverlay` and into `GameRoom.tsx` (or a per-game helper). When creating the animation state, also supply the render function.

Alternatively, keep it simpler: create a `getAnimationPieceRenderer` registry similar to the score registry, where each game that supports animation exports a renderer function.

**Step 3: Update GameRoom.tsx to pass renderPiece**

Where `pendingAnimation` and `replayAnimation` are created, also resolve the piece renderer from the registry and pass it through.

**Step 4: Remove direct imports from AnimationOverlay.tsx**

Remove `import { UrPiece } from './games/ur/UrBoard'` and `import { ConePiece, SpoolPiece } from './games/senet/SenetBoard'`.

**Step 5: Update getExitRect to not be game-specific**

The `getExitRect` function uses hardcoded selectors like `[data-cell="ur-p${playerNumber}-13"]`. Accept a `getExitSelector` function prop or have each game provide its exit cell selector.

**Step 6: Build frontend**

Run: `npm run build:frontend`
Expected: compiles cleanly

**Step 7: Commit**

```
refactor: decouple AnimationOverlay from game-specific imports
```

---

## Phase 5: Final Cleanup

### Task 12: Use supportsAnimation and supportsHistory from manifest

**Files:**
- Modify: `frontend/src/components/GameRoom.tsx`

**Step 1: Replace hardcoded animation gating**

Replace:
```ts
const supportsAnimation = currentSession?.gameType === 'ur' || currentSession?.gameType === 'senet';
```

With:
```ts
const supportsAnimation = GAME_MANIFESTS[currentSession?.gameType ?? 'ur'].supportsAnimation ?? false;
```

**Step 2: Replace hardcoded replay gating**

Replace:
```ts
if (gt !== 'ur' && gt !== 'senet') return;
```

With:
```ts
if (!GAME_MANIFESTS[gt].supportsAnimation) return;
```

**Step 3: Build and verify**

Run: `npm run build`
Expected: compiles cleanly

**Step 4: Commit**

```
refactor: use manifest flags for animation/history support gating
```

### Task 13: Update CLAUDE.md with new conventions

**Files:**
- Modify: `CLAUDE.md`

**Step 1: Update the "Adding a new game" section**

Update the instructions to reflect the new structure. Adding a new game now requires:

1. Create `backend/src/games/<name>/<Name>Game.ts` extending `GameEngine` (including `isCaptureMove`)
2. Register it in `GameRegistry.ts`
3. Add the game type to the `GameType` union in `shared/types/game.ts`
4. Add a `GameManifest` entry in `GAME_MANIFESTS` in `shared/types/game.ts`
5. Create `frontend/src/components/games/<name>/<Name>Board.tsx` (default export)
6. Create `frontend/src/components/games/<name>/<Name>Rules.tsx` (default export)
7. Create `frontend/src/components/games/<name>/<Name>ScoreInfo.ts` (if applicable)
8. Create `frontend/src/components/games/<name>/<Name>Controls.tsx` (if applicable)
9. Register in lookup records: `boardComponents` in `GameRoom.tsx`, `rulesComponents` in `GameRules.tsx`, `controlComponents` in `GameControls.tsx`, score registry in `gameScoreInfo.ts`

Also note: No changes needed to `Home.tsx` (data-driven from manifest), no changes to `MoveLog.tsx` (uses manifest colors), no game-specific logic in `gameHandlers.ts` (uses engine methods).

**Step 2: Commit**

```
docs: update CLAUDE.md with new game isolation conventions
```

### Task 14: Final verification

**Step 1: Full build**

Run: `npm run build`
Expected: all 3 workspaces compile cleanly

**Step 2: Run tests**

Run: `npm test`
Expected: all tests pass

**Step 3: Lint**

Run: `npm run lint`
Expected: no errors (warnings acceptable)

**Step 4: Manual smoke test**

Run: `npm run dev:backend` and `npm run dev:frontend` in separate terminals.
- Visit localhost:5173
- Verify Home page renders all 6 games correctly
- Create an Ur session, verify the board loads, rules panel works, controls render
- Check that Stellar Siege still shows as disabled

**Step 5: Commit any fixes if needed**

---

## Execution Notes

- **Context clearing:** Clear context after Phase 1 (Tasks 1-5), after Phase 2 (Task 6), after Phase 3 (Tasks 7-10), and after Phase 4-5 (Tasks 11-14). Each phase is self-contained.
- **Testing:** Run `npm run build` and `npm test` after each task to catch issues early.
- **Backwards compatibility:** No API changes, no database changes, no socket event changes (except adding `wasCapture` to `game:move-made` which is additive).
