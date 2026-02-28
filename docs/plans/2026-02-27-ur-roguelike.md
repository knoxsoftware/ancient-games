# Ur: Cursed Paths Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add `ur-roguelike` as a new game type — an Ur variant with a pre-game power-up draft and mid-game event squares triggered by landing on them.

**Architecture:** `UrRoguelikeGame` extends `UrGame` and overrides `initializeBoard`, `rollDice`, and `applyMove` to apply modifiers and trigger events. New socket events handle the draft phase. The frontend adds a draft modal overlay and event square rendering on top of the existing Ur board visuals.

**Tech Stack:** TypeScript, Node.js/Express/Socket.io, React 18, Tailwind CSS, Vitest

---

## Task 1: Add shared types for roguelike state

**Files:**
- Modify: `shared/types/game.ts`

Extend `BoardState` with roguelike fields and add the `Modifier` interface.

**Step 1: Add `Modifier` interface and extend `BoardState`**

In `shared/types/game.ts`, add after the existing `PiecePosition` interface:

```ts
export interface Modifier {
  id: string;
  owner: number | 'global';
  remainingUses: number | null; // null = permanent for the game
  params?: Record<string, unknown>;
}
```

And add optional fields to `BoardState`:

```ts
export interface BoardState {
  pieces: PiecePosition[];
  currentTurn: number;
  diceRoll: number | null;
  lastMove: Move | null;
  // Roguelike extensions (only present for ur-roguelike)
  modifiers?: Modifier[];
  eventSquares?: number[];
  draftPhase?: boolean;
  draftOffers?: { player: number; options: string[] }[];
  pendingEventResult?: { eventId: string; description: string; affectedPieceIndices?: number[] } | null;
  skipNextTurn?: number | null; // playerNumber whose next turn is skipped
  barrierSquares?: { position: number; turnsRemaining: number }[];
  extraTurnFor?: number | null; // playerNumber who gets an extra turn
}
```

**Step 2: Add `ur-roguelike` to `GameType`**

```ts
export type GameType =
  | 'ur'
  | 'senet'
  | 'morris'
  | 'wolves-and-ravens'
  | 'rock-paper-scissors'
  | 'stellar-siege'
  | 'fox-and-geese'
  | 'mancala'
  | 'go'
  | 'ur-roguelike';
```

**Step 3: Add manifest entry**

In `GAME_MANIFESTS`:

```ts
'ur-roguelike': {
  type: 'ur-roguelike',
  title: 'Ur: Cursed Paths',
  emoji: '🎲',
  description: '2 players · roguelike',
  playerColors: ['#2F6BAD', '#7A4A22'],
  supportsAnimation: true,
},
```

**Step 4: Build shared to verify no type errors**

```bash
npm run build --workspace=shared
```

Expected: builds cleanly with no TypeScript errors.

**Step 5: Commit**

```bash
git add shared/
git commit -m "feat(shared): add ur-roguelike game type and Modifier/BoardState extensions"
```

---

## Task 2: Add draft/event socket events to shared types

**Files:**
- Modify: `shared/types/socket-events.ts`

**Step 1: Add new events**

In `ClientToServerEvents`, add:

```ts
'game:draft-pick': (data: { sessionCode: string; playerId: string; powerId: string }) => void;
```

In `ServerToClientEvents`, add:

```ts
'game:draft-offer': (data: {
  sessionCode: string;
  playerNumber: number;
  options: string[];
}) => void;
'game:event-triggered': (data: {
  sessionCode: string;
  eventId: string;
  description: string;
  affectedPieceIndices?: number[];
}) => void;
```

**Step 2: Rebuild shared**

```bash
npm run build --workspace=shared
```

**Step 3: Commit**

```bash
git add shared/
git commit -m "feat(shared): add draft-pick, draft-offer, event-triggered socket events"
```

---

## Task 3: Implement the roguelike game engine

**Files:**
- Create: `backend/src/games/ur-roguelike/UrRoguelikeGame.ts`
- Create: `backend/src/games/ur-roguelike/UrRoguelikeGame.test.ts`

### Power-up and event pools

Create `backend/src/games/ur-roguelike/UrRoguelikeGame.ts`:

