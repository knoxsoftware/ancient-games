# Player Info Piece Preview Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Show a small SVG preview of each player's piece in their player info card, both in the GameRoom game tab and in the tournament bracket `PlayerInfoRow`.

**Architecture:** Create a single `GamePiecePreview` component that switches on `gameType` and renders the appropriate piece SVG at a given size. Reuse existing exported piece components (UrPiece, ConePiece, SpoolPiece); inline small SVG snippets for the others. Return `null` for games with no piece identity (rock-paper-scissors). Add the preview to two call sites: `GameRoom.tsx` player cards and `TournamentBracket.tsx` `PlayerInfoRow`.

**Tech Stack:** React 18, TypeScript, SVG, Tailwind CSS, `@ancient-games/shared` (GameType)

---

### Task 1: Create `GamePiecePreview` component

**Files:**
- Create: `frontend/src/components/games/GamePiecePreview.tsx`

**Step 1: Create the file**

```tsx
import { useId } from 'react';
import { GameType } from '@ancient-games/shared';
import { UrPiece } from './ur/UrBoard';
import { ConePiece, SpoolPiece } from './senet/SenetBoard';

interface GamePiecePreviewProps {
  gameType: GameType;
  playerNumber: 0 | 1;
  size?: number;
}

function MorrisPiecePreview({ playerNumber, size }: { playerNumber: 0 | 1; size: number }) {
  const color = playerNumber === 0 ? '#3B82F6' : '#EF4444';
  return (
    <svg viewBox="0 0 16 16" width={size} height={size}>
      <circle cx="8" cy="8" r="6" fill={color} style={{ filter: 'drop-shadow(0 1px 3px rgba(0,0,0,0.7))' }} />
    </svg>
  );
}

function WolvesAndRavensPiecePreview({ playerNumber, size }: { playerNumber: 0 | 1; size: number }) {
  const uid = useId();
  if (playerNumber === 0) {
    // Wolf: gold gradient
    const gradId = `wolf-prev-${uid}`;
    return (
      <svg viewBox="0 0 40 40" width={size} height={size}>
        <defs>
          <radialGradient id={gradId} cx="40%" cy="35%" r="60%">
            <stop offset="0%" stopColor="#F0B820" />
            <stop offset="100%" stopColor="#9A6008" />
          </radialGradient>
        </defs>
        <circle cx="20" cy="20" r="17" fill={`url(#${gradId})`} stroke="#E8B020" strokeWidth="2" style={{ filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.7))' }} />
        <text x="20" y="26" textAnchor="middle" fontSize="16" fontWeight="bold" fill="#3A2000">W</text>
      </svg>
    );
  }
  // Raven: dark gradient
  const gradId = `raven-prev-${uid}`;
  return (
    <svg viewBox="0 0 30 30" width={size} height={size}>
      <defs>
        <radialGradient id={gradId} cx="40%" cy="35%" r="60%">
          <stop offset="0%" stopColor="#2A2A48" />
          <stop offset="100%" stopColor="#0A0A18" />
        </radialGradient>
      </defs>
      <circle cx="15" cy="15" r="12" fill={`url(#${gradId})`} stroke="rgba(160,160,200,0.45)" strokeWidth="1.5" style={{ filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.7))' }} />
      <circle cx="15" cy="15" r="3.5" fill="rgba(200,200,240,0.5)" />
    </svg>
  );
}

function StellarSiegePiecePreview({ playerNumber, size }: { playerNumber: 0 | 1; size: number }) {
  const uid = useId();
  if (playerNumber === 0) {
    // Cannon: cyan
    const gradId = `cannon-prev-${uid}`;
    return (
      <svg viewBox="0 0 40 40" width={size} height={size}>
        <defs>
          <radialGradient id={gradId} cx="50%" cy="40%" r="60%">
            <stop offset="0%" stopColor="#80EEFF" />
            <stop offset="100%" stopColor="#0070A0" />
          </radialGradient>
        </defs>
        {/* Base */}
        <rect x="12" y="28" width="16" height="8" rx="2" fill="#005578" stroke="rgba(0,200,255,0.5)" strokeWidth="1" />
        {/* Barrel */}
        <rect x="16" y="16" width="8" height="14" rx="2" fill="#00A0C8" stroke="rgba(0,220,255,0.6)" strokeWidth="1" />
        {/* Tip */}
        <polygon points="20,6 28,16 12,16" fill={`url(#${gradId})`} stroke="#40E8FF" strokeWidth="1.5" style={{ filter: 'drop-shadow(0 0 4px rgba(0,200,255,0.6))' }} />
      </svg>
    );
  }
  // Alien: green
  const gradId = `alien-prev-${uid}`;
  return (
    <svg viewBox="0 0 30 36" width={size} height={size}>
      <defs>
        <radialGradient id={gradId} cx="40%" cy="35%" r="60%">
          <stop offset="0%" stopColor="#0A2A0A" />
          <stop offset="100%" stopColor="#010801" />
        </radialGradient>
      </defs>
      {/* Antennae */}
      <line x1="9" y1="10" x2="5" y2="2" stroke="rgba(57,255,20,0.55)" strokeWidth="1.5" />
      <circle cx="5" cy="2" r="2" fill="#39FF14" />
      <line x1="21" y1="10" x2="25" y2="2" stroke="rgba(57,255,20,0.55)" strokeWidth="1.5" />
      <circle cx="25" cy="2" r="2" fill="#39FF14" />
      {/* Body */}
      <circle cx="15" cy="18" r="13" fill={`url(#${gradId})`} stroke="rgba(57,255,20,0.65)" strokeWidth="1.8" style={{ filter: 'drop-shadow(0 0 4px rgba(57,255,20,0.4))' }} />
      {/* Eyes */}
      <circle cx="10" cy="17" r="3" fill="#39FF14" />
      <circle cx="20" cy="17" r="3" fill="#39FF14" />
    </svg>
  );
}

