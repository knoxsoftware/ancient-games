import { GameEngine } from '../GameEngine';
import { BoardState, Move, Player, PiecePosition, GameType } from '@ancient-games/shared';

/**
 * Stellar Siege
 *
 * Board: 6 columns × 6 rows = 36 positions
 * Position encoding: row * 6 + col
 *   Row 0 = top (deep space — alien entry)
 *   Row 5 = bottom (defender's base)
 *   99    = destroyed / shot down
 *
 * Roles (randomized at start):
 *   Defender (1 piece — cannon): always the player with exactly 1 piece
 *   Invaders (6 pieces — aliens): always the player with 6 pieces
 *
 * Defender turn:
 *   Roll 1–4. Move cannon to any column within ±roll of current column (stays in row 5).
 *   Cannon auto-fires: destroys the alien with the highest row (closest to base) in the
 *   destination column. If the column is empty, the cannon just repositions.
 *
 * Invader turn:
 *   Roll 1–4. Pick one alive alien. Move it exactly 1 row down plus sideways by
 *   at most (roll − 1) columns. Aliens may not stack on the same cell.
 *
 * Win conditions:
 *   Defender wins — all 6 aliens destroyed (position 99).
 *   Invaders win  — any alien reaches row 5 (position 30–35).
 */

const COLS = 6;
const ROWS = 6;
const TOTAL = COLS * ROWS; // 36
const ALIEN_COUNT = 6;

function posToRC(pos: number): [number, number] {
  return [Math.floor(pos / COLS), pos % COLS];
}

function rcToPos(row: number, col: number): number {
  return row * COLS + col;
}

function getDefenderPN(pieces: PiecePosition[]): number {
  // Defender has exactly 1 piece (the cannon); invader has 6 (some may be at 99)
  return pieces.filter((p) => p.playerNumber === 0).length === 1 ? 0 : 1;
}

export class StellarSiegeGame extends GameEngine {
  gameType: GameType = 'stellar-siege';
  playerCount = 2;

  initializeBoard(): BoardState {
    const defenderPN = Math.floor(Math.random() * 2);
    const invaderPN = 1 - defenderPN;

    const pieces: PiecePosition[] = [
      // Cannon: starts at row 5, center column (col 3)
      { playerNumber: defenderPN, pieceIndex: 0, position: rcToPos(5, 3) },
      // 6 aliens: start in row 0, one per column
      ...Array.from(
        { length: ALIEN_COUNT },
        (_, i): PiecePosition => ({
          playerNumber: invaderPN,
          pieceIndex: i,
          position: rcToPos(0, i),
        }),
      ),
    ];

    return {
      pieces,
      currentTurn: defenderPN, // Defender always moves first
      diceRoll: null,
      lastMove: null,
    };
  }

  rollDice(): number {
    return Math.floor(Math.random() * 4) + 1; // 1–4
  }

  validateMove(board: BoardState, move: Move, player: Player): boolean {
    const { pieceIndex, from, to } = move;
    const playerNumber = player.playerNumber;
    const defenderPN = getDefenderPN(board.pieces);
    const invaderPN = 1 - defenderPN;

    if (playerNumber !== board.currentTurn) return false;
    if (board.diceRoll === null) return false;
    if (to < 0 || to >= TOTAL) return false;

    const piece = board.pieces.find(
      (p) => p.playerNumber === playerNumber && p.pieceIndex === pieceIndex,
    );
    if (!piece || piece.position !== from) return false;

    if (playerNumber === defenderPN) {
      // Cannon must remain in row 5; move range limited by dice roll
      const [fromRow, fromCol] = posToRC(from);
      const [toRow, toCol] = posToRC(to);
      if (fromRow !== 5 || toRow !== 5) return false;
      if (Math.abs(toCol - fromCol) > board.diceRoll) return false;
      return true;
    } else {
      // Alien must advance exactly 1 row down, sideways ≤ (diceRoll − 1)
      const [fromRow, fromCol] = posToRC(from);
      const [toRow, toCol] = posToRC(to);
      if (toRow !== fromRow + 1) return false;
      if (toCol < 0 || toCol >= COLS) return false;
      if (Math.abs(toCol - fromCol) > board.diceRoll - 1) return false;
      // Cannot stack on another alive alien
      if (board.pieces.some((p) => p.playerNumber === invaderPN && p.position === to)) return false;
      return true;
    }
  }