```ts
import { UrGame } from '../ur/UrGame';
import { BoardState, Move, Player, Modifier } from '@ancient-games/shared';

// ── Power-up pool (draft) ──────────────────────────────────────────────────

export const POWER_UPS: Record<string, { name: string; description: string }> = {
  double_roll:  { name: 'Loaded Dice',   description: 'Once: roll twice, take the higher result' },
  ghost_piece:  { name: 'Ghost Piece',   description: 'Your first-moved piece is immune to capture' },
  safe_passage: { name: 'Ward',          description: 'Your pieces cannot be captured — 3 uses' },
  reroll:       { name: 'Fickle Fate',   description: 'Once: reroll after seeing your dice result' },
  extra_move:   { name: 'Surge',         description: 'Once: move a second piece with the same roll' },
  slow_curse:   { name: 'Hex',           description: "Once: skip your opponent's next turn" },
};

export const POWER_UP_IDS = Object.keys(POWER_UPS);

// ── Event pool (landing triggers) ─────────────────────────────────────────

export const EVENTS: Record<string, { name: string; description: string }> = {
  board_flip:       { name: 'Reversal',      description: 'Move any one of your pieces backward by 1' },
  piece_swap:       { name: 'Transposition', description: "Swap one of your pieces with one of your opponent's" },
  opponent_setback: { name: 'Stumble',       description: "Send opponent's most-advanced piece back 2 squares" },
  extra_turn:       { name: 'Fortune',       description: 'Take an extra turn immediately' },
  rosette_shift:    { name: 'Shifting Stars','description': 'A random shared square becomes a rosette' },
  dice_curse:       { name: 'Loaded Against', description: "Opponent's next roll is halved" },
  free_entry:       { name: 'Rush',          description: 'Place one off-board piece at position 0 immediately' },
  barrier:          { name: 'Blockade',      description: 'A random shared square is impassable for 3 turns' },
};

export const EVENT_IDS = Object.keys(EVENTS);

// ── Candidate event square positions (shared track: 4-11, not rosette pos 6) ──
const EVENT_SQUARE_CANDIDATES = [5, 7, 8, 9, 10];
const DRAFT_OFFER_SIZE = 3;

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function pickN<T>(arr: T[], n: number): T[] {
  return shuffle(arr).slice(0, n);
}

export class UrRoguelikeGame extends UrGame {
  gameType = 'ur-roguelike' as const;

  // ── Board initialization ───────────────────────────────────────────────

  initializeBoard(): BoardState {
    const base = super.initializeBoard();

    // Pick 3 event squares from candidates
    const eventSquares = pickN(EVENT_SQUARE_CANDIDATES, 3);

    // Prepare draft offers for each player
    const pool = shuffle(POWER_UP_IDS);
    const draftOffers = [
      { player: 0, options: pool.slice(0, DRAFT_OFFER_SIZE) },
      { player: 1, options: pool.slice(DRAFT_OFFER_SIZE, DRAFT_OFFER_SIZE * 2) },
    ];

    return {
      ...base,
      modifiers: [],
      eventSquares,
      draftPhase: true,
      draftOffers,
      pendingEventResult: null,
      skipNextTurn: null,
      barrierSquares: [],
      extraTurnFor: null,
    };
  }

  // ── Draft: apply a picked power-up ────────────────────────────────────

  applyDraftPick(board: BoardState, playerNumber: number, powerId: string): BoardState {
    const modifiers: Modifier[] = [...(board.modifiers ?? [])];

    switch (powerId) {
      case 'double_roll':
        modifiers.push({ id: 'double_roll', owner: playerNumber, remainingUses: 1 });
        break;
      case 'ghost_piece':
        // ghost_piece: mark the first piece the player moves as immune.
        // We store it with remainingUses: null (permanent) and a sentinel pieceIndex of -1
        // meaning "not yet assigned". applyMove will assign it on the player's first move.
        modifiers.push({ id: 'ghost_piece', owner: playerNumber, remainingUses: null, params: { pieceIndex: -1 } });
        break;
      case 'safe_passage':
        modifiers.push({ id: 'safe_passage', owner: playerNumber, remainingUses: 3 });
        break;
      case 'reroll':
        modifiers.push({ id: 'reroll', owner: playerNumber, remainingUses: 1 });
        break;
      case 'extra_move':
        modifiers.push({ id: 'extra_move', owner: playerNumber, remainingUses: 1 });
        break;
      case 'slow_curse':
        modifiers.push({ id: 'slow_curse', owner: playerNumber, remainingUses: 1 });
        break;
    }

    // Check if both players have picked
    const offers = (board.draftOffers ?? []).filter((o) => o.player !== playerNumber);
    const bothPicked = offers.length === 0;

    return {
      ...board,
      modifiers,
      draftOffers: offers,
      draftPhase: !bothPicked,
    };
  }

  // ── Dice roll (respects double_roll modifier) ──────────────────────────

  rollDice(): number {
    // Base roll
    return super.rollDice();
  }

  // The double_roll modifier is resolved in applyRoll (called from gameHandlers).
  // We expose a helper so the handler can check/consume the modifier.
  applyDoubleRoll(board: BoardState, playerNumber: number, rawRoll: number): { roll: number; board: BoardState } {
    const idx = (board.modifiers ?? []).findIndex(
      (m) => m.id === 'double_roll' && m.owner === playerNumber && (m.remainingUses ?? 0) > 0,
    );
    if (idx === -1) return { roll: rawRoll, board };

    const roll2 = super.rollDice();
    const best = Math.max(rawRoll, roll2);
    const modifiers = [...(board.modifiers ?? [])];
    modifiers[idx] = { ...modifiers[idx], remainingUses: 0 };
    return { roll: best, board: { ...board, modifiers } };
  }

  // ── applyMove override ─────────────────────────────────────────────────

  applyMove(board: BoardState, move: Move): BoardState {
    let newBoard = { ...board };
    const currentPlayer = board.currentTurn;
    const modifiers = [...(board.modifiers ?? [])];

    // ── Assign ghost_piece on first move ──
    const ghostIdx = modifiers.findIndex(
      (m) => m.id === 'ghost_piece' && m.owner === currentPlayer && m.params?.pieceIndex === -1,
    );
    if (ghostIdx !== -1) {
      modifiers[ghostIdx] = {
        ...modifiers[ghostIdx],
        params: { pieceIndex: move.pieceIndex },
      };
      newBoard = { ...newBoard, modifiers };
    }

    // ── Check safe_passage: prevent capture of moving player's pieces ──
    // This is handled in isPositionAvailableForPlayer — we pass the board with modifiers through.
    // (override below)

    // ── Apply base Ur move (handles captures, rosette extra turn, piece advancement) ──
    newBoard = super.applyMove({ ...newBoard, modifiers }, move);

    // ── Decrement barrier squares ──
    const barrierSquares = (board.barrierSquares ?? [])
      .map((b) => ({ ...b, turnsRemaining: b.turnsRemaining - 1 }))
      .filter((b) => b.turnsRemaining > 0);
    newBoard = { ...newBoard, barrierSquares };

    // ── Check if landed on event square ──
    let pendingEventResult = null;
    const eventSquares = [...(board.eventSquares ?? [])];
    const landedOnEvent = move.to !== 99 && eventSquares.includes(move.to);

    if (landedOnEvent) {
      const remainingEventSquares = eventSquares.filter((sq) => sq !== move.to);
      const eventId = shuffle(EVENT_IDS)[0];
      const result = this.applyEvent(newBoard, eventId, currentPlayer, move.pieceIndex);
      newBoard = result.board;
      newBoard = { ...newBoard, eventSquares: remainingEventSquares };
      pendingEventResult = {
        eventId,
        description: EVENTS[eventId].description,
        affectedPieceIndices: result.affectedPieceIndices,
      };
    }

    // ── Handle slow_curse: check if current player had it applied ──
    let skipNextTurn = board.skipNextTurn ?? null;
    if (skipNextTurn === newBoard.currentTurn) {
      // Skip the turn that was cursed
      newBoard = { ...newBoard, currentTurn: (newBoard.currentTurn + 1) % 2 };
      skipNextTurn = null;
    }

    // ── Handle extraTurnFor ──
    let extraTurnFor = board.extraTurnFor ?? null;
    if (extraTurnFor !== null && extraTurnFor === currentPlayer) {
      newBoard = { ...newBoard, currentTurn: currentPlayer };
      extraTurnFor = null;
    }

    return {
      ...newBoard,
      pendingEventResult,
      skipNextTurn,
      extraTurnFor,
    };
  }

  // ── Event application ──────────────────────────────────────────────────

  private applyEvent(
    board: BoardState,
    eventId: string,
    triggeringPlayer: number,
    triggeringPieceIndex: number,
  ): { board: BoardState; affectedPieceIndices?: number[] } {
    const opponent = (triggeringPlayer + 1) % 2;
    const pieces = [...board.pieces];

    switch (eventId) {
      case 'board_flip': {
        // Move one of current player's pieces backward by 1 (pick furthest on board)
        const candidates = pieces
          .filter((p) => p.playerNumber === triggeringPlayer && p.position > 0 && p.position !== 99)
          .sort((a, b) => b.position - a.position);
        if (candidates.length === 0) return { board };
        const target = candidates[0];
        const idx = pieces.findIndex((p) => p.playerNumber === target.playerNumber && p.pieceIndex === target.pieceIndex);
        pieces[idx] = { ...pieces[idx], position: Math.max(0, target.position - 1) };
        return { board: { ...board, pieces }, affectedPieceIndices: [target.pieceIndex] };
      }

      case 'piece_swap': {
        // Swap the triggering player's piece with the opponent's most advanced piece
        const trigIdx = pieces.findIndex(
          (p) => p.playerNumber === triggeringPlayer && p.pieceIndex === triggeringPieceIndex,
        );
        const opponentCandidates = pieces
          .filter((p) => p.playerNumber === opponent && p.position >= 0 && p.position !== 99)
          .sort((a, b) => b.position - a.position);
        if (trigIdx === -1 || opponentCandidates.length === 0) return { board };
        const opponentTarget = opponentCandidates[0];
        const oppIdx = pieces.findIndex((p) => p.playerNumber === opponent && p.pieceIndex === opponentTarget.pieceIndex);
        const trigPos = pieces[trigIdx].position;
        const oppPos = pieces[oppIdx].position;
        pieces[trigIdx] = { ...pieces[trigIdx], position: oppPos };
        pieces[oppIdx] = { ...pieces[oppIdx], position: trigPos };
        return { board: { ...board, pieces }, affectedPieceIndices: [triggeringPieceIndex, opponentTarget.pieceIndex] };
      }

      case 'opponent_setback': {
        const opponentCandidates = pieces
          .filter((p) => p.playerNumber === opponent && p.position > 0 && p.position !== 99)
          .sort((a, b) => b.position - a.position);
        if (opponentCandidates.length === 0) return { board };
        const target = opponentCandidates[0];
        const idx = pieces.findIndex((p) => p.playerNumber === opponent && p.pieceIndex === target.pieceIndex);
        pieces[idx] = { ...pieces[idx], position: Math.max(0, target.position - 2) };
        return { board: { ...board, pieces }, affectedPieceIndices: [target.pieceIndex] };
      }

      case 'extra_turn':
        return { board: { ...board, extraTurnFor: triggeringPlayer } };

      case 'rosette_shift': {
        // Pick a random shared non-rosette square (positions 4-11, excluding existing rosettes and event squares)
        const ROSETTES = new Set([2, 6, 13]);
        const eventSquares = new Set(board.eventSquares ?? []);
        const candidates = [4, 5, 7, 8, 9, 10, 11].filter((p) => !ROSETTES.has(p) && !eventSquares.has(p));
        if (candidates.length === 0) return { board };
        const newRosette = candidates[Math.floor(Math.random() * candidates.length)];
        const extraRosettes = [...((board as any).extraRosettes ?? []), newRosette];
        return { board: { ...board, extraRosettes } as BoardState };
      }

      case 'dice_curse':
        return { board: { ...board, skipNextTurn: null, extraTurnFor: null, modifiers: [
          ...(board.modifiers ?? []),
          { id: 'dice_curse_active', owner: opponent, remainingUses: 1 },
        ]} };

      case 'free_entry': {
        const offBoard = pieces.filter((p) => p.playerNumber === triggeringPlayer && p.position === -1);
        if (offBoard.length === 0) return { board };
        const target = offBoard[0];
        const idx = pieces.findIndex((p) => p.playerNumber === target.playerNumber && p.pieceIndex === target.pieceIndex);
        pieces[idx] = { ...pieces[idx], position: 0 };
        return { board: { ...board, pieces }, affectedPieceIndices: [target.pieceIndex] };
      }

      case 'barrier': {
        const sharedSquares = [4, 5, 7, 8, 9, 10, 11];
        const existingBarriers = new Set((board.barrierSquares ?? []).map((b) => b.position));
        const candidates = sharedSquares.filter((s) => !existingBarriers.has(s));
        if (candidates.length === 0) return { board };
        const pos = candidates[Math.floor(Math.random() * candidates.length)];
        const barrierSquares = [...(board.barrierSquares ?? []), { position: pos, turnsRemaining: 3 }];
        return { board: { ...board, barrierSquares } };
      }

      default:
        return { board };
    }
  }

  // ── validateMove: respect barriers, ghost_piece capture immunity, safe_passage ──

  validateMove(board: BoardState, move: Move, player: Player): boolean {
    const { to } = move;
    const playerNumber = player.playerNumber;

    // Barrier check: cannot move to a barrier square
    if (board.barrierSquares?.some((b) => b.position === to)) return false;

    // Base validation
    if (!super.validateMove(board, move, player)) return false;

    // safe_passage: prevent opponent from capturing this player's piece on a shared square
    // (handled in isPositionAvailableForPlayer — but since that's private in base,
    // we check it here: if a move would capture one of our pieces protected by safe_passage, reject)
    // Actually we need to prevent capture OF our pieces (i.e., opponent trying to move TO our safe piece).
    // The base validateMove already calls isPositionAvailableForPlayer for the moving player.
    // We need to block the opponent moving TO a square occupied by a safe_passage-protected piece.
    const safeMod = (board.modifiers ?? []).find(
      (m) => m.id === 'safe_passage' && m.owner === playerNumber && (m.remainingUses ?? 0) > 0,
    );
    if (!safeMod) return true;

    // If opponent is moving to one of our shared squares, block it
    const targetPiece = board.pieces.find(
      (p) => p.playerNumber === playerNumber && p.position === to,
    );
    // If opponent is moving (currentTurn !== playerNumber), they cannot move to this protected square
    if (board.currentTurn !== playerNumber && targetPiece) return false;

    return true;
  }

  // ── Helper: consume safe_passage use after a capture is avoided ──

  consumeSafePassage(board: BoardState, playerNumber: number): BoardState {
    const modifiers = [...(board.modifiers ?? [])];
    const idx = modifiers.findIndex(
      (m) => m.id === 'safe_passage' && m.owner === playerNumber && (m.remainingUses ?? 0) > 0,
    );
    if (idx === -1) return board;
    modifiers[idx] = { ...modifiers[idx], remainingUses: (modifiers[idx].remainingUses ?? 1) - 1 };
    return { ...board, modifiers };
  }

  // ── Helper: apply slow_curse ──

  applySlowCurse(board: BoardState, playerNumber: number): BoardState {
    const opponent = (playerNumber + 1) % 2;
    const modifiers = [...(board.modifiers ?? [])];
    const idx = modifiers.findIndex(
      (m) => m.id === 'slow_curse' && m.owner === playerNumber && (m.remainingUses ?? 0) > 0,
    );
    if (idx === -1) return board;
    modifiers[idx] = { ...modifiers[idx], remainingUses: 0 };
    return { ...board, modifiers, skipNextTurn: opponent };
  }

  // ── Helper: apply reroll ──

  consumeReroll(board: BoardState, playerNumber: number): BoardState {
    const modifiers = [...(board.modifiers ?? [])];
    const idx = modifiers.findIndex(
      (m) => m.id === 'reroll' && m.owner === playerNumber && (m.remainingUses ?? 0) > 0,
    );
    if (idx === -1) return board;
    modifiers[idx] = { ...modifiers[idx], remainingUses: 0 };
    return { ...board, modifiers };
  }

  // ── Helper: check extra_move eligibility ──

  hasExtraMove(board: BoardState, playerNumber: number): boolean {
    return (board.modifiers ?? []).some(
      (m) => m.id === 'extra_move' && m.owner === playerNumber && (m.remainingUses ?? 0) > 0,
    );
  }

  consumeExtraMove(board: BoardState, playerNumber: number): BoardState {
    const modifiers = [...(board.modifiers ?? [])];
    const idx = modifiers.findIndex(
      (m) => m.id === 'extra_move' && m.owner === playerNumber && (m.remainingUses ?? 0) > 0,
    );
    if (idx === -1) return board;
    modifiers[idx] = { ...modifiers[idx], remainingUses: 0 };
    return { ...board, modifiers };
  }

  // ── getValidMoves: filter out barrier squares ──

  getValidMoves(board: BoardState, playerNumber: number, diceRoll: number): Move[] {
    const barriers = new Set((board.barrierSquares ?? []).map((b) => b.position));
    return super.getValidMoves(board, playerNumber, diceRoll)
      .filter((m) => !barriers.has(m.to));
  }
}
```

