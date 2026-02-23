---
name: add-game
description: Scaffold a new game for the Ancient Games platform. Use when the user says "add a game", "create a new game", "implement [game name]", or similar. Guides implementation of all required backend and frontend pieces.
argument-hint: <game-id> "<Display Name>" "<emoji>"
---

You are helping add a new game to the Ancient Games platform. This is a full-stack TypeScript monorepo (npm workspaces) with:

- `shared/` — types only
- `backend/` — Node.js + Express + Socket.io + game logic
- `frontend/` — React 18 + Vite + Tailwind CSS

## Arguments

Parse `$ARGUMENTS` as: `<game-id> "<Display Name>" "<emoji>"`

- `game-id`: kebab-case identifier (e.g. `fox-and-geese`)
- `Display Name`: human-readable title (e.g. `Fox & Geese`)
- `emoji`: single emoji for the game picker (e.g. `🦊`)

If any argument is missing, ask the user before proceeding.

## Step 0: Understand the game

Before writing any code, if the game rules are not obvious or well-known, ask the user to describe:

1. Board layout and number of positions
2. Number of pieces per player
3. Dice mechanic (or whether it's dice-free — use `rollDice()` returning `1` always)
4. Win condition
5. Any special squares, captures, or multi-phase mechanics

## Step 1: Shared types — add GameType

Edit `shared/types/game.ts`:

```typescript
// Before:
export type GameType = 'ur' | 'senet' | 'morris' | 'wolves-and-ravens';

// After (add your game-id to the union):
export type GameType = 'ur' | 'senet' | 'morris' | 'wolves-and-ravens' | 'GAME_ID';
```

## Step 2: Backend — create the game engine

Create `backend/src/games/GAME_ID/GAMECLASSGame.ts`:

```typescript
import { GameEngine } from '../GameEngine';
import { BoardState, Move, Player, PiecePosition } from '@ancient-games/shared';

/**
 * [DISPLAY NAME] Implementation
 *
 * Board layout: [describe positions]
 * Position encoding:
 *   -1 = not on board / waiting
 *   0–N = board positions
 *   99 = finished / captured / removed
 */
export class GAMECLASSGame extends GameEngine {
  gameType = 'GAME_ID' as const;
  playerCount = 2;

  // --- constants ---
  private readonly PIECES_PER_PLAYER = N;

  initializeBoard(): BoardState {
    const pieces: PiecePosition[] = [];
    for (let player = 0; player < 2; player++) {
      for (let i = 0; i < this.PIECES_PER_PLAYER; i++) {
        pieces.push({ playerNumber: player, pieceIndex: i, position: -1 });
      }
    }
    return {
      pieces,
      currentTurn: Math.floor(Math.random() * 2), // or 0 if first player is fixed
      diceRoll: null,
      lastMove: null,
    };
  }

  rollDice(): number {
    // Standard d6: return Math.ceil(Math.random() * 6);
    // Binary dice (0–4): sum of 4 coin flips
    // No dice (Morris-style): return 1;
    // Implement based on game rules
    return Math.ceil(Math.random() * 6);
  }

  validateMove(board: BoardState, move: Move, player: Player): boolean {
    const { pieceIndex, to } = move;
    const playerNumber = player.playerNumber;
    const piece = board.pieces.find(
      (p) => p.playerNumber === playerNumber && p.pieceIndex === pieceIndex,
    );
    if (!piece) return false;
    if (board.diceRoll === null) return false;

    // TODO: implement game-specific validation
    // - Check destination is reachable with the dice roll
    // - Check destination not blocked by own piece
    // - Check captures allowed
    return false;
  }

  applyMove(board: BoardState, move: Move): BoardState {
    const newPieces = board.pieces.map((p) => ({ ...p }));
    const pieceIdx = newPieces.findIndex(
      (p) => p.playerNumber === board.currentTurn && p.pieceIndex === move.pieceIndex,
    );
    if (pieceIdx === -1) return board;

    // Handle captures if needed:
    // const capturedIdx = newPieces.findIndex(p => p.playerNumber !== board.currentTurn && p.position === move.to);
    // if (capturedIdx !== -1) newPieces[capturedIdx] = { ...newPieces[capturedIdx], position: 99 };

    newPieces[pieceIdx] = { ...newPieces[pieceIdx], position: move.to };

    // IMPORTANT: applyMove must always:
    //   1. Advance currentTurn (unless extra-turn rule applies)
    //   2. Set diceRoll: null
    const extraTurn = false; // set true if game grants extra turns
    return {
      ...board,
      pieces: newPieces,
      currentTurn: extraTurn ? board.currentTurn : (board.currentTurn + 1) % 2,
      diceRoll: null,
      lastMove: move,
    };
  }

  checkWinCondition(board: BoardState): number | null {
    for (let playerNumber = 0; playerNumber < 2; playerNumber++) {
      const playerPieces = board.pieces.filter((p) => p.playerNumber === playerNumber);
      // TODO: define win condition — e.g. all pieces at position 99
      if (playerPieces.every((p) => p.position === 99)) return playerNumber;
    }
    return null;
  }

  getValidMoves(board: BoardState, playerNumber: number, diceRoll: number): Move[] {
    const moves: Move[] = [];
    const playerPieces = board.pieces.filter(
      (p) => p.playerNumber === playerNumber && p.position !== 99,
    );

    for (const piece of playerPieces) {
      // TODO: compute legal destinations from piece.position + diceRoll
      // Push each valid { playerId: '', pieceIndex, from: piece.position, to, diceRoll }
    }

    return moves;
  }

  canMove(board: BoardState, playerNumber: number, diceRoll: number): boolean {
    return this.getValidMoves(board, playerNumber, diceRoll).length > 0;
  }
}
```

### Key rules to enforce in applyMove:

- Always set `diceRoll: null` — the server checks this to know a move was applied
- Always advance `currentTurn` to `(currentTurn + 1) % 2`, unless the game has an extra-turn mechanic
- Return a new `BoardState` object (spread `...board`, then override fields) — never mutate in place

## Step 2b: Backend — add to Mongoose schema enum

Edit `backend/src/models/Session.ts`. The `gameType` field has a hardcoded enum that MongoDB validates against — if you skip this step, session creation will fail with "not a valid enum value":

```typescript
// Before:
gameType: { type: String, enum: ['ur', 'senet', 'morris', 'wolves-and-ravens'], required: true },

// After:
gameType: { type: String, enum: ['ur', 'senet', 'morris', 'wolves-and-ravens', 'GAME_ID'], required: true },
```

## Step 3: Backend — register in GameRegistry

Edit `backend/src/games/GameRegistry.ts`:

```typescript
// Add import at top:
import { GAMECLASSGame } from './GAME_ID/GAMECLASSGame';

// Add to the Map:
['GAME_ID', new GAMECLASSGame() as GameEngine],
```

## Step 3b: Backend — write game engine tests

Create `backend/src/games/GAME_ID/GAMECLASSGame.test.ts` (colocated with the engine):

```typescript
import { describe, it, expect } from 'vitest';
import { GAMECLASSGame } from './GAMECLASSGame';
import { Move, Player } from '@ancient-games/shared';

const game = new GAMECLASSGame();

function makePlayer(playerNumber: number): Player {
  return { id: 'p', displayName: 'P', socketId: 's', ready: true, playerNumber, status: 'active' };
}

describe('GAMECLASSGame', () => {
  describe('initializeBoard', () => {
    it('creates the correct number of pieces', () => {
      const board = game.initializeBoard();
      expect(board.pieces).toHaveLength(EXPECTED_TOTAL);
      expect(board.pieces.filter((p) => p.playerNumber === 0)).toHaveLength(EXPECTED_PER_PLAYER);
      expect(board.pieces.filter((p) => p.playerNumber === 1)).toHaveLength(EXPECTED_PER_PLAYER);
    });

    it('starts with null diceRoll', () => {
      expect(game.initializeBoard().diceRoll).toBeNull();
    });

    it('currentTurn is 0 or 1', () => {
      expect([0, 1]).toContain(game.initializeBoard().currentTurn);
    });
  });

  describe('rollDice', () => {
    it('returns values within expected range', () => {
      const results = new Set<number>();
      for (let i = 0; i < 200; i++) results.add(game.rollDice());
      expect(Math.min(...results)).toBeGreaterThanOrEqual(MIN_ROLL);
      expect(Math.max(...results)).toBeLessThanOrEqual(MAX_ROLL);
    });
  });

  describe('validateMove', () => {
    it('rejects move when diceRoll is null', () => {
      const board = game.initializeBoard();
      const move: Move = { playerId: '', pieceIndex: 0, from: -1, to: 0 };
      expect(game.validateMove(board, move, makePlayer(board.currentTurn))).toBe(false);
    });

    // TODO: add game-specific validation tests:
    // - valid move accepted
    // - move to occupied square rejected
    // - out-of-range move rejected
    // - capture rules tested
  });

  describe('applyMove', () => {
    // TODO: add game-specific tests:
    // - piece moves to target position
    // - diceRoll is cleared to null
    // - currentTurn advances (or stays for extra turn)
    // - captures work correctly
  });

  describe('checkWinCondition', () => {
    it('returns null at game start', () => {
      expect(game.checkWinCondition(game.initializeBoard())).toBeNull();
    });

    // TODO: add game-specific win condition tests:
    // - returns winner player number when condition met
  });

  describe('getValidMoves', () => {
    it('returns moves from initial position', () => {
      const board = game.initializeBoard();
      board.diceRoll = TYPICAL_ROLL;
      const moves = game.getValidMoves(board, board.currentTurn, TYPICAL_ROLL);
      expect(moves.length).toBeGreaterThan(0);
    });
  });
});
```

### Test guidelines:

- Replace `EXPECTED_TOTAL`, `EXPECTED_PER_PLAYER`, `MIN_ROLL`, `MAX_ROLL`, `TYPICAL_ROLL` with actual values for this game
- Fill in all `TODO` sections with concrete tests for this game's specific mechanics
- Every `describe` block should have at least 2-3 tests
- Test edge cases: captures, blocked moves, win detection, extra turns
- Run `npm test` to verify all tests pass before moving to frontend work

## Step 4: Frontend — create the board component

Create `frontend/src/components/games/GAME_ID/GAMECLASSBoard.tsx`:

```typescript
import { Session, GameState } from '@ancient-games/shared';
import { socketService } from '../../../services/socket';

interface GAMECLASSBoardProps {
  session: Session;
  gameState: GameState;
  playerId: string;
  isMyTurn: boolean;
  animatingPiece?: { playerNumber: number; pieceIndex: number } | null;
}

export default function GAMECLASSBoard({
  session,
  gameState,
  playerId,
  isMyTurn,
  animatingPiece,
}: GAMECLASSBoardProps) {
  const socket = socketService.getSocket();
  const { board } = gameState;
  const currentPlayer = session.players.find(p => p.id === playerId);

  function handleRollDice() {
    if (!isMyTurn || board.diceRoll !== null) return;
    const socket = socketService.getSocket();
    if (!socket) return;
    socket.emit('game:roll-dice', { sessionCode: session.sessionCode, playerId: playerId! });
  }

  function handleMove(pieceIndex: number, from: number, to: number) {
    if (!isMyTurn || board.diceRoll === null) return;
    const socket = socketService.getSocket();
    if (!socket) return;
    socket.emit('game:move', {
      sessionCode: session.sessionCode,
      playerId: playerId!,
      move: {
        playerId: playerId!,
        pieceIndex,
        from,
        to,
        diceRoll: board.diceRoll,
      },
    });
  }

  // TODO: render the board, pieces, and controls
  return (
    <div className="flex flex-col items-center gap-4 p-4">
      {/* Dice area */}
      {isMyTurn && board.diceRoll === null && !gameState.finished && (
        <button
          onClick={handleRollDice}
          className="btn btn-primary px-6 py-3 text-lg font-semibold"
        >
          Roll Dice
        </button>
      )}
      {board.diceRoll !== null && (
        <div className="text-2xl font-bold" style={{ color: '#E8C870' }}>
          Roll: {board.diceRoll}
        </div>
      )}

      {/* Board SVG or grid goes here */}
      <div className="text-gray-400 text-sm">
        [Board rendering not yet implemented]
      </div>
    </div>
  );
}
```

### Board rendering notes:

- Use SVG or CSS grid — look at `UrBoard.tsx` for SVG patterns, `MorrisBoard.tsx` for grid patterns
- Pieces are in `board.pieces`, filtered by `playerNumber` and `position`
- Highlight valid moves client-side for UX (server validates for security)
- The `animatingPiece` prop can be used to suppress rendering the piece during animation

## Step 5: Frontend — wire into GameRoom

Edit `frontend/src/components/GameRoom.tsx`:

### 5a. Add import (with other board imports at top):

```typescript
import GAMECLASSBoard from './games/GAME_ID/GAMECLASSBoard';
```

### 5b. Add board render (around line 929, after last `{session.gameType === ...}`):

```typescript
{session.gameType === 'GAME_ID' && (
  <GAMECLASSBoard
    session={session}
    gameState={gameState}
    playerId={playerId!}
    isMyTurn={isMyTurn}
  />
)}
```

### 5c. Add title display (around line 572–575, in the `{session.gameType === ...}` ternary chain):

```typescript
// Change the final fallback from 'Senet' to the new chain:
{
  session.gameType === 'ur'
    ? 'Royal Game of Ur'
    : session.gameType === 'morris'
      ? "Nine Men's Morris"
      : session.gameType === 'wolves-and-ravens'
        ? 'Wolves & Ravens'
        : session.gameType === 'GAME_ID'
          ? 'DISPLAY NAME'
          : 'Senet';
}
```

Similarly update the same ternary around line 223 (notification text).

### 5d. Add score info (around line 690, inside the `scoreInfo` IIFE):

```typescript
if (session.gameType === 'GAME_ID') {
  const finished = boardPieces.filter(
    (p) => p.playerNumber === seatIndex && p.position === 99,
  ).length;
  const onBoard = boardPieces.filter(
    (p) => p.playerNumber === seatIndex && p.position >= 0 && p.position < 99,
  ).length;
  return `${onBoard} on board · ${finished} finished`;
}
```

### 5e. (Optional) Animation support — around line 195:

```typescript
// Only add if the board component supports animatingPiece
const supportsAnimation =
  session?.gameType === 'ur' || session?.gameType === 'senet' || session?.gameType === 'GAME_ID';
```

## Step 6: Frontend — add to game picker (Home.tsx)

Edit `frontend/src/components/Home.tsx`. Add a button in the `grid grid-cols-2 gap-3` div (around line 136):

```tsx
<button
  onClick={() => setGameType('GAME_ID')}
  className={`p-4 rounded-lg border-2 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 ${
    gameType === 'GAME_ID'
      ? 'border-primary-500 bg-primary-500/20'
      : 'border-gray-600 hover:border-gray-500'
  }`}
>
  <div className="text-2xl mb-2">EMOJI</div>
  <div className="font-semibold text-sm">DISPLAY NAME</div>
  <div className="text-xs text-gray-400 mt-1">2 players</div>
</button>
```

## Step 7: Frontend — add to SessionLobby GAME_NAMES

Edit `frontend/src/components/lobby/SessionLobby.tsx`, around line 9:

```typescript
const GAME_NAMES: Record<string, string> = {
  ur: 'Royal Game of Ur',
  senet: 'Senet',
  morris: "Nine Men's Morris",
  'wolves-and-ravens': 'Wolves & Ravens',
  GAME_ID: 'DISPLAY NAME', // ← add this line
};
```

## Step 8: Frontend — add rules to GameRules.tsx

Edit `frontend/src/components/GameRules.tsx`:

```typescript
// In the main component, add:
{gameType === 'GAME_ID' && <GAMECLASSRules />}

// Add a new rules function at the bottom:
function GAMECLASSRules() {
  return (
    <>
      <div className="text-center pb-1">
        <div className="text-2xl mb-1">EMOJI</div>
        <p className="font-bold" style={{ color: '#F0D090' }}>DISPLAY NAME</p>
        <p className="text-xs mt-1" style={{ color: '#7A6A50' }}>Brief description</p>
      </div>
      <Section title="Objective">How to win.</Section>
      <Section title="Movement">How pieces move.</Section>
      <Section title="Special Rules">Any special mechanics.</Section>
    </>
  );
}
```

## Checklist

After implementing, verify:

- [ ] `shared/types/game.ts` — `GameType` union updated
- [ ] `backend/src/models/Session.ts` — Mongoose `gameType` enum updated (**required or session creation fails**)
- [ ] `backend/src/games/GAME_ID/GAMECLASSGame.ts` — engine created
- [ ] `backend/src/games/GameRegistry.ts` — engine registered
- [ ] `backend/src/games/GAME_ID/GAMECLASSGame.test.ts` — engine tests written and passing (`npm test`)
- [ ] `frontend/src/components/games/GAME_ID/GAMECLASSBoard.tsx` — board created
- [ ] `GameRoom.tsx` — import, render, title, score info updated
- [ ] `Home.tsx` — game picker button added
- [ ] `SessionLobby.tsx` — GAME_NAMES entry added
- [ ] `GameRules.tsx` — rules component added
- [ ] `npm test` passes (all game engine tests green)
- [ ] `npm run build` passes with no TypeScript errors

## Common pitfalls

1. **`applyMove` must set `diceRoll: null`** — if it doesn't, the server will think no move was applied and the client will be stuck
2. **`applyMove` must advance `currentTurn`** — or the same player moves forever
3. **`validateMove` reads `board.diceRoll`**, not the move's `diceRoll` — the server stores the roll on `board` before calling validate
4. **Position 99 = finished**, not "captured" (unless your game uses capture-as-elimination like Wolves & Ravens) — filter `!== 99` when computing available pieces
5. **Morris exception**: `diceRoll` is repurposed as a phase indicator (`null` = auto-step, `1` = move, `2` = remove). Only do this if your game needs multi-phase turns.
6. **TypeScript cast in GameRoom** — `GameRules` receives `gameType` cast as the union literal type; since you've updated `GameType`, it will just work
7. **Mongoose enum must be updated** — `backend/src/models/Session.ts` has a separate hardcoded `enum` array for `gameType`. Updating `shared/types/game.ts` alone is not enough; MongoDB will reject session creation with "not a valid enum value" until this is also updated.
8. **`session.sessionCode` not `session.code`** — the `Session` type uses `sessionCode` as the field name. Board components must use `session.sessionCode` when emitting socket events.
9. **`game:move` requires top-level `playerId`** — the socket event payload is `{ sessionCode, playerId, move }`, not just `{ sessionCode, move }`. Both the top-level `playerId` and the one inside `move` are required.
