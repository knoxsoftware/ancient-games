# Tournament Spectator Lobby Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Enhance the tournament lobby page so spectators see live miniature game boards in bracket match cards, can click to open a full spectator modal, and have access to tournament chat.

**Architecture:** Backend relays game state from match sessions to the hub room via a new `tournament:match-game-state` socket event. The lobby frontend listens for these, stores them in a map keyed by matchId, and passes them to bracket match cards which render scaled-down board components. A click opens a spectator modal with full context. Chat uses the existing `ChatPanel` with tournament scope.

**Tech Stack:** TypeScript, React 18 (lazy/Suspense), Socket.io, Tailwind CSS

---

### Task 1: Add `tournament:match-game-state` Socket Event Type

**Files:**

- Modify: `shared/types/socket-events.ts:62-73` (ServerToClientEvents, tournament events block)

**Step 1: Add the event type**

In `shared/types/socket-events.ts`, add the new event inside `ServerToClientEvents` after the existing tournament events (around line 73):

```typescript
'tournament:match-game-state': (data: {
  matchId: string;
  gameState: GameState;
  sessionCode: string;
}) => void;
```

Ensure `GameState` is imported at the top (it should already be — verify).

**Step 2: Build to verify types compile**

Run: `npm run build:backend && npm run build:frontend`
Expected: Both compile without errors.

**Step 3: Commit**

```bash
git add shared/types/socket-events.ts
git commit -m "feat: add tournament:match-game-state socket event type"
```

---

### Task 2: Relay Game State to Hub Room (Backend)

**Files:**

- Modify: `backend/src/socket/gameHandlers.ts`

We need to relay game state to the hub room at these trigger points:

- After `game:started` is emitted (line ~319)
- After `game:dice-rolled` is emitted (line ~364)
- After `game:move-made` is emitted (line ~456)
- After `game:skip-turn` / `game:state-updated` (line ~602)

**Step 1: Create a helper function**

Add a helper at the top of the `registerGameHandlers` function (or just inside the file scope) to avoid repetition:

```typescript
const relayGameStateToHub = (session: Session, gameState: GameState) => {
  if (session.tournamentHubCode && session.tournamentMatchId) {
    io.to(session.tournamentHubCode).emit('tournament:match-game-state', {
      matchId: session.tournamentMatchId,
      gameState,
      sessionCode: session.sessionCode,
    });
  }
};
```

Note: `Session` has `tournamentHubCode?: string` and `tournamentMatchId?: string` fields. Both must exist for relaying.

**Step 2: Add relay calls after each trigger point**

After `game:started` emission (around line 319-321, inside the single-game start path):

```typescript
io.to(sessionCode).emit('game:started', updatedSession);
relayGameStateToHub(updatedSession, updatedSession.gameState!);
```

After `game:dice-rolled` emission (around line 364):

```typescript
io.to(sessionCode).emit('game:dice-rolled', { playerNumber: player.playerNumber, roll, canMove });
relayGameStateToHub(session, session.gameState!);
```

After `game:move-made` emission (around line 456):

```typescript
io.to(sessionCode).emit('game:move-made', { move, gameState: session.gameState, wasCapture });
relayGameStateToHub(session, session.gameState!);
```

After `game:skip-turn` state update emission (around line 602):

```typescript
io.to(sessionCode).emit('game:state-updated', session.gameState);
relayGameStateToHub(session, session.gameState!);
```

**Step 3: Build to verify**

Run: `npm run build:backend`
Expected: Compiles without errors.

**Step 4: Commit**

```bash
git add backend/src/socket/gameHandlers.ts
git commit -m "feat: relay game state to tournament hub room"
```

---

### Task 3: Create MiniBoard Component

**Files:**

- Create: `frontend/src/components/tournament/MiniBoard.tsx`

**Step 1: Create the MiniBoard wrapper component**

This component wraps an existing board component in a scaled-down, non-interactive container. It uses CSS `transform: scale()` with a fixed-size outer container.

