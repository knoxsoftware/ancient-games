# Active Games Home Section + Reconnect Bug Fix Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Fix the race condition that drops reconnecting players to the spectator screen, and add an "Active Games" section to the home page so players can return to ongoing sessions.

**Architecture:** One-line guard in GameRoom.tsx fixes the reconnect race. A new `sessionHistory` localStorage service tracks up to 10 session codes; the home page fetches each on mount, filters to live lobby/playing sessions where the player is present, and renders rejoin cards above the Create/Join UI.

**Tech Stack:** React 18, TypeScript, Tailwind CSS, Vitest (frontend has no tests currently — skip test steps for frontend-only changes), existing `GET /api/sessions/:code` endpoint.

---

### Task 1: Fix reconnect race in GameRoom.tsx

**Files:**
- Modify: `frontend/src/components/GameRoom.tsx:165-171`

**Step 1: Apply the fix**

Replace lines 165–171:

```ts
socket.on('session:updated', (updatedSession) => {
  if (updatedSession.sessionCode === sessionRef.current?.tournamentHubCode) {
    setHubSession(updatedSession);
  } else if (updatedSession.sessionCode === sessionCode) {
    setJoiningSession(false);
    setSession(updatedSession);
  }
  // Don't update gameState here — game state comes from game:state-updated,
  // game:move-made, etc. to avoid overwriting newer state when a spectator joins.
});
```

With:

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
  // Don't update gameState here — game state comes from game:state-updated,
  // game:move-made, etc. to avoid overwriting newer state when a spectator joins.
});
```

**Step 2: Manual verify**

Open a game as player 1, close the tab, reopen it. Should see "Joining game..." briefly, then land back in the game — not the spectate screen.

**Step 3: Commit**

```bash
git add frontend/src/components/GameRoom.tsx
git commit -m "fix: only clear joiningSession when server confirms player is present"
```

---

### Task 2: Create sessionHistory service

**Files:**
- Create: `frontend/src/services/sessionHistory.ts`

**Step 1: Create the file**

```ts
import { GameType, TournamentFormat } from '@ancient-games/shared';

export interface SessionHistoryEntry {
  sessionCode: string;
  gameType: GameType;
  playerName: string;
  lobbyFormat?: TournamentFormat | 'single';
  joinedAt: number;
}

const KEY = 'v1:sessionHistory';
const MAX_ENTRIES = 10;

function load(): SessionHistoryEntry[] {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '[]');
  } catch {
    return [];
  }
}

function save(entries: SessionHistoryEntry[]): void {
  localStorage.setItem(KEY, JSON.stringify(entries));
}

export const sessionHistory = {
  addSession(entry: SessionHistoryEntry): void {
    const entries = load().filter((e) => e.sessionCode !== entry.sessionCode);
    entries.unshift(entry);
    save(entries.slice(0, MAX_ENTRIES));
  },

  getSessions(): SessionHistoryEntry[] {
    return load();
  },

  removeSession(sessionCode: string): void {
    save(load().filter((e) => e.sessionCode !== sessionCode));
  },
};
```

**Step 2: Commit**

```bash
git add frontend/src/services/sessionHistory.ts
git commit -m "feat: add sessionHistory localStorage service"
```

---

### Task 3: Record sessions on create/join in Home.tsx

**Files:**
- Modify: `frontend/src/components/Home.tsx`

**Step 1: Import sessionHistory**

Add to the imports at the top of `Home.tsx`:

```ts
import { sessionHistory } from '../services/sessionHistory';
```

**Step 2: Call addSession after createSession**

In `handleCreateSession`, after `localStorage.setItem(PLAYER_NAME_KEY, ...)` and before `navigate(...)`:

```ts
sessionHistory.addSession({
  sessionCode: result.session.sessionCode,
  gameType,
  playerName: displayName.trim(),
  lobbyFormat: result.session.lobbyFormat ?? 'single',
  joinedAt: Date.now(),
});
```

**Step 3: Call addSession after joinSession**

In `handleJoinSession`, after `localStorage.setItem(PLAYER_NAME_KEY, ...)` and before `navigate(...)`:

```ts
sessionHistory.addSession({
  sessionCode: result.session.sessionCode,
  gameType: result.session.gameType,
  playerName: displayName.trim(),
  lobbyFormat: result.session.lobbyFormat ?? 'single',
  joinedAt: Date.now(),
});
```

**Step 4: Commit**

```bash
git add frontend/src/components/Home.tsx
git commit -m "feat: record session history on create/join"
```

---

### Task 4: Record sessions on tournament match navigation in GameRoom.tsx

When a player is auto-navigated to a tournament match session, `Home.tsx` create/join flows aren't called — so we need to record the session from `GameRoom.tsx` when `session:join` is confirmed.

**Files:**
- Modify: `frontend/src/components/GameRoom.tsx`

**Step 1: Import sessionHistory**

Add to imports:

```ts
import { sessionHistory } from '../services/sessionHistory';
import { PLAYER_ID_KEY, PLAYER_NAME_KEY } from '../services/storage';
```

(PLAYER_NAME_KEY may already be imported — check and add only what's missing.)

**Step 2: Record session when player is confirmed present**

Inside the `session:updated` handler, after the `playerIsPresent` check, add the recording call:

```ts
if (playerIsPresent) {
  setJoiningSession(false);
  sessionHistory.addSession({
    sessionCode: updatedSession.sessionCode,
    gameType: updatedSession.gameType,
    playerName: localStorage.getItem(PLAYER_NAME_KEY) ?? '',
    lobbyFormat: updatedSession.lobbyFormat ?? 'single',
    joinedAt: Date.now(),
  });
}
```

This is idempotent — `addSession` deduplicates by sessionCode, so calling it on every reconnect is safe.

**Step 3: Commit**

```bash
git add frontend/src/components/GameRoom.tsx
git commit -m "feat: record session history on socket confirmation in GameRoom"
```

---

### Task 5: Build the ActiveGames component

**Files:**
- Create: `frontend/src/components/ActiveGames.tsx`

**Step 1: Create the component**

```tsx
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Session } from '@ancient-games/shared';
import { GAME_MANIFESTS } from '@ancient-games/shared';
import { api } from '../services/api';
import { sessionHistory, SessionHistoryEntry } from '../services/sessionHistory';
import { PLAYER_ID_KEY } from '../services/storage';

