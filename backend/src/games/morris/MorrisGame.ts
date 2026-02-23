import { GameEngine } from '../GameEngine';
import { BoardState, Move, Player, PiecePosition } from '@ancient-games/shared';

/**
 * Nine Men's Morris (Mills) Implementation
 *
 * Board layout — 24 positions on three concentric squares connected at midpoints:
 *
 *  0 ----------- 1 ----------- 2
 *  |             |             |
 *  |    3 ------ 4 ------ 5   |
 *  |    |        |        |   |
 *  |    |   6 -- 7 -- 8   |   |
 *  |    |   |         |   |   |
 *  9 - 10 - 11      12 - 13 - 14
 *  |    |   |         |   |   |
 *  |    |  15 - 16 - 17   |   |
 *  |    |        |        |   |
 *  |   18 ------ 19 ----- 20  |
 *  |             |             |
 * 21 ---------- 22 ---------- 23
 *
 * diceRoll semantics (repurposed — no actual dice):
 *   null → turn start, auto-roll pending (frontend emits game:roll-dice)
 *   1    → normal move: place (phase 1), slide (phase 2), or fly (phase 3)
 *   2    → mill just formed — current player must remove an opponent piece
 *
 * Phases (per player):
 *   1 = placement: player still has pieces at position -1
 *   2 = movement:  all pieces placed, > 3 on board
 *   3 = flying:    all pieces placed, exactly 3 on board
 */

const ADJACENT: number[][] = [
  /* 0 */ [1, 9],
  /* 1 */ [0, 2, 4],
  /* 2 */ [1, 14],
  /* 3 */ [4, 10],
  /* 4 */ [1, 3, 5, 7],
  /* 5 */ [4, 13],
  /* 6 */ [7, 11],
  /* 7 */ [4, 6, 8],
  /* 8 */ [7, 12],
  /* 9 */ [0, 10, 21],
  /* 10 */ [3, 9, 11, 18],
  /* 11 */ [6, 10, 15],
  /* 12 */ [8, 13, 17],
  /* 13 */ [5, 12, 14, 20],
  /* 14 */ [2, 13, 23],
  /* 15 */ [11, 16],
  /* 16 */ [15, 17, 19],
  /* 17 */ [12, 16],
  /* 18 */ [10, 19],
  /* 19 */ [16, 18, 20, 22],
  /* 20 */ [13, 19],
  /* 21 */ [9, 22],
  /* 22 */ [19, 21, 23],
  /* 23 */ [14, 22],
];

const MILLS: number[][] = [
  // Outer square sides
  [0, 1, 2],
  [2, 14, 23],
  [21, 22, 23],
  [0, 9, 21],
  // Middle square sides
  [3, 4, 5],
  [5, 13, 20],
  [18, 19, 20],
  [3, 10, 18],
  // Inner square sides
  [6, 7, 8],
  [8, 12, 17],
  [15, 16, 17],
  [6, 11, 15],
  // Spokes (midpoint connectors)
  [1, 4, 7],
  [14, 13, 12],
  [22, 19, 16],
  [9, 10, 11],
];

const PIECES_PER_PLAYER = 9;

export class MorrisGame extends GameEngine {
  gameType = 'morris' as const;
  playerCount = 2;

  initializeBoard(): BoardState {
    const pieces: PiecePosition[] = [];
    for (let player = 0; player < 2; player++) {
      for (let i = 0; i < PIECES_PER_PLAYER; i++) {
        pieces.push({ playerNumber: player, pieceIndex: i, position: -1 });
      }
    }
    return { pieces, currentTurn: Math.floor(Math.random() * 2), diceRoll: null, lastMove: null };
  }

  /** No real dice — always returns 1 to trigger a normal move. */
  rollDice(): number {
    return 1;
  }

  private getPhase(board: BoardState, playerNumber: number): 1 | 2 | 3 {
    const unplaced = board.pieces.filter(
      (p) => p.playerNumber === playerNumber && p.position === -1,
    ).length;
    if (unplaced > 0) return 1;
    const onBoard = board.pieces.filter(
      (p) => p.playerNumber === playerNumber && p.position >= 0 && p.position <= 23,
    ).length;
    return onBoard === 3 ? 3 : 2;
  }

