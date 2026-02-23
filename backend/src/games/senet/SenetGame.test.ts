import { describe, it, expect } from 'vitest';
import { SenetGame } from './SenetGame';
import { Move, Player } from '@ancient-games/shared';

const game = new SenetGame();

function makePlayer(playerNumber: number): Player {
  return { id: 'p', displayName: 'P', socketId: 's', ready: true, playerNumber, status: 'active' };
}

describe('SenetGame', () => {
  describe('initializeBoard', () => {
    it('creates 10 pieces (5 per player) on alternating squares', () => {
      const board = game.initializeBoard();
      expect(board.pieces).toHaveLength(10);
      const p0 = board.pieces.filter((p) => p.playerNumber === 0);
      const p1 = board.pieces.filter((p) => p.playerNumber === 1);
      expect(p0).toHaveLength(5);
      expect(p1).toHaveLength(5);
      expect(p0.map((p) => p.position)).toEqual([0, 2, 4, 6, 8]);
      expect(p1.map((p) => p.position)).toEqual([1, 3, 5, 7, 9]);
    });

    it('starts with null diceRoll', () => {
      expect(game.initializeBoard().diceRoll).toBeNull();
    });
  });

  describe('rollDice', () => {
    it('returns values 1-5', () => {
      const results = new Set<number>();
      for (let i = 0; i < 200; i++) results.add(game.rollDice());
      expect(Math.min(...results)).toBeGreaterThanOrEqual(1);
      expect(Math.max(...results)).toBeLessThanOrEqual(5);
    });
  });

  describe('validateMove', () => {
    it('rejects move when diceRoll is null', () => {
      const board = game.initializeBoard();
      board.currentTurn = 0;
      const move: Move = { playerId: '', pieceIndex: 0, from: 0, to: 1 };
      expect(game.validateMove(board, move, makePlayer(0))).toBe(false);
    });

    it('allows valid forward move', () => {
      const board = game.initializeBoard();
      board.currentTurn = 0;
      board.diceRoll = 3;
      // p0 piece 0 at pos 0 -> to pos 3 (occupied by p1) - check if protected
      // p1 has pieces at 3 and 5, so pos 3 is adjacent to pos 2 (not p1) but adjacent to pos 4 (not p1)
      // Actually p1 piece at 3 is adjacent to p1 piece at... let's check: 3-1=2(p0), 3+1=4(p0). Not protected.
      const move: Move = { playerId: '', pieceIndex: 0, from: 0, to: 3 };
      expect(game.validateMove(board, move, makePlayer(0))).toBe(true);
    });

    it('rejects landing on own piece', () => {
      const board = game.initializeBoard();
      board.currentTurn = 0;
      board.diceRoll = 2;
      // p0 piece 0 at pos 0 moving to pos 2 (own piece)
      const move: Move = { playerId: '', pieceIndex: 0, from: 0, to: 2 };
      expect(game.validateMove(board, move, makePlayer(0))).toBe(false);
    });
  });

  describe('applyMove', () => {
    it('moves piece and clears diceRoll', () => {
      const board = game.initializeBoard();
      board.currentTurn = 0;
      board.diceRoll = 3;
      const move: Move = { playerId: '', pieceIndex: 0, from: 0, to: 3 };
      const result = game.applyMove(board, move);
      const piece = result.pieces.find((p) => p.playerNumber === 0 && p.pieceIndex === 0)!;
      expect(piece.position).toBe(3);
      expect(result.diceRoll).toBeNull();
    });

    it('swaps with opponent piece when landing on unprotected opponent', () => {
      const board = game.initializeBoard();
      board.currentTurn = 0;
      board.diceRoll = 3;
      const move: Move = { playerId: '', pieceIndex: 0, from: 0, to: 3 };
      const result = game.applyMove(board, move);
      // p1 piece that was at 3 should now be at 0
      const swapped = result.pieces.find((p) => p.playerNumber === 1 && p.pieceIndex === 1)!;
      expect(swapped.position).toBe(0);
    });

    it('grants extra turn on rolls of 1, 4, or 5', () => {
      const board = game.initializeBoard();
      board.currentTurn = 0;
      board.diceRoll = 1;
      const move: Move = { playerId: '', pieceIndex: 0, from: 0, to: 1 };
      const result = game.applyMove(board, move);
      expect(result.currentTurn).toBe(0); // extra turn
    });

    it('switches turn on rolls of 2 or 3', () => {
      const board = game.initializeBoard();
      board.currentTurn = 0;
      board.diceRoll = 3;
      const move: Move = { playerId: '', pieceIndex: 0, from: 0, to: 3 };
      const result = game.applyMove(board, move);
      expect(result.currentTurn).toBe(1);
    });

    it('sends piece to House of Rebirth when landing on House of Water', () => {
      const board = game.initializeBoard();
      board.currentTurn = 0;
      board.diceRoll = 2;
      // Clear pos 26 and set up a piece at 24
      board.pieces[0].position = 24;
      const move: Move = { playerId: '', pieceIndex: 0, from: 24, to: 26 };
      const result = game.applyMove(board, move);
      const piece = result.pieces.find((p) => p.playerNumber === 0 && p.pieceIndex === 0)!;
      expect(piece.position).toBe(14); // House of Rebirth
    });
  });

  describe('checkWinCondition', () => {
    it('returns null at game start', () => {
      expect(game.checkWinCondition(game.initializeBoard())).toBeNull();
    });

    it('returns winner when all 5 pieces finished', () => {
      const board = game.initializeBoard();
      board.pieces.filter((p) => p.playerNumber === 1).forEach((p) => (p.position = 99));
      expect(game.checkWinCondition(board)).toBe(1);
    });
  });

  describe('getValidMoves', () => {
    it('returns moves from initial position', () => {
      const board = game.initializeBoard();
      const moves = game.getValidMoves(board, 0, 3);
      expect(moves.length).toBeGreaterThan(0);
    });
  });
});