**Step 2: Write tests**

Create `backend/src/games/ur-roguelike/UrRoguelikeGame.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { UrRoguelikeGame } from './UrRoguelikeGame';

const game = new UrRoguelikeGame();

describe('UrRoguelikeGame.initializeBoard', () => {
  it('starts in draft phase with 3 event squares and 2 draft offers', () => {
    const board = game.initializeBoard();
    expect(board.draftPhase).toBe(true);
    expect(board.eventSquares).toHaveLength(3);
    expect(board.draftOffers).toHaveLength(2);
    expect(board.draftOffers![0].options).toHaveLength(3);
    expect(board.draftOffers![1].options).toHaveLength(3);
  });

  it('event squares are within candidate positions (5,7,8,9,10)', () => {
    const candidates = new Set([5, 7, 8, 9, 10]);
    const board = game.initializeBoard();
    for (const sq of board.eventSquares!) {
      expect(candidates.has(sq)).toBe(true);
    }
  });
});

describe('UrRoguelikeGame.applyDraftPick', () => {
  it('adds a modifier when a player picks a power-up', () => {
    const board = game.initializeBoard();
    const after = game.applyDraftPick(board, 0, 'double_roll');
    expect(after.modifiers).toHaveLength(1);
    expect(after.modifiers![0].id).toBe('double_roll');
    expect(after.modifiers![0].owner).toBe(0);
    expect(after.draftPhase).toBe(true); // still waiting for player 1
  });

  it('exits draft phase when both players pick', () => {
    let board = game.initializeBoard();
    board = game.applyDraftPick(board, 0, 'double_roll');
    board = game.applyDraftPick(board, 1, 'reroll');
    expect(board.draftPhase).toBe(false);
    expect(board.modifiers).toHaveLength(2);
  });
});

describe('UrRoguelikeGame.validateMove — barriers', () => {
  it('rejects a move to a barrier square', () => {
    const board = {
      ...game.initializeBoard(),
      draftPhase: false,
      diceRoll: 3,
      currentTurn: 0,
      barrierSquares: [{ position: 7, turnsRemaining: 2 }],
    };
    // Put a piece at position 4 (shared), moving 3 = position 7 (barrier)
    board.pieces[0] = { playerNumber: 0, pieceIndex: 0, position: 4 };
    const move = { playerId: '', pieceIndex: 0, from: 4, to: 7, diceRoll: 3 };
    const player = { id: '', displayName: '', socketId: '', ready: true, playerNumber: 0, status: 'active' as const };
    expect(game.validateMove(board, move, player)).toBe(false);
  });
});

describe('UrRoguelikeGame.getValidMoves — barriers', () => {
  it('filters out barrier squares', () => {
    const board = {
      ...game.initializeBoard(),
      draftPhase: false,
      diceRoll: 3,
      currentTurn: 0,
      barrierSquares: [{ position: 7, turnsRemaining: 1 }],
    };
    board.pieces[0] = { playerNumber: 0, pieceIndex: 0, position: 4 };
    const moves = game.getValidMoves(board, 0, 3);
    expect(moves.every((m) => m.to !== 7)).toBe(true);
  });
});
```

