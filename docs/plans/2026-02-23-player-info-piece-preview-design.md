# Player Info Piece Preview

**Date:** 2026-02-23
**Status:** Approved

## Overview

Each player info card (in the GameRoom game tab and tournament bracket `PlayerInfoRow`) should display a small example of that player's piece in their color. Games with no persistent piece identity (rock-paper-scissors) show nothing.

## New Component

**`frontend/src/components/games/GamePiecePreview.tsx`**

```tsx
<GamePiecePreview gameType={GameType} playerNumber={0 | 1} size={number} />
```

- `switch` on `gameType`, renders appropriate piece SVG at the requested `size`
- Returns `null` for games with no piece identity (rock-paper-scissors)
- Reuses existing exported piece components where they exist (UrPiece, ConePiece, SpoolPiece)
- Inlines small standalone SVG snippets for games without exported components (Morris, Wolves & Ravens, Stellar Siege)

### Piece preview per game

| Game | Player 0 | Player 1 |
|------|----------|----------|
| ur | White disk + blue pips | Black disk + brown pips |
| senet | Cone (ivory) | Spool (ebony) |
| morris | Blue circle | Red circle |
| wolves-and-ravens | Wolf (gold gradient + W) | Raven (dark gradient + dot) |
| rock-paper-scissors | `null` (no render) | `null` (no render) |
| stellar-siege | Cannon (cyan) | Alien (green) |

## Changes to Existing Files

### `GameRoom.tsx` — player info cards (~line 709)

Add `<GamePiecePreview gameType={session.gameType} playerNumber={seatIndex} size={20} />` inside the player card flex row, adjacent to the status dot.

### `TournamentBracket.tsx` — `PlayerInfoRow`

- Add `playerNumber: number` and `gameType?: GameType` props to `PlayerInfoRow`
- Pass `p1SeatIndex`/`p2SeatIndex` and `gameType` when rendering each row in `MatchCard`
- Add `<GamePiecePreview>` (size ~16px) in the flex row alongside the status dot

### `add-game` skill — COMMIT 2

Add a required step: export a `<GAMECLASSPiecePreview playerNumber={0|1} size={number} />` component from the board file (or a separate file), and register it in `GamePiecePreview.tsx`'s switch statement.

## Files Changed

- `frontend/src/components/games/GamePiecePreview.tsx` — **new**
- `frontend/src/components/GameRoom.tsx` — add preview to player cards
- `frontend/src/components/tournament/TournamentBracket.tsx` — add preview to `PlayerInfoRow`
- `.claude/skills/add-game/SKILL.md` — document piece preview requirement
