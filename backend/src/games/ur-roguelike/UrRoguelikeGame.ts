import { UrGame } from '../ur/UrGame';
import { BoardState, Move, Player, Modifier } from '@ancient-games/shared';

// ── Power-up pool (draft) ──────────────────────────────────────────────────

export const POWER_UPS: Record<string, { name: string; description: string }> = {
  double_roll: { name: 'Loaded Dice', description: 'Once: roll twice, take the higher result' },
  ghost_piece: { name: 'Ghost Piece', description: 'Your first-moved piece is immune to capture' },
  safe_passage: { name: 'Ward', description: 'Your pieces cannot be captured — 3 uses' },
  reroll: { name: 'Fickle Fate', description: 'Once: reroll after seeing your dice result' },
  extra_move: { name: 'Surge', description: 'Once: move a second piece with the same roll' },
  slow_curse: { name: 'Hex', description: "Once: skip your opponent's next turn" },
};

export const POWER_UP_IDS = Object.keys(POWER_UPS);

// ── Event pool (landing triggers) ─────────────────────────────────────────

export const EVENTS: Record<string, { name: string; description: string }> = {
  board_flip: { name: 'Reversal', description: 'Move any one of your pieces backward by 1' },
  piece_swap: { name: 'Transposition', description: "Swap one of your pieces with one of your opponent's" },
  opponent_setback: { name: 'Stumble', description: "Send opponent's most-advanced piece back 2 squares" },
  extra_turn: { name: 'Fortune', description: 'Take an extra turn immediately' },
  rosette_shift: { name: 'Shifting Stars', description: 'A random shared square becomes a rosette' },
  dice_curse: { name: 'Loaded Against', description: "Opponent's next roll is halved" },
  free_entry: { name: 'Rush', description: 'Place one off-board piece at position 0 immediately' },
  barrier: { name: 'Blockade', description: 'A random shared square is impassable for 3 turns' },
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
  override gameType = 'ur-roguelike' as unknown as 'ur';

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

  // ── getRosettes: include extraRosettes from board state ───────────────

  protected override getRosettes(board: BoardState): number[] {
    return [...this.BASE_ROSETTE_POSITIONS, ...(board.extraRosettes ?? [])];
  }

  // ── Dice roll (respects double_roll modifier) ──────────────────────────

  rollDice(): number {
    return super.rollDice();
  }

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
        const ROSETTES = new Set([2, 6, 13]);
        const eventSquares = new Set(board.eventSquares ?? []);
        const candidates = [4, 5, 7, 8, 9, 10, 11].filter((p) => !ROSETTES.has(p) && !eventSquares.has(p));
        if (candidates.length === 0) return { board };
        const newRosette = candidates[Math.floor(Math.random() * candidates.length)];
        const extraRosettes = [...(board.extraRosettes ?? []), newRosette];
        return { board: { ...board, extraRosettes } };
      }

      case 'dice_curse':
        return {
          board: {
            ...board,
            skipNextTurn: null,
            extraTurnFor: null,
            modifiers: [...(board.modifiers ?? []), { id: 'dice_curse_active', owner: opponent, remainingUses: 1 }],
          },
        };

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
    const safeMod = (board.modifiers ?? []).find(
      (m) => m.id === 'safe_passage' && m.owner === playerNumber && (m.remainingUses ?? 0) > 0,
    );
    if (!safeMod) return true;

    const targetPiece = board.pieces.find((p) => p.playerNumber === playerNumber && p.position === to);
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
    return super.getValidMoves(board, playerNumber, diceRoll).filter((m) => !barriers.has(m.to));
  }
}