export function GamePiecePreview({ gameType, playerNumber, size = 20 }: GamePiecePreviewProps) {
  switch (gameType) {
    case 'ur':
      return <UrPiece playerNumber={playerNumber} size={size} />;
    case 'senet':
      return playerNumber === 0
        ? <ConePiece size={size} />
        : <SpoolPiece size={size} />;
    case 'morris':
      return <MorrisPiecePreview playerNumber={playerNumber} size={size} />;
    case 'wolves-and-ravens':
      return <WolvesAndRavensPiecePreview playerNumber={playerNumber} size={size} />;
    case 'stellar-siege':
      return <StellarSiegePiecePreview playerNumber={playerNumber} size={size} />;
    case 'rock-paper-scissors':
      return null;
    default:
      return null;
  }
}
```

**Step 2: Verify it compiles**

```bash
npm run build --workspace=frontend 2>&1 | head -30
```

Expected: no TypeScript errors related to this file.

**Step 3: Commit**

```bash
git add frontend/src/components/games/GamePiecePreview.tsx
git commit -m "feat: add GamePiecePreview component for all games"
```

---

### Task 2: Add piece preview to GameRoom player cards

**Files:**
- Modify: `frontend/src/components/GameRoom.tsx` (around line 709)

**Step 1: Add the import**

At the top of `GameRoom.tsx`, add:
```tsx
import { GamePiecePreview } from './games/GamePiecePreview';
```

**Step 2: Insert the preview into the player card**

Find the flex row that contains the status dot and player name (around line 709):
```tsx
<div className="flex items-center gap-1.5 min-w-0">
  <span
    className="flex-shrink-0 w-2 h-2 rounded-full"
    ...
  />
  <span className="text-sm font-semibold truncate" ...>
    {player.displayName}
  </span>
```

Add the `GamePiecePreview` after the status dot, before the name:
```tsx
<div className="flex items-center gap-1.5 min-w-0">
  <span
    className="flex-shrink-0 w-2 h-2 rounded-full"
    style={{ background: player.status === 'away' ? '#F59E0B' : '#22C55E' }}
    title={player.status === 'away' ? 'Away' : 'Active'}
  />
  <div className="flex-shrink-0">
    <GamePiecePreview gameType={session.gameType} playerNumber={seatIndex} size={20} />
  </div>
  <span
    className="text-sm font-semibold truncate"
    style={{ color: '#E8D8B0' }}
  >
    {player.displayName}
  </span>
