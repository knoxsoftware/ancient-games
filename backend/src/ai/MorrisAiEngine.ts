import { BoardState, Move, BotDifficulty } from '@ancient-games/shared';
import { MorrisGame } from '../games/morris/MorrisGame';

const DEPTH_MAP: Record<BotDifficulty, number> = {
  easy: 1,
  medium: 2,
  hard: 3,
  harder: 4,
  hardest: 5,
};

// All 16 mills as position triples (mirrors MorrisGame.ts)
const MILLS: number[][] = [
  [0, 1, 2],
  [2, 14, 23],
  [21, 22, 23],
  [0, 9, 21],
  [3, 4, 5],
  [5, 13, 20],
  [18, 19, 20],
  [3, 10, 18],
  [6, 7, 8],
  [8, 12, 17],
  [15, 16, 17],
  [6, 11, 15],
  [1, 4, 7],
  [14, 13, 12],
  [22, 19, 16],
  [9, 10, 11],
];

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

export class MorrisAiEngine {
  private game: MorrisGame;

  constructor(game: MorrisGame) {
    this.game = game;
  }

  selectMove(
    board: BoardState,
    playerNumber: number,
    diceRoll: number,
    difficulty: BotDifficulty,
  ): Move {
    const moves = this.game.getValidMoves(board, playerNumber, diceRoll);
    if (moves.length === 0) throw new Error('No valid moves');
    if (moves.length === 1) return moves[0];

    if (difficulty === 'easy' && Math.random() < 0.25) {
      return moves[Math.floor(Math.random() * moves.length)];
    }

    const depth = DEPTH_MAP[difficulty];
    const ordered = this.orderMoves(board, moves, playerNumber);

    let bestMove = ordered[0];
    let bestScore = -Infinity;
    const alpha = -Infinity;
    const beta = Infinity;

    for (const move of ordered) {
      const newBoard = this.game.applyMove(board, move);
      const score = this.minimax(newBoard, depth - 1, alpha, beta, false, playerNumber);
      if (score > bestScore) {
        bestScore = score;
        bestMove = move;
      }
    }

    return bestMove;
  }

  private minimax(
    board: BoardState,
    depth: number,
    alpha: number,
    beta: number,
    isMaximizing: boolean,
    maxPlayer: number,
  ): number {
    const winner = this.game.checkWinCondition(board);
    if (winner !== null) return winner === maxPlayer ? 10000 : -10000;
    if (depth === 0) return this.evaluate(board, maxPlayer);

    const currentPlayer = board.currentTurn;
    const diceRoll = board.diceRoll ?? 1;
    const moves = this.game.getValidMoves(board, currentPlayer, diceRoll);

    if (moves.length === 0) return this.evaluate(board, maxPlayer);

    const ordered = this.orderMoves(board, moves, currentPlayer);

    if (isMaximizing) {
      let best = -Infinity;
      for (const move of ordered) {
        const newBoard = this.game.applyMove(board, move);
        // After applyMove, currentTurn tells us who moves next — if same player (mill formed),
        // they are still the maximizing player
        const nextIsMax = newBoard.currentTurn === maxPlayer;
        const score = this.minimax(newBoard, depth - 1, alpha, beta, nextIsMax, maxPlayer);
        best = Math.max(best, score);
        const newAlpha = Math.max(alpha, best);
        if (beta <= newAlpha) break;
      }
      return best;
    } else {
      let best = Infinity;
      for (const move of ordered) {
        const newBoard = this.game.applyMove(board, move);
        const nextIsMax = newBoard.currentTurn === maxPlayer;
        const score = this.minimax(newBoard, depth - 1, alpha, beta, nextIsMax, maxPlayer);
        best = Math.min(best, score);
        const newBeta = Math.min(beta, best);
        if (newBeta <= alpha) break;
      }
      return best;
    }
  }

  /**
   * Order moves to improve alpha-beta pruning efficiency.
   * For removal moves: prefer pieces in potential mills > high mobility pieces.
   * For placement/movement: prefer mill-forming moves first.
   */
  private orderMoves(board: BoardState, moves: Move[], playerNumber: number): Move[] {
    const scored = moves.map((move) => ({
      move,
      score: this.scoreMoveForOrdering(board, move, playerNumber),
    }));
    scored.sort((a, b) => b.score - a.score);
    return scored.map((s) => s.move);
  }

