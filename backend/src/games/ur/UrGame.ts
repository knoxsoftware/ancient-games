import { GameEngine } from '../GameEngine';
import { BoardState, Move, Player, PiecePosition } from '@ancient-games/shared';

/**
 * Royal Game of Ur Implementation
 *
 * Board Layout (actual historical shape):
 *
 * Visual representation:
 *        [P1-0][P1-1][P1-2*][P1-3]        [P1-8*][P1-9]
 *        [S-0 ][S-1 ][S-2* ][S-3 ][S-4][S-5][S-6 ][S-7 ]
 *        [P0-0*][P0-1][P0-2][P0-3]        [P0-8 ][P0-9]
 *
 * Position encoding (0-13 per player):
 * - 0-3: Player's private start lane (4 squares)
 * - 4-11: Shared middle section (8 squares)
 * - 12-13: Player's private end lane (2 squares)
 * - -1: Not yet entered
 * - 99: Finished/off board
 *
 * Rosettes (*) give extra turn and are safe:
 * - Position 2 in private lanes (P0-2, P1-2)
 * - Position 6 in shared lane (S-2)
 * - Position 12 in end lanes (P0-8, P1-8)
 */
export class UrGame extends GameEngine {
  gameType = 'ur' as const;
  playerCount = 2;

  private readonly PIECES_PER_PLAYER = 7;
  private readonly PATH_LENGTH = 14; // 4 private + 8 shared + 2 private
  private readonly ROSETTE_POSITIONS = [2, 6, 13]; // Positions with rosettes
  private readonly SHARED_START = 4;
  private readonly SHARED_END = 11;

  initializeBoard(): BoardState {
    const pieces: PiecePosition[] = [];

    // Initialize all pieces off the board
    for (let player = 0; player < 2; player++) {
      for (let i = 0; i < this.PIECES_PER_PLAYER; i++) {
        pieces.push({
          playerNumber: player,
          pieceIndex: i,
          position: -1, // Off board
        });
      }
    }

    return {
      pieces,
      currentTurn: Math.floor(Math.random() * 2),
      diceRoll: null,
      lastMove: null,
    };
  }

  rollDice(): number {
    // Four binary dice (pyramid-shaped): 0-4 result
    let sum = 0;
    for (let i = 0; i < 4; i++) {
      sum += Math.random() < 0.5 ? 1 : 0;
    }
    return sum;
  }

  validateMove(board: BoardState, move: Move, player: Player): boolean {
    const { pieceIndex, to } = move;
    const playerNumber = player.playerNumber;

    // Find the piece
    const piece = board.pieces.find(
      (p) => p.playerNumber === playerNumber && p.pieceIndex === pieceIndex,
    );

    if (!piece) return false;

    const diceRoll = board.diceRoll;
    if (diceRoll === null || diceRoll === 0) return false;

    // Calculate expected destination
    const from = piece.position;
    const expectedTo = from === -1 ? diceRoll - 1 : from + diceRoll;

    // Check if destination matches
    if (to !== expectedTo && to !== 99) return false;

    // If piece is off board, can only enter if destination is valid
    if (from === -1) {
      if (to >= this.PATH_LENGTH) return false;
      return this.isPositionAvailableForPlayer(board, to, playerNumber);
    }

    // Exact roll required to exit the board
    if (from + diceRoll >= this.PATH_LENGTH) {
      return from + diceRoll === this.PATH_LENGTH && to === 99;
    }

    // Normal move - check if destination is available
    return this.isPositionAvailableForPlayer(board, to, playerNumber);
  }

  applyMove(board: BoardState, move: Move): BoardState {
    const newPieces = [...board.pieces];
    const movingPiece = newPieces.find(
      (p) => p.playerNumber === board.currentTurn && p.pieceIndex === move.pieceIndex,
    );

    if (!movingPiece) return board;

    const { to } = move;

    // Check if capturing an opponent piece (only in shared section, not on rosette)
    if (to !== 99 && this.isSharedPosition(to) && !this.ROSETTE_POSITIONS.includes(to)) {
      const capturedPieceIndex = newPieces.findIndex(
        (p) => p.playerNumber !== board.currentTurn && p.position === to,
      );

      if (capturedPieceIndex !== -1) {
        // Send captured piece back to start
        newPieces[capturedPieceIndex] = {
          ...newPieces[capturedPieceIndex],
          position: -1,
        };
      }
    }

    // Move the piece
    const pieceIndex = newPieces.findIndex(
      (p) => p.playerNumber === board.currentTurn && p.pieceIndex === move.pieceIndex,
    );
    newPieces[pieceIndex] = {
      ...newPieces[pieceIndex],
      position: to,
    };

    // Check if landed on rosette (extra turn)
    const isRosette = to !== 99 && this.ROSETTE_POSITIONS.includes(to);

    return {
      ...board,
      pieces: newPieces,
      currentTurn: isRosette ? board.currentTurn : (board.currentTurn + 1) % 2,
      diceRoll: null,
      lastMove: move,
    };
  }

  checkWinCondition(board: BoardState): number | null {
    for (let playerNumber = 0; playerNumber < 2; playerNumber++) {
      const playerPieces = board.pieces.filter((p) => p.playerNumber === playerNumber);
      const finishedPieces = playerPieces.filter((p) => p.position === 99);

      if (finishedPieces.length === this.PIECES_PER_PLAYER) {
        return playerNumber;
      }
    }
    return null;
  }

  getValidMoves(board: BoardState, playerNumber: number, diceRoll: number): Move[] {
    if (diceRoll === 0) return [];

    const moves: Move[] = [];
    const playerPieces = board.pieces.filter((p) => p.playerNumber === playerNumber);

    for (const piece of playerPieces) {
      if (piece.position === 99) continue; // Already finished

      const from = piece.position;
      const to = from === -1 ? diceRoll - 1 : from + diceRoll;

      // Check if piece can finish (exact roll required)
      if (from !== -1 && from + diceRoll >= this.PATH_LENGTH) {
        if (from + diceRoll === this.PATH_LENGTH) {
          moves.push({
            playerId: '', // Will be set by caller
            pieceIndex: piece.pieceIndex,
            from,
            to: 99,
            diceRoll,
          });
        }
        continue;
      }

      // Check if destination is valid
      if (to < this.PATH_LENGTH && this.isPositionAvailableForPlayer(board, to, playerNumber)) {
        moves.push({
          playerId: '',
          pieceIndex: piece.pieceIndex,
          from,
          to,
          diceRoll,
        });
      }
    }

    return moves;
  }

  canMove(board: BoardState, playerNumber: number, diceRoll: number): boolean {
    return this.getValidMoves(board, playerNumber, diceRoll).length > 0;
  }

  private isSharedPosition(position: number): boolean {
    return position >= this.SHARED_START && position <= this.SHARED_END;
  }

  private isPositionAvailableForPlayer(
    board: BoardState,
    position: number,
    playerNumber: number,
  ): boolean {
    // Check if any piece of the same player occupies this position
    const ownPiece = board.pieces.find(
      (p) => p.playerNumber === playerNumber && p.position === position,
    );
    if (ownPiece) return false;

    // In shared section
    if (this.isSharedPosition(position)) {
      const opponentPiece = board.pieces.find(
        (p) => p.playerNumber !== playerNumber && p.position === position,
      );

      // Rosettes are safe from capture
      if (opponentPiece && this.ROSETTE_POSITIONS.includes(position)) {
        return false;
      }

      // Can capture opponent piece (if not on rosette)
      return true;
    }

    // Private sections - no opponent pieces should be here
    return true;
  }
}