```tsx
import React, { lazy, Suspense, useRef, useState, useEffect } from 'react';
import type { Session, GameState, GameType } from '@ancient-games/shared';

const boardComponents: Record<GameType, React.LazyExoticComponent<React.ComponentType<any>>> = {
  ur: lazy(() => import('../games/ur/UrBoard')),
  senet: lazy(() => import('../games/senet/SenetBoard')),
  morris: lazy(() => import('../games/morris/MorrisBoard')),
  'wolves-and-ravens': lazy(() => import('../games/wolves-and-ravens/WolvesAndRavensBoard')),
  'rock-paper-scissors': lazy(() => import('../games/rock-paper-scissors/RockPaperScissorsBoard')),
  'stellar-siege': lazy(() => import('../games/stellar-siege/StellarSiegeBoard')),
};

interface MiniBoardProps {
  session: Session;
  gameState: GameState;
  onClick?: () => void;
}

export default function MiniBoard({ session, gameState, onClick }: MiniBoardProps) {
  const innerRef = useRef<HTMLDivElement>(null);
  const outerRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.25);

  const BoardComponent = boardComponents[session.gameType];

  useEffect(() => {
    if (!innerRef.current || !outerRef.current) return;
    const observer = new ResizeObserver(() => {
      const inner = innerRef.current;
      const outer = outerRef.current;
      if (!inner || !outer) return;
      const innerW = inner.scrollWidth;
      const innerH = inner.scrollHeight;
      if (innerW === 0 || innerH === 0) return;
      const outerW = outer.clientWidth;
      const outerH = outer.clientHeight;
      setScale(Math.min(outerW / innerW, outerH / innerH, 0.35));
    });
    observer.observe(innerRef.current);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={outerRef}
      className="relative w-full overflow-hidden cursor-pointer"
      style={{ height: '120px' }}
      onClick={onClick}
    >
      <div
        ref={innerRef}
        className="absolute origin-top-left pointer-events-none"
        style={{ transform: `scale(${scale})` }}
      >
        <Suspense fallback={<div className="text-xs opacity-50">Loading…</div>}>
          <BoardComponent
            session={session}
            gameState={gameState}
            playerId=""
            isMyTurn={false}
            animatingPiece={null}
          />
        </Suspense>
      </div>
    </div>
  );
}
```

Key decisions:

- `playerId=""` ensures no player-specific highlighting
- `pointer-events-none` on inner div prevents board interaction
- `cursor-pointer` on outer div signals clickability
- `ResizeObserver` dynamically calculates scale to fit the container
- Falls back to `scale(0.25)` initially

**Step 2: Build to verify**

Run: `npm run build:frontend`
Expected: Compiles.

**Step 3: Commit**

```bash
git add frontend/src/components/tournament/MiniBoard.tsx
git commit -m "feat: add MiniBoard component for scaled-down board previews"
```

---

### Task 4: Create MatchSpectatorModal Component

**Files:**

- Create: `frontend/src/components/tournament/MatchSpectatorModal.tsx`

**Step 1: Create the spectator modal**