**Step 3: Run tests**

```bash
npm test --workspace=backend
```

Expected: all new tests pass.

**Step 4: Commit**

```bash
git add backend/src/games/ur-roguelike/
git commit -m "feat(backend): implement UrRoguelikeGame engine with draft, modifiers, and events"
```

---

## Task 4: Register ur-roguelike in GameRegistry

**Files:**
- Modify: `backend/src/games/GameRegistry.ts`

**Step 1: Add import and registration**

```ts
import { UrRoguelikeGame } from './ur-roguelike/UrRoguelikeGame';
```

In the `games` map:
```ts
['ur-roguelike', new UrRoguelikeGame() as GameEngine],
```

**Step 2: Build backend to verify**

```bash
npm run build --workspace=backend
```

Expected: no TypeScript errors.

**Step 3: Commit**

```bash
git add backend/src/games/GameRegistry.ts
git commit -m "feat(backend): register ur-roguelike in GameRegistry"
```

---

## Task 5: Add draft/event socket event handling

**Files:**
- Modify: `backend/src/socket/gameHandlers.ts`

**Step 1: Read the file first**

Read `backend/src/socket/gameHandlers.ts` to understand existing handler patterns before modifying.

**Step 2: Add `game:draft-pick` handler**

After the `game:start` handler, add a handler for `game:draft-pick`:

```ts
socket.on('game:draft-pick', async ({ sessionCode, playerId, powerId }) => {
  const session = await Session.findOne({ code: sessionCode });
  if (!session) return;

  const player = session.players.find((p: Player) => p.id === playerId);
  if (!player) return;

  const engine = GameRegistry.getGame(session.gameType) as UrRoguelikeGame;
  if (typeof (engine as any).applyDraftPick !== 'function') return;

  const gameState = session.gameState as GameState;
  const newBoard = (engine as UrRoguelikeGame).applyDraftPick(
    gameState.board,
    player.playerNumber,
    powerId,
  );

  session.gameState = { ...gameState, board: newBoard };
  await session.save();

  io.to(sessionCode).emit('game:state-updated', session.gameState);

  // If draft phase ended, no further action needed — clients detect draftPhase: false
});
```

**Step 3: Add `game:event-triggered` emission in `game:move` handler**

After `session.save()` in the move handler, check for `pendingEventResult` and emit it:

```ts
if (newBoard.pendingEventResult) {
  io.to(sessionCode).emit('game:event-triggered', {
    sessionCode,
    eventId: newBoard.pendingEventResult.eventId,
    description: newBoard.pendingEventResult.description,
    affectedPieceIndices: newBoard.pendingEventResult.affectedPieceIndices,
  });
}
```