interface LiveSession {
  entry: SessionHistoryEntry;
  session: Session;
}

function formatBadge(lobbyFormat?: string): string {
  if (!lobbyFormat || lobbyFormat === 'single') return 'Single Game';
  if (lobbyFormat === 'round-robin') return 'Round Robin';
  if (lobbyFormat === 'bo1') return 'Best of 1';
  if (lobbyFormat === 'bo3') return 'Best of 3';
  if (lobbyFormat === 'bo5') return 'Best of 5';
  if (lobbyFormat === 'bo7') return 'Best of 7';
  return lobbyFormat;
}

export default function ActiveGames() {
  const navigate = useNavigate();
  const [liveSessions, setLiveSessions] = useState<LiveSession[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const playerId = localStorage.getItem(PLAYER_ID_KEY);
    const entries = sessionHistory.getSessions();
    if (entries.length === 0) {
      setLoaded(true);
      return;
    }

    Promise.all(
      entries.map(async (entry) => {
        try {
          const session = await api.getSession(entry.sessionCode);
          if (session.status === 'finished') {
            sessionHistory.removeSession(entry.sessionCode);
            return null;
          }
          const isPresent =
            playerId &&
            (session.players.some((p) => p.id === playerId) ||
              session.spectators.some((s) => s.id === playerId));
          if (!isPresent) {
            sessionHistory.removeSession(entry.sessionCode);
            return null;
          }
          return { entry, session } as LiveSession;
        } catch {
          sessionHistory.removeSession(entry.sessionCode);
          return null;
        }
      }),
    ).then((results) => {
      setLiveSessions(results.filter((r): r is LiveSession => r !== null));
      setLoaded(true);
    });
  }, []);

  if (!loaded || liveSessions.length === 0) return null;

  const playerId = localStorage.getItem(PLAYER_ID_KEY);

  return (
    <div className="mb-6">
      <h2 className="text-lg font-semibold text-gray-300 mb-3">Your Active Games</h2>
      <div className="space-y-3">
        {liveSessions.map(({ entry, session }) => {
          const manifest = GAME_MANIFESTS[session.gameType];
          const isPlaying = session.status === 'playing';
          const destination = isPlaying
            ? `/game/${session.sessionCode}`
            : `/session/${session.sessionCode}`;

          return (
            <div
              key={session.sessionCode}
              className="card flex items-center justify-between gap-4 py-3 px-4"
            >
              <div className="flex items-center gap-3 min-w-0">
                <span className="text-2xl flex-shrink-0">{manifest?.emoji ?? '🎲'}</span>
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold">{manifest?.title ?? session.gameType}</span>
                    <span className="text-xs px-2 py-0.5 rounded-full bg-gray-700 text-gray-300">
                      {formatBadge(entry.lobbyFormat)}
                    </span>
                    <span
                      className={`text-xs px-2 py-0.5 rounded-full ${
                        isPlaying
                          ? 'bg-green-500/20 text-green-300'
                          : 'bg-yellow-500/20 text-yellow-300'
                      }`}
                    >
                      {isPlaying ? 'In Progress' : 'Waiting'}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                    {session.players.map((p) => (
                      <span
                        key={p.id}
                        className={`text-xs px-2 py-0.5 rounded-full border ${
                          p.id === playerId
                            ? 'border-primary-500 text-primary-300 bg-primary-500/10'
                            : 'border-gray-600 text-gray-400'
                        }`}
                      >
                        {p.displayName}
                      </span>
                    ))}
                    {session.spectators.length > 0 && (
                      <span className="text-xs text-gray-500">
                        +{session.spectators.length} watching
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-gray-600 mt-0.5 font-mono">
                    {session.sessionCode}
                  </div>
                </div>
              </div>
              <button
                onClick={() => navigate(destination)}
                className="btn btn-primary flex-shrink-0 text-sm py-1.5 px-4"
              >
                Rejoin
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
```

**Step 2: Commit**

```bash
git add frontend/src/components/ActiveGames.tsx
git commit -m "feat: add ActiveGames component with per-session rejoin cards"
```

---

### Task 6: Wire ActiveGames into Home.tsx

**Files:**
- Modify: `frontend/src/components/Home.tsx`

**Step 1: Import the component**

```ts
import ActiveGames from './ActiveGames';
```

**Step 2: Render it above the Create/Join cards**

Inside the outer `<div className="max-w-2xl w-full">`, just before the `{!mode ? (` block:

```tsx
<ActiveGames />
```

**Step 3: Manual verify**

- Create a game, navigate away to home — the active game card should appear
- Click Rejoin — should land back in the lobby/game as the original player
- Let a game finish, return to home — the finished game should be gone from the list

**Step 4: Commit**

```bash
git add frontend/src/components/Home.tsx
git commit -m "feat: show active games on home page"
```