  private scoreMoveForOrdering(board: BoardState, move: Move, playerNumber: number): number {
    if (move.to === 99) {
      // Removal move: score by how valuable the removed piece is to the opponent
      const opponent = 1 - playerNumber;
      let score = 0;
      // Prefer removing pieces in potential mills
      score += this.potentialMillCount(board, move.from, opponent) * 3;
      // Prefer removing pieces with high mobility (more adjacent empties)
      score += ADJACENT[move.from].filter((pos) => !board.pieces.some((p) => p.position === pos))
        .length;
      return score;
    }

    // Placement/movement: reward mill formation
    const tempPieces = board.pieces.map((p) =>
      p.playerNumber === playerNumber && p.pieceIndex === move.pieceIndex
        ? { ...p, position: move.to }
        : p,
    );
    const tempBoard: BoardState = { ...board, pieces: tempPieces };
    if (this.isInMill(tempBoard, move.to, playerNumber)) return 10;

    // Reward positions that are part of potential mills
    return this.potentialMillCount(board, move.to, playerNumber);
  }

  private evaluate(board: BoardState, playerNumber: number): number {
    const opponent = 1 - playerNumber;
    let score = 0;

    const myOnBoard = board.pieces.filter(
      (p) => p.playerNumber === playerNumber && p.position >= 0 && p.position <= 23,
    );
    const oppOnBoard = board.pieces.filter(
      (p) => p.playerNumber === opponent && p.position >= 0 && p.position <= 23,
    );

    // Piece advantage (most important)
    score += (myOnBoard.length - oppOnBoard.length) * 10;

    // Closed mills
    const myMills = this.countMills(board, playerNumber);
    const oppMills = this.countMills(board, opponent);
    score += (myMills - oppMills) * 8;

    // Potential mills (two pieces in a line, third empty)
    const myPotential = this.totalPotentialMills(board, playerNumber);
    const oppPotential = this.totalPotentialMills(board, opponent);
    score += (myPotential - oppPotential) * 4;

    // Mobility (number of valid moves available)
    const myMoves = this.game.getValidMoves(board, playerNumber, 1).length;
    const oppMoves = this.game.getValidMoves(board, opponent, 1).length;
    score += (myMoves - oppMoves) * 0.5;

    // Unplaced pieces (during placement phase, favour placing sooner)
    const myUnplaced = board.pieces.filter(
      (p) => p.playerNumber === playerNumber && p.position === -1,
    ).length;
    const oppUnplaced = board.pieces.filter(
      (p) => p.playerNumber === opponent && p.position === -1,
    ).length;
    score -= (myUnplaced - oppUnplaced) * 2;

    return score;
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

  private countMills(board: BoardState, playerNumber: number): number {
    return MILLS.filter((mill) =>
      mill.every((pos) =>
        board.pieces.some((p) => p.playerNumber === playerNumber && p.position === pos),
      ),
    ).length;
  }

  /** Count mills where exactly 2 of 3 positions belong to player and 1 is empty. */
  private totalPotentialMills(board: BoardState, playerNumber: number): number {
    return MILLS.filter((mill) => {
      const mine = mill.filter((pos) =>
        board.pieces.some((p) => p.playerNumber === playerNumber && p.position === pos),
      ).length;
      const empty = mill.filter(
        (pos) => !board.pieces.some((p) => p.position === pos && p.position >= 0),
      ).length;
      return mine === 2 && empty === 1;
    }).length;
  }

  private potentialMillCount(board: BoardState, position: number, playerNumber: number): number {
    return MILLS.filter((mill) => {
      if (!mill.includes(position)) return false;
      const others = mill.filter((p) => p !== position);
      const mine = others.filter((pos) =>
        board.pieces.some((p) => p.playerNumber === playerNumber && p.position === pos),
      ).length;
      const empty = others.filter(
        (pos) => !board.pieces.some((p) => p.position === pos && p.position >= 0),
      ).length;
      return mine === 1 && empty === 1;
    }).length;
  }
}
