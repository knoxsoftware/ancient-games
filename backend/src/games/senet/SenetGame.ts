import { GameEngine } from '../GameEngine';
import { BoardState, Move, Player, PiecePosition } from '@ancient-games/shared';

/**
 * Senet Implementation
 *
 * Board Layout: 30 squares (3 rows x 10 columns)
 * Players start with 5 pieces each on alternating squares (1-10)
 *
 * Path: S-shaped (right on row 1, left on row 2, right on row 3)
 * Positions 0-29:
 *   Row 1: 0-9 (left to right)
 *   Row 2: 19-10 (right to left)
 *   Row 3: 20-29 (left to right)
 *
 * Special squares:
 * - 14: House of Rebirth (pieces knocked off restart here)
 * - 25: House of Beauty (must get exact roll to leave)
 * - 26: House of Water (piece returns to House of Rebirth)
 * - 27-29: Must get exact roll to leave
 *
 * Dice: 4 sticks (flat/round) = 0-5 result
 * - 0 flat = 5, 1 flat = 1, 2 flat = 2, 3 flat = 3, 4 flat = 4
 */
export class SenetGame extends GameEngine {
  gameType = 'senet' as const;
  playerCount = 2;

  private readonly PIECES_PER_PLAYER = 5;
  private readonly BOARD_SIZE = 30;
  private readonly HOUSE_OF_REBIRTH = 14;
  private readonly HOUSE_OF_BEAUTY = 25;
  private readonly HOUSE_OF_WATER = 26;
  private readonly LAST_SQUARES = [27, 28, 29];

  initializeBoard(): BoardState {
    const pieces: PiecePosition[] = [];

    // Players start on alternating squares (0-9)
    // Player 0: 0, 2, 4, 6, 8
    // Player 1: 1, 3, 5, 7, 9
    for (let i = 0; i < this.PIECES_PER_PLAYER; i++) {
      pieces.push({
        playerNumber: 0,
        pieceIndex: i,
        position: i * 2,
      });
      pieces.push({
        playerNumber: 1,
        pieceIndex: i,
        position: i * 2 + 1,
      });
    }

    return {
      pieces,
      currentTurn: Math.floor(Math.random() * 2),
      diceRoll: null,
      lastMove: null,
    };
  }

  rollDice(): number {
    // Four binary sticks: 0 flat sides = 5, otherwise count of flat sides
    let flatSides = 0;
    for (let i = 0; i < 4; i++) {
      flatSides += Math.random() < 0.5 ? 1 : 0;
    }
    return flatSides === 0 ? 5 : flatSides;
  }

  validateMove(board: BoardState, move: Move, player: Player): boolean {
    const { pieceIndex, to } = move;
    const playerNumber = player.playerNumber;

    const piece = board.pieces.find(
      (p) => p.playerNumber === playerNumber && p.pieceIndex === pieceIndex,
    );

    if (!piece) return false;

    const diceRoll = board.diceRoll;
    if (diceRoll === null) return false;

    const from = piece.position;
    const expectedTo = from + diceRoll;

    // Special case: House of Water sends piece back
    if (from === this.HOUSE_OF_WATER) return false;

    // Check if trying to move off the board
    if (expectedTo >= this.BOARD_SIZE) {
      // Can only leave from last 5 squares (25-29) with exact roll
      if (from >= this.HOUSE_OF_BEAUTY && expectedTo === this.BOARD_SIZE) {
        return to === 99;
      }
      return false;
    }

    // Must match expected destination
    if (to !== expectedTo) return false;

    // Cannot land on own piece
    const ownPiece = board.pieces.find((p) => p.playerNumber === playerNumber && p.position === to);
    if (ownPiece) return false;

    // Check if blocked by opponent pieces
    const opponentPiece = board.pieces.find(
      (p) => p.playerNumber !== playerNumber && p.position === to,
    );

    if (opponentPiece) {
      // Can swap if opponent is alone
      return !this.isProtected(board, to, 1 - playerNumber);
    }

    return true;
  }