```tsx
import React, { lazy, Suspense } from 'react';
import type {
  Session,
  GameState,
  GameType,
  TournamentMatch,
  TournamentParticipant,
  TournamentFormat,
} from '@ancient-games/shared';

const boardComponents: Record<GameType, React.LazyExoticComponent<React.ComponentType<any>>> = {
  ur: lazy(() => import('../games/ur/UrBoard')),
  senet: lazy(() => import('../games/senet/SenetBoard')),
  morris: lazy(() => import('../games/morris/MorrisBoard')),
  'wolves-and-ravens': lazy(() => import('../games/wolves-and-ravens/WolvesAndRavensBoard')),
  'rock-paper-scissors': lazy(() => import('../games/rock-paper-scissors/RockPaperScissorsBoard')),
  'stellar-siege': lazy(() => import('../games/stellar-siege/StellarSiegeBoard')),
};

interface MatchSpectatorModalProps {
  match: TournamentMatch;
  participants: TournamentParticipant[];
  format: TournamentFormat;
  gameType: GameType;
  gameState: GameState;
  session: Session;
  onClose: () => void;
}

function getSeriesLabel(format: TournamentFormat, match: TournamentMatch): string {
  if (format === 'round-robin' || format === 'bo1') return '';
  const total = match.player1Wins + match.player2Wins;
  const maxWins = format === 'bo3' ? 2 : format === 'bo5' ? 3 : 4;
  return `Game ${total + 1} of ${format.toUpperCase()} (First to ${maxWins})`;
}

export default function MatchSpectatorModal({
  match,
  participants,
  format,
  gameType,
  gameState,
  session,
  onClose,
}: MatchSpectatorModalProps) {
  const p1 = participants.find((p) => p.id === match.player1Id);
  const p2 = participants.find((p) => p.id === match.player2Id);
  const BoardComponent = boardComponents[gameType];
  const seriesLabel = getSeriesLabel(format, match);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-3xl max-h-[90vh] overflow-y-auto rounded-xl border border-amber-900/30 bg-stone-900 p-6"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute top-3 right-3 text-amber-200/50 hover:text-amber-200 text-xl"
        >
          ✕
        </button>

        {/* Header: Player names and series score */}
        <div className="flex items-center justify-between mb-4">
          <div className="text-amber-200 font-semibold text-lg">{p1?.displayName ?? 'TBD'}</div>
          <div className="text-center">
            {format !== 'bo1' && format !== 'round-robin' && (
              <div className="text-amber-200 font-bold text-xl">
                {match.player1Wins} – {match.player2Wins}
              </div>
            )}
            {seriesLabel && <div className="text-amber-200/50 text-xs">{seriesLabel}</div>}
          </div>
          <div className="text-amber-200 font-semibold text-lg">{p2?.displayName ?? 'TBD'}</div>
        </div>

        {/* Board */}
        <div className="flex justify-center">
          <Suspense
            fallback={
              <div className="flex items-center justify-center py-16 text-sm text-amber-200/50">
                Loading…
              </div>
            }
          >
            <BoardComponent
              session={session}
              gameState={gameState}
              playerId=""
              isMyTurn={false}
              animatingPiece={null}
            />
          </Suspense>
        </div>

        {/* Move log */}
        {gameState.moveHistory && gameState.moveHistory.length > 0 && (
          <div className="mt-4 max-h-32 overflow-y-auto rounded border border-amber-900/20 bg-stone-800 p-3">
            <div className="text-amber-200/50 text-xs font-semibold mb-2">Move Log</div>
            <div className="space-y-1">
              {gameState.moveHistory.slice(-10).map((entry, i) => {
                const playerName =
                  entry.playerNumber === 1 ? (p1?.displayName ?? 'P1') : (p2?.displayName ?? 'P2');
                return (
                  <div key={i} className="text-xs text-amber-200/70">
                    <span className="font-medium">{playerName}</span>
                    {entry.isSkip ? ' skipped' : ` moved ${entry.move.from} → ${entry.move.to}`}
                    {entry.wasCapture && <span className="text-red-400 ml-1">capture!</span>}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
```

**Step 2: Build to verify**

Run: `npm run build:frontend`
Expected: Compiles.

**Step 3: Commit**

```bash
git add frontend/src/components/tournament/MatchSpectatorModal.tsx
git commit -m "feat: add MatchSpectatorModal for spectator view"
```

---

### Task 5: Update TournamentBracket to Render Mini Boards

**Files:**

- Modify: `frontend/src/components/tournament/TournamentBracket.tsx`

**Step 1: Add matchGameStates prop to TournamentBracket**

Update the `Props` interface (line 4-9) to add:

```typescript
interface Props {
  tournament: TournamentState;
  participants: TournamentParticipant[];
  currentPlayerId: string;
  onWatchMatch?: (sessionCode: string) => void;
  matchGameStates?: Record<string, GameState>; // NEW
  gameType?: GameType; // NEW
  session?: Session; // NEW — hub session, for gameType
  onMatchClick?: (matchId: string) => void; // NEW
}
```

Also update MatchCard's props to receive:

```typescript
gameState?: GameState;
gameType?: GameType;
session?: Session;
onMatchClick?: (matchId: string) => void;
```

**Step 2: Import MiniBoard**

Add import at top:

```typescript
import MiniBoard from './MiniBoard';
```

**Step 3: Render MiniBoard inside MatchCard for active matches**

Inside the MatchCard component, after the player names section and before the "Watch" button, add a conditional mini board render when the match is active and gameState is available:

```tsx
{
  isActive && gameState && gameType && session && (
    <div className="mt-2 hidden md:block">
      <MiniBoard
        session={session}
        gameState={gameState}
        onClick={() => onMatchClick?.(match.matchId)}
      />
    </div>
  );
}
{
  isActive && gameState && gameType && (
    <div className="mt-2 block md:hidden">
      <div
        className="text-xs text-center py-2 px-3 rounded bg-green-900/30 text-green-400 cursor-pointer"
        onClick={() => onMatchClick?.(match.matchId)}
      >
        ● Live — Tap to watch
      </div>
    </div>
  );
}
```