  applyMove(board: BoardState, move: Move): BoardState {
    const newPieces = board.pieces.map((p) => ({ ...p }));
    const defenderPN = getDefenderPN(board.pieces);
    const invaderPN = 1 - defenderPN;

    if (board.currentTurn === defenderPN) {
      // Move cannon to destination
      const cannon = newPieces.find((p) => p.playerNumber === defenderPN && p.pieceIndex === 0);
      if (!cannon) return board;
      cannon.position = move.to;

      // Auto-fire: destroy the closest alive alien in the destination column
      const [, destCol] = posToRC(move.to);
      let maxRow = -1;
      let targetIdx = -1;
      for (let i = 0; i < newPieces.length; i++) {
        const p = newPieces[i];
        if (p.playerNumber === invaderPN && p.position !== 99) {
          const [r, c] = posToRC(p.position);
          if (c === destCol && r > maxRow) {
            maxRow = r;
            targetIdx = i;
          }
        }
      }
      if (targetIdx !== -1) {
        newPieces[targetIdx] = { ...newPieces[targetIdx], position: 99 };
      }

      return {
        ...board,
        pieces: newPieces,
        currentTurn: invaderPN,
        diceRoll: null,
        lastMove: move,
      };
    } else {
      // Move the selected alien one row down
      const alienIdx = newPieces.findIndex(
        (p) => p.playerNumber === invaderPN && p.pieceIndex === move.pieceIndex,
      );
      if (alienIdx === -1) return board;
      newPieces[alienIdx] = { ...newPieces[alienIdx], position: move.to };

      return {
        ...board,
        pieces: newPieces,
        currentTurn: defenderPN,
        diceRoll: null,
        lastMove: move,
      };
    }
  }

  checkWinCondition(board: BoardState): number | null {
    const defenderPN = getDefenderPN(board.pieces);
    const invaderPN = 1 - defenderPN;

    // Invaders win if any alien has reached row 5
    const invaded = board.pieces.some(
      (p) => p.playerNumber === invaderPN && p.position !== 99 && posToRC(p.position)[0] >= 5,
    );
    if (invaded) return invaderPN;

    // Defender wins if all aliens are destroyed
    const allDestroyed = board.pieces
      .filter((p) => p.playerNumber === invaderPN)
      .every((p) => p.position === 99);
    if (allDestroyed) return defenderPN;

    return null;
  }

  getValidMoves(board: BoardState, playerNumber: number, diceRoll: number): Move[] {
    const moves: Move[] = [];
    const defenderPN = getDefenderPN(board.pieces);
    const invaderPN = 1 - defenderPN;

    if (playerNumber === defenderPN) {
      const cannon = board.pieces.find((p) => p.playerNumber === defenderPN && p.pieceIndex === 0);
      if (!cannon) return [];
      const [, fromCol] = posToRC(cannon.position);
      for (let newCol = 0; newCol < COLS; newCol++) {
        if (Math.abs(newCol - fromCol) <= diceRoll) {
          moves.push({
            playerId: '',
            pieceIndex: 0,
            from: cannon.position,
            to: rcToPos(5, newCol),
            diceRoll,
          });
        }
      }
    } else {
      const aliveAliens = board.pieces.filter(
        (p) => p.playerNumber === invaderPN && p.position !== 99,
      );
      for (const alien of aliveAliens) {
        const [fromRow, fromCol] = posToRC(alien.position);
        const newRow = fromRow + 1;
        if (newRow >= ROWS) continue; // alien at/past base row — game should already be over
        for (let dc = -(diceRoll - 1); dc <= diceRoll - 1; dc++) {
          const newCol = fromCol + dc;
          if (newCol < 0 || newCol >= COLS) continue;
          const to = rcToPos(newRow, newCol);
          if (board.pieces.some((p) => p.playerNumber === invaderPN && p.position === to)) continue;
          moves.push({
            playerId: '',
            pieceIndex: alien.pieceIndex,
            from: alien.position,
            to,
            diceRoll,
          });
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