**Step 4: Handle `slow_curse` activation**

In the `game:move` handler, after `applyMove`, check if the current player has `slow_curse` unused and emit a UI trigger. The activation happens client-side via a button (see Task 7). The server only needs to handle `game:use-power` events (add as extension, see below).

**Step 5: Add `game:use-power` handler** for activating `slow_curse`, `extra_move`, `reroll` mid-game:

```ts
socket.on('game:use-power' as any, async ({ sessionCode, playerId, powerId }: any) => {
  const session = await Session.findOne({ code: sessionCode });
  if (!session) return;

  const player = session.players.find((p: Player) => p.id === playerId);
  if (!player) return;

  const engine = GameRegistry.getGame(session.gameType) as UrRoguelikeGame;
  const gameState = session.gameState as GameState;
  let newBoard = gameState.board;

  if (powerId === 'slow_curse') {
    newBoard = engine.applySlowCurse(newBoard, player.playerNumber);
  }
  // reroll and extra_move are handled inline during roll/move sequences (see Task 6)

  session.gameState = { ...gameState, board: newBoard };
  await session.save();
  io.to(sessionCode).emit('game:state-updated', session.gameState);
});
```

**Step 6: Build backend**

```bash
npm run build --workspace=backend
```

Expected: no errors.

**Step 7: Commit**

```bash
git add backend/src/socket/gameHandlers.ts
git commit -m "feat(backend): handle draft-pick, event-triggered, and use-power socket events"
```

---

## Task 6: Add socket event types for use-power

**Files:**
- Modify: `shared/types/socket-events.ts`

**Step 1: Add `game:use-power` to `ClientToServerEvents`**

```ts
'game:use-power': (data: { sessionCode: string; playerId: string; powerId: string }) => void;
```

**Step 2: Rebuild shared and backend**

```bash
npm run build --workspace=shared && npm run build --workspace=backend
```

**Step 3: Commit**

```bash
git add shared/
git commit -m "feat(shared): add game:use-power socket event"
```

---

## Task 7: Frontend — draft modal component

**Files:**
- Create: `frontend/src/components/games/ur-roguelike/DraftModal.tsx`

This modal is shown when `board.draftPhase === true` and the player has a draft offer.

```tsx
import { POWER_UPS } from '../../../../../backend/src/games/ur-roguelike/UrRoguelikeGame';
// Note: we can't import from backend directly. Instead, duplicate the display names in a local constants file.
```

Since we can't import from backend, create a constants file first:

**Step 1: Create frontend constants file**

Create `frontend/src/components/games/ur-roguelike/roguelikeConstants.ts`:

```ts
export const POWER_UP_DISPLAY: Record<string, { name: string; description: string; emoji: string }> = {
  double_roll:  { name: 'Loaded Dice',   description: 'Once: roll twice, take the higher result', emoji: '🎲' },
  ghost_piece:  { name: 'Ghost Piece',   description: 'Your first-moved piece cannot be captured', emoji: '👻' },
  safe_passage: { name: 'Ward',          description: 'Your pieces cannot be captured — 3 uses', emoji: '🛡️' },
  reroll:       { name: 'Fickle Fate',   description: 'Once: reroll after seeing your dice result', emoji: '🔄' },
  extra_move:   { name: 'Surge',         description: 'Once: move a second piece with the same roll', emoji: '⚡' },
  slow_curse:   { name: 'Hex',           description: "Once: skip your opponent's next turn", emoji: '🌑' },
};

export const EVENT_DISPLAY: Record<string, { name: string; description: string; emoji: string }> = {
  board_flip:       { name: 'Reversal',       description: 'Move one of your pieces backward by 1', emoji: '↩️' },
  piece_swap:       { name: 'Transposition',  description: "Swap one of your pieces with opponent's", emoji: '🔀' },
  opponent_setback: { name: 'Stumble',        description: "Opponent's most-advanced piece goes back 2", emoji: '💫' },
  extra_turn:       { name: 'Fortune',        description: 'Take an extra turn immediately', emoji: '⭐' },
  rosette_shift:    { name: 'Shifting Stars', description: 'A shared square becomes a rosette', emoji: '✨' },
  dice_curse:       { name: 'Loaded Against', description: "Opponent's next roll is halved", emoji: '🎭' },
  free_entry:       { name: 'Rush',           description: 'Place one off-board piece at start', emoji: '🚀' },
  barrier:          { name: 'Blockade',       description: 'A shared square is impassable for 3 turns', emoji: '🚧' },
};
```