  private isInMill(board: BoardState, position: number, playerNumber: number): boolean {
    return MILLS.some(
      (mill) =>
        mill.includes(position) &&
        mill.every((pos) =>
          board.pieces.some((p) => p.playerNumber === playerNumber && p.position === pos),
        ),
    );
  }

  private formsNewMill(board: BoardState, position: number, playerNumber: number): boolean {
    // board.pieces already reflect the new position when this is called
    return this.isInMill(board, position, playerNumber);
  }

  validateMove(board: BoardState, move: Move, player: Player): boolean {
    const { from, to, pieceIndex } = move;
    const playerNumber = player.playerNumber;
    const diceRoll = board.diceRoll;

    if (diceRoll === null) return false;

    if (diceRoll === 2) {
      // Removal: must be to:99, targeting an opponent piece
      if (to !== 99) return false;
      const target = board.pieces.find(
        (p) =>
          p.playerNumber !== playerNumber && p.position === from && p.pieceIndex === pieceIndex,
      );
      if (!target) return false;

      // Piece must not be in a mill, unless ALL opponent pieces are in mills
      if (this.isInMill(board, from, 1 - playerNumber)) {
        const opponentOnBoard = board.pieces.filter(
          (p) => p.playerNumber !== playerNumber && p.position >= 0 && p.position <= 23,
        );
        const allInMills = opponentOnBoard.every((p) =>
          this.isInMill(board, p.position, 1 - playerNumber),
        );
        if (!allInMills) return false;
      }
      return true;
    }

    if (diceRoll !== 1) return false;

    const phase = this.getPhase(board, playerNumber);

    if (phase === 1) {
      // Placement: from must be -1, to must be empty board position
      if (from !== -1) return false;
      const piece = board.pieces.find(
        (p) => p.playerNumber === playerNumber && p.pieceIndex === pieceIndex && p.position === -1,
      );
      if (!piece) return false;
      if (to < 0 || to > 23) return false;
      return !board.pieces.some((p) => p.position === to);
    }

    // Movement / flying: must move an on-board piece to an empty position
    const piece = board.pieces.find(
      (p) => p.playerNumber === playerNumber && p.pieceIndex === pieceIndex && p.position === from,
    );
    if (!piece) return false;
    if (from < 0 || from > 23) return false;
    if (to < 0 || to > 23) return false;
    if (board.pieces.some((p) => p.position === to)) return false;

    if (phase === 2) {
      return ADJACENT[from].includes(to);
    }
    // Phase 3: fly anywhere empty
    return true;
  }

  applyMove(board: BoardState, move: Move): BoardState {
    const newPieces = board.pieces.map((p) => ({ ...p }));
    const { from, to, pieceIndex } = move;
    const playerNumber = board.currentTurn;

    if (board.diceRoll === 2) {
      // Removal move: send opponent piece off the board
      const idx = newPieces.findIndex(
        (p) =>
          p.playerNumber !== playerNumber && p.position === from && p.pieceIndex === pieceIndex,
      );
      if (idx !== -1) newPieces[idx].position = 99;

      return {
        ...board,
        pieces: newPieces,
        currentTurn: (playerNumber + 1) % 2,
        diceRoll: null,
        lastMove: move,
      };
    }

    // Normal move (diceRoll === 1)
    const idx = newPieces.findIndex(
      (p) => p.playerNumber === playerNumber && p.pieceIndex === pieceIndex,
    );
    if (idx === -1) return board;
    newPieces[idx].position = to;

    // Check if the new position forms a mill
    const tempBoard: BoardState = { ...board, pieces: newPieces };
    const millFormed = this.formsNewMill(tempBoard, to, playerNumber);

    if (millFormed) {
      const opponent = (playerNumber + 1) % 2;
      const opponentOnBoard = newPieces.filter(
        (p) => p.playerNumber === opponent && p.position >= 0 && p.position <= 23,
      );
      if (opponentOnBoard.length > 0) {
        // Same player goes again to remove a piece
        return {
          ...board,
          pieces: newPieces,
          currentTurn: playerNumber,
          diceRoll: 2,
          lastMove: move,
        };
      }
    }

    return {
      ...board,
      pieces: newPieces,
      currentTurn: (playerNumber + 1) % 2,
      diceRoll: null,
      lastMove: move,
    };
  }

