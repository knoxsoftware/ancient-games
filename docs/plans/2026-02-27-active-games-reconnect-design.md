# Active Games Home Section + Reconnect Bug Fix

**Date:** 2026-02-27

## Problem

1. **Reconnect bug:** When a player closes their tab and reopens it, they sometimes land on the spectator join screen instead of rejoining as their original player. Root cause: `setJoiningSession(false)` fires on any `session:updated` event for the session, including ones that arrive before the server has processed `session:join` — a race that clears the "joining" guard too early.

2. **No way back:** Once a player navigates away from a game, there is no UI to find and return to their active sessions.

## Solution Overview

- Fix the race with a one-line guard in `GameRoom.tsx`
- Add a localStorage-based session history service
- Add an "Active Games" section to the home page

---

## Part 1: Reconnect Bug Fix

**File:** `frontend/src/components/GameRoom.tsx`

Change the `session:updated` handler to only call `setJoiningSession(false)` when the updated session actually contains the current player:

```ts
socket.on('session:updated', (updatedSession) => {
  if (updatedSession.sessionCode === sessionRef.current?.tournamentHubCode) {
    setHubSession(updatedSession);
  } else if (updatedSession.sessionCode === sessionCode) {
    const playerIsPresent =
      updatedSession.players.some((p) => p.id === playerId) ||
      updatedSession.spectators.some((s) => s.id === playerId);
    if (playerIsPresent) setJoiningSession(false);
    setSession(updatedSession);
  }
});
```

This keeps the "Joining game..." screen visible until the server confirms the player is in the session.

---

## Part 2: Session History Service

**File:** `frontend/src/services/sessionHistory.ts` (new)

### Storage entry shape

```ts
interface SessionHistoryEntry {
  sessionCode: string;
  gameType: GameType;
  playerName: string;
  lobbyFormat?: TournamentFormat | 'single';
  joinedAt: number;
}
```

Stored under a versioned localStorage key (e.g. `v1:sessionHistory`) as a JSON array, max 10 entries.

### API

- `addSession(entry)` — prepend, deduplicate by sessionCode, trim to 10
- `getSessions()` — return all stored entries
- `removeSession(sessionCode)` — remove one entry

### When to call `addSession`

- After successful `createSession` in `Home.tsx`
- After successful `joinSession` in `Home.tsx`
- After successful `session:join` acknowledgement in `GameRoom.tsx` (covers tournament match navigation)

---

## Part 3: Active Games Home Section

**File:** `frontend/src/components/Home.tsx`

### Load behaviour

On mount, in parallel:
1. Call `getSessions()` from sessionHistory
2. Fetch each session via `GET /api/sessions/:code`
3. Filter: keep only sessions where `status` is `lobby` or `playing` AND the stored `playerId` appears in `players` or `spectators`
4. Drop (and call `removeSession`) for any that return 404 or have status `finished`

While loading: render nothing (no skeleton flash for a fast operation).
If no live sessions remain after filtering: render nothing (section hidden).

### Card design (per session)

- Game icon + name (from `GAME_MANIFESTS`)
- Session code (small, muted)
- Format badge: "Single Game" / "Best of N Tournament" / "Round Robin"
- Player chips: all `players` shown by display name; current player highlighted; spectator count if any
- Status badge: "Waiting" (lobby) / "In Progress" (playing)
- Rejoin button: navigates to `/session/:code` (lobby) or `/game/:code` (playing)

### Placement

Above the Create/Join cards, only rendered when there is at least one live session.

---

## No backend changes required

All session lookups use the existing `GET /api/sessions/:code` endpoint. Session history lives entirely in localStorage.