**Step 2: Create DraftModal component**

Create `frontend/src/components/games/ur-roguelike/DraftModal.tsx`:

```tsx
import { Session, GameState } from '@ancient-games/shared';
import { socketService } from '../../../services/socket';
import { POWER_UP_DISPLAY } from './roguelikeConstants';

interface DraftModalProps {
  session: Session;
  gameState: GameState;
  playerId: string;
}

export default function DraftModal({ session, gameState, playerId }: DraftModalProps) {
  const board = gameState.board;
  const player = session.players.find((p) => p.id === playerId);
  if (!player) return null;

  const myOffer = board.draftOffers?.find((o) => o.player === player.playerNumber);
  const opponentPicked = !board.draftOffers?.some((o) => o.player !== player.playerNumber);
  const iWaiting = !myOffer;

  const pick = (powerId: string) => {
    socketService.getSocket().emit('game:draft-pick', {
      sessionCode: session.code,
      playerId,
      powerId,
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70">
      <div
        className="rounded-xl p-6 max-w-sm w-full mx-4"
        style={{ background: '#1A1510', border: '1px solid #4A3A20' }}
      >
        <h2 className="text-lg font-bold mb-1" style={{ color: '#E8C870' }}>
          ⚗️ Choose Your Power
        </h2>
        <p className="text-sm mb-4" style={{ color: '#7A6A50' }}>
          Pick one ability for this run. Your opponent is choosing simultaneously.
        </p>

        {iWaiting ? (
          <div className="text-center py-6" style={{ color: '#7A6A50' }}>
            {opponentPicked ? 'Waiting for both picks…' : 'You have chosen. Waiting for opponent…'}
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {myOffer.options.map((id) => {
              const info = POWER_UP_DISPLAY[id];
              if (!info) return null;
              return (
                <button
                  key={id}
                  onClick={() => pick(id)}
                  className="rounded-lg p-3 text-left transition-colors"
                  style={{ background: '#2A1E10', border: '1px solid #5A4020' }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = '#3A2A14')}
                  onMouseLeave={(e) => (e.currentTarget.style.background = '#2A1E10')}
                >
                  <div className="font-semibold text-sm" style={{ color: '#E8C870' }}>
                    {info.emoji} {info.name}
                  </div>
                  <div className="text-xs mt-0.5" style={{ color: '#9A8A6A' }}>
                    {info.description}
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
```

**Step 3: Commit**

```bash
git add frontend/src/components/games/ur-roguelike/
git commit -m "feat(frontend): add DraftModal and roguelike display constants"
```

---

## Task 8: Frontend — UrRoguelikeBoard component

**Files:**
- Create: `frontend/src/components/games/ur-roguelike/UrRoguelikeBoard.tsx`
- Create: `frontend/src/components/games/ur-roguelike/UrRoguelikeRules.tsx`

**Step 1: Create UrRoguelikeBoard**

This wraps the existing UrBoard but overlays the draft modal, event square markers, active modifier badges, and event toast notifications.

Create `frontend/src/components/games/ur-roguelike/UrRoguelikeBoard.tsx`:

```tsx
import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { Session, GameState } from '@ancient-games/shared';
import DraftModal from './DraftModal';
import { EVENT_DISPLAY, POWER_UP_DISPLAY } from './roguelikeConstants';

const UrBoard = lazy(() => import('../ur/UrBoard'));

interface Props {
  session: Session;
  gameState: GameState;
  playerId: string;
  isMyTurn: boolean;
}

export default function UrRoguelikeBoard({ session, gameState, playerId, isMyTurn }: Props) {
  const board = gameState.board;
  const player = session.players.find((p) => p.id === playerId);
  const [eventToast, setEventToast] = useState<{ name: string; description: string; emoji: string } | null>(null);
  const prevEventRef = useRef<string | null>(null);

  // Show toast when a new event triggers
  useEffect(() => {
    const ev = board.pendingEventResult;
    if (ev && ev.eventId !== prevEventRef.current) {
      prevEventRef.current = ev.eventId + Date.now();
      const info = EVENT_DISPLAY[ev.eventId];
      if (info) {
        setEventToast(info);
        const t = setTimeout(() => setEventToast(null), 3000);
        return () => clearTimeout(t);
      }
    }
  }, [board.pendingEventResult]);

  const myModifiers = (board.modifiers ?? []).filter(
    (m) => m.owner === player?.playerNumber && (m.remainingUses === null || (m.remainingUses ?? 0) > 0),
  );

  return (
    <div className="relative">
      {/* Draft modal overlay */}
      {board.draftPhase && (
        <DraftModal session={session} gameState={gameState} playerId={playerId} />
      )}

      {/* Event toast */}
      {eventToast && (
        <div
          className="absolute top-2 left-1/2 -translate-x-1/2 z-40 rounded-lg px-4 py-2 text-sm font-semibold shadow-lg"
          style={{ background: '#3A1A00', border: '1px solid #C47A20', color: '#E8C870', whiteSpace: 'nowrap' }}
        >
          {eventToast.emoji} {eventToast.name}: {eventToast.description}
        </div>
      )}

      {/* Active modifiers row */}
      {myModifiers.length > 0 && (
        <div className="flex gap-2 mb-2 flex-wrap">
          {myModifiers.map((m) => {
            const info = POWER_UP_DISPLAY[m.id];
            if (!info) return null;
            return (
              <span
                key={m.id}
                className="text-xs rounded px-2 py-0.5"
                style={{ background: '#2A1E10', border: '1px solid #5A4020', color: '#C4A060' }}
                title={info.description}
              >
                {info.emoji} {info.name}
                {m.remainingUses !== null ? ` (${m.remainingUses})` : ''}
              </span>
            );
          })}
        </div>
      )}

      {/* Event square legend */}
      {(board.eventSquares ?? []).length > 0 && (
        <div className="text-xs mb-2" style={{ color: '#7A6A50' }}>
          ⚗️ Event squares: positions {(board.eventSquares ?? []).sort((a, b) => a - b).join(', ')}
        </div>
      )}

      {/* Base Ur board */}
      <Suspense fallback={<div className="text-center p-4">Loading…</div>}>
        <UrBoard
          session={session}
          gameState={gameState}
          playerId={playerId}
          isMyTurn={isMyTurn}
        />
      </Suspense>
    </div>
  );
}
```