  checkWinCondition(board: BoardState): number | null {
    // Don't check during a pending removal — the turn isn't over yet
    if (board.diceRoll !== null) return null;

    for (let p = 0; p < 2; p++) {
      const unplaced = board.pieces.filter(
        (piece) => piece.playerNumber === p && piece.position === -1,
      ).length;
      const onBoard = board.pieces.filter(
        (piece) => piece.playerNumber === p && piece.position >= 0 && piece.position <= 23,
      ).length;

      // Win: opponent placed all pieces but has fewer than 3 remaining on board
      if (unplaced === 0 && onBoard < 3) return 1 - p;
    }

    // Win: after placement, current player has no valid moves (they lose)
    const allPlaced = board.pieces.every((p) => p.position !== -1);
    if (allPlaced) {
      const validMoves = this.getValidMoves(board, board.currentTurn, 1);
      if (validMoves.length === 0) return 1 - board.currentTurn;
    }

    return null;
  }

  getValidMoves(board: BoardState, playerNumber: number, diceRoll: number): Move[] {
    if (diceRoll === 2) {
      // Removal: can take any opponent piece not in a mill (or any if all in mills)
      const opponent = (playerNumber + 1) % 2;
      const opponentOnBoard = board.pieces.filter(
        (p) => p.playerNumber === opponent && p.position >= 0 && p.position <= 23,
      );
      const notInMill = opponentOnBoard.filter((p) => !this.isInMill(board, p.position, opponent));
      const removable = notInMill.length > 0 ? notInMill : opponentOnBoard;
      return removable.map((p) => ({
        playerId: '',
        pieceIndex: p.pieceIndex,
        from: p.position,
        to: 99,
      }));
    }

    if (diceRoll !== 1) return [];

    const phase = this.getPhase(board, playerNumber);
    const occupied = new Set(
      board.pieces.filter((p) => p.position >= 0 && p.position <= 23).map((p) => p.position),
    );
    const moves: Move[] = [];

    if (phase === 1) {
      const unplacedPieces = board.pieces.filter(
        (p) => p.playerNumber === playerNumber && p.position === -1,
      );
      for (let pos = 0; pos < 24; pos++) {
        if (occupied.has(pos)) continue;
        for (const piece of unplacedPieces) {
          moves.push({ playerId: '', pieceIndex: piece.pieceIndex, from: -1, to: pos });
        }
      }
    } else if (phase === 2) {
      const onBoard = board.pieces.filter(
        (p) => p.playerNumber === playerNumber && p.position >= 0 && p.position <= 23,
      );
      for (const piece of onBoard) {
        for (const adj of ADJACENT[piece.position]) {
          if (!occupied.has(adj)) {
            moves.push({
              playerId: '',
              pieceIndex: piece.pieceIndex,
              from: piece.position,
              to: adj,
            });
          }
        }
      }
    } else {
      // Phase 3: fly anywhere
      const onBoard = board.pieces.filter(
        (p) => p.playerNumber === playerNumber && p.position >= 0 && p.position <= 23,
      );
      for (let pos = 0; pos < 24; pos++) {
        if (occupied.has(pos)) continue;
        for (const piece of onBoard) {
          moves.push({ playerId: '', pieceIndex: piece.pieceIndex, from: piece.position, to: pos });
        }
      }
    }

    return moves;
  }

  canMove(board: BoardState, playerNumber: number, diceRoll: number): boolean {
    return this.getValidMoves(board, playerNumber, diceRoll).length > 0;
  }

  isCaptureMove(_board: BoardState, _move: Move): boolean {
    return false;
  }
}
