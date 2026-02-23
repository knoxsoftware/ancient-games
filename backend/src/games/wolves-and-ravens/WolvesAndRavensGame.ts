import { GameEngine } from '../GameEngine';
import { BoardState, Move, Player, PiecePosition, GameType } from '@ancient-games/shared';

const BOARD_SIZE = 7;
const TOTAL_CELLS = BOARD_SIZE * BOARD_SIZE; // 49
const WOLF_WIN_CAPTURES = 5; // wolf must capture this many ravens to win

// Raven starting positions: 4 corners + 4 mid-edges
const RAVEN_STARTS = [0, 3, 6, 21, 27, 42, 45, 48];
const WOLF_START = 24; // center

const DIRECTIONS: [number, number][] = [
  [-1, 0],
  [1, 0],
  [0, -1],
  [0, 1], // orthogonal
  [-1, -1],
  [-1, 1],
  [1, -1],
  [1, 1], // diagonal
];

function posToRC(pos: number): [number, number] {
  return [Math.floor(pos / BOARD_SIZE), pos % BOARD_SIZE];
}

function rcToPos(row: number, col: number): number {
  return row * BOARD_SIZE + col;
}

export class WolvesAndRavensGame extends GameEngine {
  gameType: GameType = 'wolves-and-ravens';
  playerCount = 2;

  // Wolf is always the player whose total piece count is 1 (wolf = 1 piece, ravens = 8 pieces)
  private getWolfPN(pieces: PiecePosition[]): number {
    return pieces.filter((p) => p.playerNumber === 0).length === 1 ? 0 : 1;
  }

  initializeBoard(): BoardState {
    const wolfPN = Math.floor(Math.random() * 2);
    const ravenPN = 1 - wolfPN;

    const pieces: PiecePosition[] = [
      { playerNumber: wolfPN, pieceIndex: 0, position: WOLF_START },
      ...RAVEN_STARTS.map((pos, i) => ({
        playerNumber: ravenPN,
        pieceIndex: i,
        position: pos,
      })),
    ];

    return {
      pieces,
      currentTurn: wolfPN, // wolf always moves first
      diceRoll: null,
      lastMove: null,
    };
  }

  rollDice(): number {
    return Math.floor(Math.random() * 6) + 1;
  }

  validateMove(board: BoardState, move: Move, player: Player): boolean {
    const { pieceIndex, from, to } = move;
    const playerNumber = player.playerNumber;
    const wolfPN = this.getWolfPN(board.pieces);

    if (playerNumber !== board.currentTurn) return false;
    if (board.diceRoll === null) return false;
    if (to < 0 || to >= TOTAL_CELLS) return false;

    const piece = board.pieces.find(
      (p) => p.playerNumber === playerNumber && p.pieceIndex === pieceIndex,
    );
    if (!piece || piece.position !== from) return false;

    const [fromRow, fromCol] = posToRC(from);
    const [toRow, toCol] = posToRC(to);

    if (playerNumber === wolfPN) {
      // Wolf: straight line up to diceRoll squares, cannot jump pieces
      const dr = toRow - fromRow;
      const dc = toCol - fromCol;
      if (dr === 0 && dc === 0) return false;
      // Must be orthogonal or diagonal
      if (dr !== 0 && dc !== 0 && Math.abs(dr) !== Math.abs(dc)) return false;

      const dist = Math.max(Math.abs(dr), Math.abs(dc));
      if (dist > board.diceRoll) return false;

      const stepRow = dr === 0 ? 0 : dr / Math.abs(dr);
      const stepCol = dc === 0 ? 0 : dc / Math.abs(dc);

      // No piece may block intermediate squares
      for (let step = 1; step < dist; step++) {
        const intermediate = rcToPos(fromRow + step * stepRow, fromCol + step * stepCol);
        if (board.pieces.some((p) => p.position === intermediate)) return false;
      }

      // Cannot land on own piece (only one wolf, but guard anyway)
      if (board.pieces.some((p) => p.playerNumber === wolfPN && p.position === to)) return false;

      return true;
    } else {
      // Ravens: exactly 1 step in any direction, diceRoll tracks remaining moves
      if (board.diceRoll <= 0) return false;

      if (Math.max(Math.abs(toRow - fromRow), Math.abs(toCol - fromCol)) !== 1) return false;

      // Cannot land on wolf or another raven
      if (board.pieces.some((p) => p.position === to)) return false;

      return true;
    }
  }