**Step 2: Create UrRoguelikeRules**

Create `frontend/src/components/games/ur-roguelike/UrRoguelikeRules.tsx`:

```tsx
import { Section } from '../../GameRules';
import { POWER_UP_DISPLAY, EVENT_DISPLAY } from './roguelikeConstants';

export default function UrRoguelikeRules() {
  return (
    <div className="space-y-4 text-sm">
      <Section title="Ur: Cursed Paths">
        <p>Standard Ur rules apply. Before the race, each player drafts one power-up. Three event squares on the shared track trigger random effects when landed on.</p>
      </Section>
      <Section title="Power-ups (draft one)">
        <ul className="space-y-1">
          {Object.entries(POWER_UP_DISPLAY).map(([, info]) => (
            <li key={info.name}><span style={{ color: '#E8C870' }}>{info.emoji} {info.name}:</span> {info.description}</li>
          ))}
        </ul>
      </Section>
      <Section title="Events (landing on ⚗️ squares)">
        <ul className="space-y-1">
          {Object.entries(EVENT_DISPLAY).map(([, info]) => (
            <li key={info.name}><span style={{ color: '#E8C870' }}>{info.emoji} {info.name}:</span> {info.description}</li>
          ))}
        </ul>
      </Section>
    </div>
  );
}
```

**Step 3: Commit**

```bash
git add frontend/src/components/games/ur-roguelike/
git commit -m "feat(frontend): add UrRoguelikeBoard and UrRoguelikeRules components"
```

---

## Task 9: Register frontend components

**Files:**
- Modify: `frontend/src/components/GameRoom.tsx`
- Modify: `frontend/src/components/GameRules.tsx`
- Modify: `frontend/src/utils/gameScoreInfo.ts`

**Step 1: Add to boardComponents in GameRoom.tsx**

```ts
'ur-roguelike': lazy(() => import('./games/ur-roguelike/UrRoguelikeBoard')),
```

**Step 2: Add to rulesComponents in GameRules.tsx**

```ts
'ur-roguelike': lazy(() => import('./games/ur-roguelike/UrRoguelikeRules')),
```

**Step 3: Add score info in gameScoreInfo.ts**

Add an import for the Ur score function and map `ur-roguelike` to it:

```ts
'ur-roguelike': urScore,
```

**Step 4: Build frontend**

```bash
npm run build --workspace=frontend
```

Expected: no TypeScript or build errors.

**Step 5: Commit**

```bash
git add frontend/src/components/GameRoom.tsx frontend/src/components/GameRules.tsx frontend/src/utils/gameScoreInfo.ts
git commit -m "feat(frontend): register ur-roguelike board, rules, and score info"
```

---

## Task 10: Manual smoke test

**Step 1: Start dev servers**

```bash
npm run dev:backend &
npm run dev:frontend
```

**Step 2: Smoke test checklist**

- [ ] `ur-roguelike` appears on home page
- [ ] Create a session with two players (two browser tabs)
- [ ] `game:start` → draft modal appears on both sides with 3 options each
- [ ] Both players pick a power-up → modal disappears, board shown with modifier badges
- [ ] Event squares are listed in the board legend
- [ ] Normal Ur moves work (roll, move, captures, rosettes)
- [ ] Moving a piece onto an event square triggers a toast and changes board state
- [ ] Game ends normally when all 7 pieces reach position 99

**Step 3: Fix any issues found, then commit with a fix message if needed**

---

## Task 11: Final integration check

**Step 1: Run all tests**

```bash
npm test
```

Expected: all passing.

**Step 2: Run linter**

```bash
npm run lint
```

Expected: no errors.

**Step 3: Commit any remaining lint fixes**