Note: `hidden md:block` shows mini board only on tablet+. `block md:hidden` shows "Live" badge on mobile only.

**Step 4: Pass props through from TournamentBracket → EliminationBracket → MatchCard and RoundRobinView → MatchCard**

In `EliminationBracket`, pass `matchGameStates`, `gameType`, `session`, and `onMatchClick` down.

Each MatchCard receives:

```tsx
<MatchCard
  match={match}
  format={tournament.format}
  participants={participants}
  currentPlayerId={currentPlayerId}
  onWatchMatch={onWatchMatch}
  gameState={matchGameStates?.[match.matchId]}
  gameType={gameType}
  session={session}
  onMatchClick={onMatchClick}
/>
```

**Step 5: Build to verify**

Run: `npm run build:frontend`
Expected: Compiles.

**Step 6: Commit**

```bash
git add frontend/src/components/tournament/TournamentBracket.tsx
git commit -m "feat: render mini boards in bracket match cards"
```

---

### Task 6: Update SessionLobby with Game State Listener, Chat, and Spectator Modal

**Files:**

- Modify: `frontend/src/components/lobby/SessionLobby.tsx`

This is the largest task — it wires everything together.

**Step 1: Add imports**

```typescript
import { useState, useCallback } from 'react';
import type { GameState } from '@ancient-games/shared';
import ChatPanel, { ChatMessage } from '../ChatPanel';
import MatchSpectatorModal from '../tournament/MatchSpectatorModal';
import socketService from '../../services/socket';
```

**Step 2: Add state variables**

Inside the SessionLobby component, add:

```typescript
const [matchGameStates, setMatchGameStates] = useState<Record<string, GameState>>({});
const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
const [selectedMatchId, setSelectedMatchId] = useState<string | null>(null);
const [showChat, setShowChat] = useState(false);
```

**Step 3: Add socket listeners for game state and chat**

In the existing `useEffect` that sets up socket listeners (where `tournament:updated` is listened for), add:

```typescript
socket.on('tournament:match-game-state', (data) => {
  setMatchGameStates((prev) => ({
    ...prev,
    [data.matchId]: data.gameState,
  }));
});

socket.on('chat:message', (msg) => {
  setChatMessages((prev) => [...prev, msg as ChatMessage]);
});
```

In cleanup, add:

```typescript
socket.off('tournament:match-game-state');
socket.off('chat:message');
```

**Step 4: Add chat send handler**

```typescript
const handleChatSend = useCallback(
  (text: string) => {
    const socket = socketService.getSocket();
    if (!socket || !session) return;
    socket.emit('chat:send', {
      sessionCode: session.sessionCode,
      playerId: playerId!,
      text,
      scope: 'tournament',
    });
  },
  [session, playerId],
);
```

**Step 5: Add match click handler**

```typescript
const handleMatchClick = useCallback((matchId: string) => {
  setSelectedMatchId(matchId);
}, []);
```

**Step 6: Update tournament bracket rendering (line ~414-419)**

Pass the new props to TournamentBracket:

```tsx
<TournamentBracket
  tournament={session.tournamentState}
  participants={session.tournamentState.participants}
  currentPlayerId={playerId!}
  onWatchMatch={(matchCode) => navigate(`/game/${matchCode}`)}
  matchGameStates={matchGameStates}
  gameType={session.gameType}
  session={session}
  onMatchClick={handleMatchClick}
/>
```

**Step 7: Update layout for chat sidebar (desktop) and FAB (mobile)**

Wrap the tournament view in a flex container:

```tsx
{
  session.tournamentState && (
    <div className="flex h-full">
      {/* Bracket area */}
      <div className="flex-1 min-w-0 overflow-auto">{/* existing bracket + header content */}</div>

      {/* Chat sidebar — desktop */}
      <div className="hidden lg:flex flex-col w-80 border-l border-amber-900/20">
        <ChatPanel
          messages={chatMessages}
          currentPlayerId={playerId!}
          onSend={handleChatSend}
          session={session}
        />
      </div>

      {/* Chat FAB — mobile/tablet */}
      <div className="lg:hidden fixed bottom-4 right-4 z-40">
        <button
          onClick={() => setShowChat(!showChat)}
          className="w-12 h-12 rounded-full bg-amber-700 text-white shadow-lg flex items-center justify-center text-xl"
        >
          💬
        </button>
      </div>

      {/* Chat overlay — mobile/tablet */}
      {showChat && (
        <div className="lg:hidden fixed inset-0 z-50 flex flex-col bg-stone-900">
          <div className="flex items-center justify-between p-3 border-b border-amber-900/20">
            <span className="text-amber-200 font-semibold">Tournament Chat</span>
            <button onClick={() => setShowChat(false)} className="text-amber-200/50 text-xl">
              ✕
            </button>
          </div>
          <div className="flex-1">
            <ChatPanel
              messages={chatMessages}
              currentPlayerId={playerId!}
              onSend={handleChatSend}
              session={session}
            />
          </div>
        </div>
      )}
    </div>
  );
}
```

**Step 8: Add spectator modal**

At the bottom of the component (before the closing fragment/div), render the modal conditionally:

```tsx
{
  selectedMatchId &&
    (() => {
      const match = session.tournamentState?.rounds
        .flat()
        .find((m) => m.matchId === selectedMatchId);
      const gameState = matchGameStates[selectedMatchId];
      if (!match || !gameState) return null;
      return (
        <MatchSpectatorModal
          match={match}
          participants={session.tournamentState!.participants}
          format={session.tournamentState!.format}
          gameType={session.gameType}
          gameState={gameState}
          session={session}
          onClose={() => setSelectedMatchId(null)}
        />
      );
    })();
}
```

**Step 9: Build to verify**

Run: `npm run build:frontend`
Expected: Compiles without errors.

**Step 10: Commit**

```bash
git add frontend/src/components/lobby/SessionLobby.tsx
git commit -m "feat: add live game state, chat, and spectator modal to tournament lobby"
```

---

### Task 7: Also Relay Initial Game State on Tournament Start

**Files:**

- Modify: `backend/src/socket/gameHandlers.ts`

When a tournament starts (line ~281-325), match sessions are created and players are sent to them. But the initial game state for those matches also needs to be relayed to the hub so lobby spectators see boards immediately.

**Step 1: Add relay after tournament match creation**

In the tournament start path (around line 283-315), after `startTournament()` returns the match sessions, relay each match's initial game state:

```typescript
// After emitting tournament:updated to hub
for (const matchSession of matchSessions) {
  if (matchSession.gameState && matchSession.tournamentMatchId) {
    io.to(session.sessionCode).emit('tournament:match-game-state', {
      matchId: matchSession.tournamentMatchId,
      gameState: matchSession.gameState,
      sessionCode: matchSession.sessionCode,
    });
  }
}
```

Note: `session.sessionCode` here is the hub session code — the room all lobby spectators are in.

**Step 2: Build to verify**

Run: `npm run build:backend`
Expected: Compiles.

**Step 3: Commit**

```bash
git add backend/src/socket/gameHandlers.ts
git commit -m "feat: relay initial game state for tournament matches to hub"
```

---

### Task 8: Manual Integration Testing

**Step 1: Start dev servers**

Run in two terminals:

```bash
npm run dev:backend
npm run dev:frontend
```

**Step 2: Test flow**

1. Open browser tab 1: Create a session, note the code
2. Open browser tab 2: Join the session
3. Open browser tab 3: Join as spectator (join, then get moved to spectator by host)
4. In tab 1 (host): Select a tournament format (e.g., BO1) and start tournament
5. Tabs 1 & 2 should navigate to their match
6. Tab 3 should stay on lobby and see:
   - The bracket with match cards
   - A mini board appearing in the active match card once game starts
   - Tournament chat panel on the right (desktop)
7. Play a move in tab 1 — tab 3 should see the mini board update
8. Click the mini board in tab 3 — spectator modal should open with full board view
9. Send a chat message from tab 3 — should appear in tournament chat
10. Close modal, verify responsiveness at different viewport widths

**Step 3: Commit any fixes found during testing**

---

### Task 9: Final Cleanup and Lint

**Step 1: Run lint**

```bash
npm run lint:fix
```

**Step 2: Run format**

```bash
npm run format
```

**Step 3: Build production**

```bash
npm run build
```

Expected: Clean build with no warnings.

**Step 4: Commit any fixes**

```bash
git add -A
git commit -m "chore: lint and format tournament spectator lobby"
```
