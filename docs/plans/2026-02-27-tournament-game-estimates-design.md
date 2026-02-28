# Tournament Game Estimates — Design

**Date:** 2026-02-27
**File:** `frontend/src/components/lobby/SessionLobby.tsx`

## Goal

Show players an estimated number of games and (for bracket formats) the number of bye rounds in the lobby, before a tournament starts. Visible to both the host (format selector cards) and non-hosts (format display line).

## Math

Given N seated players:

### Bracket formats (bo1 / bo3 / bo5 / bo7)

- **Matches** = N − 1 (single-elimination always has exactly N−1 matches)
- **Byes** = nextPowerOf2(N) − N
- **Game range per format:**
  - bo1: exactly N−1 games
  - bo3: (N−1)×2 – (N−1)×3
  - bo5: (N−1)×3 – (N−1)×5
  - bo7: (N−1)×4 – (N−1)×7

### Round-robin

- **Matches** = N×(N−1)/2 (each match is 1 game)
- No byes

## Implementation

### Helper function

Add a pure `getTournamentInfo(format, playerCount): string` function in `SessionLobby.tsx` (local, no new file needed).

- If `playerCount < 2`: return the existing static description unchanged
- Otherwise: return description with appended game count / bye info

Example outputs:
- bo3, 5 players → `"Elimination, first to 2 wins · ~10–15 games · 3 byes"`
- bo1, 4 players → `"Elimination, 1 game per match · 3 games"`
- round-robin, 4 players → `"Everyone plays everyone · 6 games"`
- bo5, 8 players → `"Elimination, first to 3 wins · 21–35 games"` (8 is a power of 2, no byes)

### Changes

1. **`FORMAT_OPTIONS`** stays as a static array (labels + base descs unchanged).
2. **Host selector cards**: replace `opt.desc` with `getTournamentInfo(opt.value, session.players.length)`.
3. **Non-host display line**: append `getTournamentInfo(format, session.players.length)` detail after the format label.

## Scope

- Frontend only, single file: `SessionLobby.tsx`
- No backend changes, no shared type changes
- No new files
