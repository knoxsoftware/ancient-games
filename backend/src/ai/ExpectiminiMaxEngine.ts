import { BoardState, Move, BotDifficulty } from '@ancient-games/shared';
import { UrGame } from '../games/ur/UrGame';

const UR_DICE_PROBS: number[] = [1 / 16, 4 / 16, 6 / 16, 4 / 16, 1 / 16];

const ROSETTES = new Set([2, 6, 13]);
const SHARED_START = 4;
const SHARED_END = 11;

const DEPTH_MAP: Record<BotDifficulty, number> = {
  easy: 1,
  medium: 2,
  hard: 3,
  harder: 4,
  hardest: 5,
};

export class ExpectiminiMaxEngine {
  private game: UrGame;

  constructor(game: UrGame) {
    this.game = game;
  }

  selectMove(board: BoardState, playerNumber: number, diceRoll: number, difficulty: BotDifficulty): Move {
    const moves = this.game.getValidMoves(board, playerNumber, diceRoll);
    if (moves.length === 0) throw new Error('No valid moves');
    if (moves.length === 1) return moves[0];

    // Easy: 20% random
    if (difficulty === 'easy' && Math.random() < 0.2) {
      return moves[Math.floor(Math.random() * moves.length)];
    }

    const depth = DEPTH_MAP[difficulty];
    let bestMove = moves[0];
    let bestScore = -Infinity;

    for (const move of moves) {
      const newBoard = this.game.applyMove(board, move);
      const score = this.expectiminimax(newBoard, depth - 1, playerNumber, true);
      if (score > bestScore) {
        bestScore = score;
        bestMove = move;
      }
    }

    return bestMove;
  }

  private expectiminimax(
    board: BoardState,
    depth: number,
    maxPlayer: number,
    isChance: boolean,
  ): number {
    const winner = this.game.checkWinCondition(board);
    if (winner !== null) return winner === maxPlayer ? 1000 : -1000;
    if (depth === 0) return this.evaluate(board, maxPlayer);

    if (isChance) {
      // Chance node: weight over all dice outcomes
      let expected = 0;
      for (let roll = 0; roll <= 4; roll++) {
        const prob = UR_DICE_PROBS[roll];
        if (roll === 0) {
          // Turn passes, no moves
          const nextPlayer = (board.currentTurn + 1) % 2;
          const nextBoard: BoardState = { ...board, currentTurn: nextPlayer, diceRoll: null };
          expected += prob * this.expectiminimax(nextBoard, depth - 1, maxPlayer, true);
          continue;
        }
        const boardWithRoll: BoardState = { ...board, diceRoll: roll };
        const moves = this.game.getValidMoves(boardWithRoll, board.currentTurn, roll);
        if (moves.length === 0) {
          const nextPlayer = (board.currentTurn + 1) % 2;
          const nextBoard: BoardState = { ...board, currentTurn: nextPlayer, diceRoll: null };
          expected += prob * this.expectiminimax(nextBoard, depth - 1, maxPlayer, true);
        } else {
          expected += prob * this.expectiminimax(boardWithRoll, depth - 1, maxPlayer, false);
        }
      }
      return expected;
    }

    // Max or Min node
    const isMax = board.currentTurn === maxPlayer;
    const diceRoll = board.diceRoll!;
    const moves = this.game.getValidMoves(board, board.currentTurn, diceRoll);

    if (moves.length === 0) return this.evaluate(board, maxPlayer);

    let best = isMax ? -Infinity : Infinity;
    for (const move of moves) {
      const newBoard = this.game.applyMove(board, move);
      const score = this.expectiminimax(newBoard, depth - 1, maxPlayer, true);
      best = isMax ? Math.max(best, score) : Math.min(best, score);
    }
    return best;
  }

  private evaluate(board: BoardState, playerNumber: number): number {
    let score = 0;
    for (const piece of board.pieces) {
      const isOwn = piece.playerNumber === playerNumber;
      const pos = piece.position;
      const sign = isOwn ? 1 : -1;

      if (pos === -1) continue; // off board: 0
      if (pos === 99) {
        score += sign * 15;
        continue;
      } // finished

      score += sign * (pos + 1); // advancement

      if (ROSETTES.has(pos)) score += sign * 1.5; // rosette bonus
      else if (pos >= SHARED_START && pos <= SHARED_END) {
        if (!isOwn) score += 0.5; // opponent exposed to capture
        else score -= 0.5; // own piece at capture risk
      }
    }
    return score;
  }
}