```

**Step 3: Verify it compiles**

```bash
npm run build --workspace=frontend 2>&1 | head -30
```

Expected: no TypeScript errors.

**Step 4: Commit**

```bash
git add frontend/src/components/GameRoom.tsx
git commit -m "feat: show piece preview in GameRoom player info cards"
```

---

### Task 3: Add piece preview to tournament bracket `PlayerInfoRow`

**Files:**
- Modify: `frontend/src/components/tournament/TournamentBracket.tsx`

**Step 1: Add the import**

At the top of `TournamentBracket.tsx`, add:
```tsx
import { GamePiecePreview } from '../games/GamePiecePreview';
```

**Step 2: Add props to `PlayerInfoRow`**

The current `PlayerInfoRow` props interface (around line 196) is:
```tsx
{
  playerId: string | null;
  name: string;
  isActive: boolean;
  isFinished: boolean;
  isWinner: boolean;
  seriesWins: number;
  showSeriesWins: boolean;
  scoreInfo: string | null;
  session?: Session;
}
```

Add two new optional props:
```tsx
{
  playerId: string | null;
  name: string;
  isActive: boolean;
  isFinished: boolean;
  isWinner: boolean;
  seriesWins: number;
  showSeriesWins: boolean;
  scoreInfo: string | null;
  session?: Session;
  playerNumber?: number;
  gameType?: GameType;
}
```

Also add `GameType` to the import from `@ancient-games/shared` at the top of the file (it may already be imported — check first).

**Step 3: Use `playerNumber` and `gameType` in `PlayerInfoRow`**

Inside `PlayerInfoRow`, in the flex row (around line 216), after the status dot span:
```tsx
{playerNumber !== undefined && gameType !== undefined && (
  <div className="flex-shrink-0">
    <GamePiecePreview gameType={gameType} playerNumber={playerNumber as 0 | 1} size={16} />
  </div>
)}
```

**Step 4: Pass the new props from `MatchCard`**

In `MatchCard` (around line 327–348), the two `<PlayerInfoRow>` calls need `playerNumber` and `gameType`:
```tsx
<PlayerInfoRow
  playerId={match.player1Id}
  name={p1Name}
  isActive={isActive && gameState?.currentTurn === p1SeatIndex}
  isFinished={isFinished}
  isWinner={match.winnerId === match.player1Id}
  seriesWins={match.player1Wins}
  showSeriesWins={showSeriesWins}
  scoreInfo={p1Score}
  session={session}
  playerNumber={p1SeatIndex}
  gameType={gameType}
/>
<PlayerInfoRow
  playerId={match.player2Id}
  name={p2Name}
  isActive={isActive && gameState?.currentTurn === p2SeatIndex}
  isFinished={isFinished}
  isWinner={match.winnerId === match.player2Id}
  seriesWins={match.player2Wins}
  showSeriesWins={showSeriesWins}
  scoreInfo={p2Score}
  session={session}
  playerNumber={p2SeatIndex}
  gameType={gameType}
/>
```

Note: `gameType` is already a prop on `MatchCard` — it just needs to be threaded down.

**Step 5: Verify it compiles**

```bash
npm run build --workspace=frontend 2>&1 | head -30
```

Expected: no TypeScript errors.

**Step 6: Commit**

```bash
git add frontend/src/components/tournament/TournamentBracket.tsx
git commit -m "feat: show piece preview in tournament bracket PlayerInfoRow"
```

---

### Task 4: Update the add-game skill

**Files:**
- Modify: `.claude/skills/add-game/SKILL.md`

**Step 1: Add a new step in COMMIT 2**

After Step 5 (rules component), add a new **Step 5b**:

````markdown
### Step 5b: Frontend — export a piece preview component

Export a `<GAMECLASSPiecePreview>` component from the board file:

```tsx
// In GAMECLASSBoard.tsx, add near the top (after imports, before the default export):
export function GAMECLASSPiecePreview({ playerNumber, size = 20 }: { playerNumber: 0 | 1; size?: number }) {
  // Render a small SVG of the player's piece at the given size.
  // Player 0 gets their piece, Player 1 gets theirs.
  // If the game has no persistent piece identity (e.g. RPS), return null.
  const color = playerNumber === 0 ? '#PLAYER0_COLOR' : '#PLAYER1_COLOR';
  return (
    <svg viewBox="0 0 20 20" width={size} height={size}>
      <circle cx="10" cy="10" r="8" fill={color} />
    </svg>
  );
}
```

Then register it in `frontend/src/components/games/GamePiecePreview.tsx` — add a `case 'GAME_ID':` to the switch statement:

```tsx
case 'GAME_ID':
  return <GAMECLASSPiecePreview playerNumber={playerNumber} size={size} />;
```

And add the import at the top of `GamePiecePreview.tsx`:

```tsx
import { GAMECLASSPiecePreview } from './GAME_ID/GAMECLASSBoard';
```
````

**Step 2: Add to the COMMIT 2 checklist**

In the checklist at the bottom, add:
```markdown
- [ ] `GAMECLASSBoard.tsx` — `GAMECLASSPiecePreview` exported
- [ ] `GamePiecePreview.tsx` — new game registered in switch
```

**Step 3: Commit**

```bash
git add .claude/skills/add-game/SKILL.md
git commit -m "docs: update add-game skill with piece preview requirement"
```

---

### Task 5: Final build and lint check

**Step 1: Full build**

```bash
npm run build 2>&1 | tail -20
```

Expected: exits 0, no errors.

**Step 2: Lint**

```bash
npm run lint 2>&1 | head -30
```

Expected: no errors (warnings OK).

**Step 3: Visual smoke test**

Start the dev servers and verify:
1. Open a game session → Game tab → both player cards show a piece preview
2. Open a tournament → Bracket tab → each `PlayerInfoRow` shows a piece preview
3. Rock-paper-scissors game → no preview rendered (no crash)