  applyMove(board: BoardState, move: Move): BoardState {
    const newPieces = board.pieces.map((p) => ({ ...p }));
    const wolfPN = this.getWolfPN(board.pieces);
    const ravenPN = 1 - wolfPN;

    const movingPiece = newPieces.find(
      (p) => p.playerNumber === board.currentTurn && p.pieceIndex === move.pieceIndex,
    );
    if (!movingPiece) return board;

    if (board.currentTurn === wolfPN) {
      // Wolf: capture raven if landing on one
      const capturedRaven = newPieces.find(
        (p) => p.playerNumber === ravenPN && p.position === move.to,
      );
      if (capturedRaven) capturedRaven.position = 99;

      movingPiece.position = move.to;

      return { pieces: newPieces, currentTurn: ravenPN, diceRoll: null, lastMove: move };
    } else {
      // Raven: decrement remaining moves counter
      movingPiece.position = move.to;
      const remaining = (board.diceRoll ?? 1) - 1;

      if (remaining <= 0) {
        return { pieces: newPieces, currentTurn: wolfPN, diceRoll: null, lastMove: move };
      }
      return { pieces: newPieces, currentTurn: ravenPN, diceRoll: remaining, lastMove: move };
    }
  }

  checkWinCondition(board: BoardState): number | null {
    const wolfPN = this.getWolfPN(board.pieces);
    const ravenPN = 1 - wolfPN;

    // Wolf wins: captures 5 ravens
    const captured = board.pieces.filter(
      (p) => p.playerNumber === ravenPN && p.position === 99,
    ).length;
    if (captured >= WOLF_WIN_CAPTURES) return wolfPN;

    // Ravens win: all orthogonal neighbors of wolf are occupied by ravens
    const wolf = board.pieces.find((p) => p.playerNumber === wolfPN);
    if (!wolf) return ravenPN;

    const [wr, wc] = posToRC(wolf.position);
    const neighbors: number[] = [];
    if (wr > 0) neighbors.push(rcToPos(wr - 1, wc));
    if (wr < BOARD_SIZE - 1) neighbors.push(rcToPos(wr + 1, wc));
    if (wc > 0) neighbors.push(rcToPos(wr, wc - 1));
    if (wc < BOARD_SIZE - 1) neighbors.push(rcToPos(wr, wc + 1));

    if (neighbors.length === 0) return null;

    const surrounded = neighbors.every((pos) =>
      board.pieces.some((p) => p.playerNumber === ravenPN && p.position === pos),
    );
    if (surrounded) return ravenPN;

    return null;
  }

  getValidMoves(board: BoardState, playerNumber: number, diceRoll: number): Move[] {
    const moves: Move[] = [];
    const wolfPN = this.getWolfPN(board.pieces);
    const ravenPN = 1 - wolfPN;

    if (playerNumber === wolfPN) {
      const wolf = board.pieces.find((p) => p.playerNumber === wolfPN);
      if (!wolf) return [];

      const [wr, wc] = posToRC(wolf.position);

      for (const [dr, dc] of DIRECTIONS) {
        for (let dist = 1; dist <= diceRoll; dist++) {
          const toRow = wr + dr * dist;
          const toCol = wc + dc * dist;
          if (toRow < 0 || toRow >= BOARD_SIZE || toCol < 0 || toCol >= BOARD_SIZE) break;

          const to = rcToPos(toRow, toCol);

          let blocked = false;
          for (let step = 1; step < dist; step++) {
            const inter = rcToPos(wr + dr * step, wc + dc * step);
            if (board.pieces.some((p) => p.position === inter)) {
              blocked = true;
              break;
            }
          }
          if (blocked) break;

          if (!board.pieces.some((p) => p.playerNumber === wolfPN && p.position === to)) {
            moves.push({ playerId: '', pieceIndex: 0, from: wolf.position, to, diceRoll });
          }
        }
      }
    } else {
      const aliveRavens = board.pieces.filter(
        (p) => p.playerNumber === ravenPN && p.position >= 0 && p.position < TOTAL_CELLS,
      );

      for (const raven of aliveRavens) {
        const [fr, fc] = posToRC(raven.position);
        for (const [dr, dc] of DIRECTIONS) {
          const toRow = fr + dr;
          const toCol = fc + dc;
          if (toRow < 0 || toRow >= BOARD_SIZE || toCol < 0 || toCol >= BOARD_SIZE) continue;
          const to = rcToPos(toRow, toCol);
          if (board.pieces.some((p) => p.position === to)) continue;
          moves.push({
            playerId: '',
            pieceIndex: raven.pieceIndex,
            from: raven.position,
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

  isCaptureMove(board: BoardState, move: Move): boolean {
    const wolfPN = this.getWolfPN(board.pieces);
    if (board.currentTurn !== wolfPN) return false;
    return board.pieces.some(
      p => p.playerNumber !== wolfPN && p.position === move.to
    );
  }
}
