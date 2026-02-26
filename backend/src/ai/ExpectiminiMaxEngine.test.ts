import { describe, it, expect } from 'vitest';
import { ExpectiminiMaxEngine } from './ExpectiminiMaxEngine';
import { UrGame } from '../games/ur/UrGame';
import { BoardState } from '@ancient-games/shared';

const game = new UrGame();
const engine = new ExpectiminiMaxEngine(game);

describe('ExpectiminiMaxEngine', () => {
  it('returns a valid move from getValidMoves', () => {
    const board = game.initializeBoard();
    const testBoard = { ...board, diceRoll: 2, currentTurn: 0 };
    const moves = game.getValidMoves(testBoard, 0, 2);
    if (moves.length === 0) return;

    const selected = engine.selectMove(testBoard, 0, 2, 'medium');
    expect(moves.some((m) => m.pieceIndex === selected.pieceIndex && m.to === selected.to)).toBe(true);
  });

  it('prefers a finishing move when available', () => {
    // Piece at position 13 (last position), dice roll 1 → to=99
    const pieces = [
      { playerNumber: 0, pieceIndex: 0, position: 13 },
      ...Array.from({ length: 6 }, (_, i) => ({ playerNumber: 0, pieceIndex: i + 1, position: 99 })),
      ...Array.from({ length: 7 }, (_, i) => ({ playerNumber: 1, pieceIndex: i, position: 99 })),
    ];
    const board: BoardState = { pieces, currentTurn: 0, diceRoll: 1, lastMove: null };
    const selected = engine.selectMove(board, 0, 1, 'hard');
    expect(selected.to).toBe(99);
  });
});