  applyMove(board: BoardState, move: Move): BoardState {
    const newPieces = [...board.pieces];
    const { to } = move;

    const pieceIndex = newPieces.findIndex(
      (p) => p.playerNumber === board.currentTurn && p.pieceIndex === move.pieceIndex,
    );

    if (pieceIndex === -1) return board;

    const movingPiece = newPieces[pieceIndex];

    // Check for piece swap (attack)
    if (to !== 99) {
      const opponentPieceIndex = newPieces.findIndex(
        (p) => p.playerNumber !== board.currentTurn && p.position === to,
      );

      if (opponentPieceIndex !== -1) {
        // Swap positions
        newPieces[opponentPieceIndex] = {
          ...newPieces[opponentPieceIndex],
          position: movingPiece.position,
        };
      }

      // Special square effects
      if (to === this.HOUSE_OF_WATER) {
        // Piece goes to House of Rebirth
        newPieces[pieceIndex] = {
          ...newPieces[pieceIndex],
          position: this.HOUSE_OF_REBIRTH,
        };
      } else {
        newPieces[pieceIndex] = {
          ...newPieces[pieceIndex],
          position: to,
        };
      }
    } else {
      // Piece finished
      newPieces[pieceIndex] = {
        ...newPieces[pieceIndex],
        position: 99,
      };
    }

    // Extra turn on rolls of 1, 4, or 5
    const extraTurn = board.diceRoll === 1 || board.diceRoll === 4 || board.diceRoll === 5;

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
      const finishedPieces = playerPieces.filter((p) => p.position === 99);

      if (finishedPieces.length === this.PIECES_PER_PLAYER) {
        return playerNumber;
      }
    }
    return null;
  }

  getValidMoves(board: BoardState, playerNumber: number, diceRoll: number): Move[] {
    const moves: Move[] = [];
    const playerPieces = board.pieces.filter(
      (p) => p.playerNumber === playerNumber && p.position !== 99,
    );

    // Sort pieces by position (furthest first - required to move advanced pieces first)
    playerPieces.sort((a, b) => b.position - a.position);

    for (const piece of playerPieces) {
      const from = piece.position;
      const to = from + diceRoll;

      // Check if piece can leave the board
      if (to >= this.BOARD_SIZE) {
        if (from >= this.HOUSE_OF_BEAUTY && to === this.BOARD_SIZE) {
          moves.push({
            playerId: '',
            pieceIndex: piece.pieceIndex,
            from,
            to: 99,
            diceRoll,
          });
        }
        continue;
      }

      // Check if destination is valid
      const ownPiece = board.pieces.find(
        (p) => p.playerNumber === playerNumber && p.position === to,
      );
      if (ownPiece) continue;

      const opponentPiece = board.pieces.find(
        (p) => p.playerNumber !== playerNumber && p.position === to,
      );

      if (opponentPiece && this.isProtected(board, to, 1 - playerNumber)) {
        continue;
      }

      moves.push({
        playerId: '',
        pieceIndex: piece.pieceIndex,
        from,
        to,
        diceRoll,
      });
    }

    return moves;
  }

  canMove(board: BoardState, playerNumber: number, diceRoll: number): boolean {
    return this.getValidMoves(board, playerNumber, diceRoll).length > 0;
  }

  private isProtected(board: BoardState, position: number, playerNumber: number): boolean {
    // A piece is protected if there's another piece of the same player adjacent
    const adjacentPositions = [position - 1, position + 1];

    for (const adjPos of adjacentPositions) {
      if (adjPos < 0 || adjPos >= this.BOARD_SIZE) continue;

      const adjacentPiece = board.pieces.find(
        (p) => p.playerNumber === playerNumber && p.position === adjPos,
      );
      if (adjacentPiece) return true;
    }

    return false;
  }
}
