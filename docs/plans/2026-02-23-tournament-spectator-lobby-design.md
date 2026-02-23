# Tournament Spectator Lobby Design

## Problem

The tournament lobby page is sparse. Spectators have no way to watch active matches or see bracket progress with live game state. There is no chat on the lobby page.

## Solution

Enhance the tournament lobby with:
1. Live miniature game boards inline in bracket match cards
2. A click-to-expand modal with full spectator view
3. Tournament-scoped chat panel

## Architecture

### Backend: Hub-Relayed Game State

When a game state update occurs in a tournament match session, relay it to the hub room.

- **Trigger points:** After `game:state-updated`, `game:move-made`, `game:dice-rolled`, and `game:started` in `gameHandlers.ts`
- **Condition:** `session.tournamentHubCode` exists
- **New event:** `tournament:match-game-state` emitted to hub room
- **Payload:** `{ matchId: string, gameState: GameState, sessionCode: string }`
- **Type update:** Add to `ServerToClientEvents` in `shared/types/socket-events.ts`

### Frontend: State Management

- `SessionLobby` listens for `tournament:match-game-state`
- Stores `Record<string, GameState>` keyed by matchId
- Passes map to `TournamentBracket` as a new prop

### Frontend: Miniature Boards in Match Cards

- Active match cards render a scaled-down board component inside a CSS `transform: scale()` container
- Reuses existing board components (UrBoard, SenetBoard, etc.) with `pointer-events: none` for read-only
- Board components loaded via the same lazy-load pattern as GameRoom
- Click handler on the card opens the spectator modal

### Frontend: Spectator Modal

Contents:
- Larger read-only board
- Player names with colors
- Series score (e.g., "BO3 — Player A: 1, Player B: 0")
- Move log (from relayed game state)
- Match status indicator

### Frontend: Chat Panel

- Existing `ChatPanel` component added to lobby layout
- Configured with tournament scope
- Messages go to hub session

## Responsive Design

| Breakpoint | Bracket | Mini Boards | Chat | Modal |
|---|---|---|---|---|
| Desktop (>1024px) | Full width left | Inline in cards | Sidebar right | Centered dialog |
| Tablet (768-1024px) | Full width | Inline in cards | Floating button + slide-up | Centered dialog |
| Mobile (<768px) | Horizontal scroll | "Live" badge only | FAB + full-screen overlay | Full-screen |

## Layout (Desktop)

```
+-------------------------------------------+--------------+
|           Tournament Bracket               |              |
|  +------+    +------+                      |  Tournament  |
|  | mini |---->|      |                     |    Chat      |
|  |board |    |      |--+                   |              |
|  +------+    +------+  |  +------+         |              |
|                        +->|      |         |              |
|  +------+    +------+  +->|      |         |              |
|  | mini |---->|      |--+  +------+        |              |
|  |board |    |      |                      |              |
|  +------+    +------+                      |              |
+-------------------------------------------+--------------+
```

## Data Flow

```
Match Session (game move)
  → gameHandlers.ts emits game:state-updated to match room (existing)
  → gameHandlers.ts emits tournament:match-game-state to hub room (new)
  → SessionLobby receives event, updates matchGameStates map
  → TournamentBracket re-renders affected match card with new board state
  → If spectator modal is open for that match, modal also updates
```

## Files to Create/Modify

### New Files
- `frontend/src/components/tournament/MatchSpectatorModal.tsx` — full spectator modal
- `frontend/src/components/tournament/MiniBoard.tsx` — scaled-down board wrapper

### Modified Files
- `shared/types/socket-events.ts` — add `tournament:match-game-state` event
- `backend/src/socket/gameHandlers.ts` — relay game state to hub room
- `frontend/src/components/lobby/SessionLobby.tsx` — listen for match game states, add chat panel, responsive layout
- `frontend/src/components/tournament/TournamentBracket.tsx` — accept game states prop, render mini boards in active match cards
