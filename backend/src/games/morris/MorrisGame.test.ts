import { describe, it, expect } from 'vitest';
import { MorrisGame } from './MorrisGame';
import { Move, Player } from '@ancient-games/shared';

const game = new MorrisGame();

function makePlayer(playerNumber: number): Player {
  return { id: 'p', displayName: 'P', socketId: 's', ready: true, playerNumber, status: 'active' };
}

describe('MorrisGame', () => {
  describe('initializeBoard', () => {
    it('creates 18 pieces (9 per player) all at position -1', () => {
      const board = game.initializeBoard();
      expect(board.pieces).toHaveLength(18);
      expect(board.pieces.every((p) => p.position === -1)).toBe(true);
      expect(board.pieces.filter((p) => p.playerNumber === 0)).toHaveLength(9);
    });

    it('starts with null diceRoll', () => {
      expect(game.initializeBoard().diceRoll).toBeNull();
    });
  });

  describe('rollDice', () => {
    it('always returns 1', () => {
      for (let i = 0; i < 10; i++) {
        expect(game.rollDice()).toBe(1);
      }
    });
  });

  describe('validateMove — placement phase', () => {
    it('allows placing a piece on an empty position', () => {
      const board = game.initializeBoard();
      board.currentTurn = 0;
      board.diceRoll = 1;
      const move: Move = { playerId: '', pieceIndex: 0, from: -1, to: 0 };
      expect(game.validateMove(board, move, makePlayer(0))).toBe(true);
    });

    it('rejects placing on an occupied position', () => {
      const board = game.initializeBoard();
      board.currentTurn = 0;
      board.diceRoll = 1;
      board.pieces[9].position = 0; // p1 piece at pos 0
      const move: Move = { playerId: '', pieceIndex: 0, from: -1, to: 0 };
      expect(game.validateMove(board, move, makePlayer(0))).toBe(false);
    });
  });

  describe('validateMove — removal phase (diceRoll=2)', () => {
    it('allows removing an opponent piece not in a mill', () => {
      const board = game.initializeBoard();
      board.currentTurn = 0;
      board.diceRoll = 2;
      // Place opponent piece at position 5
      board.pieces[9].position = 5;
      const move: Move = { playerId: '', pieceIndex: board.pieces[9].pieceIndex, from: 5, to: 99 };
      expect(game.validateMove(board, move, makePlayer(0))).toBe(true);
    });
  });

  describe('applyMove', () => {
    it('places a piece and clears diceRoll when no mill formed', () => {
      const board = game.initializeBoard();
      board.currentTurn = 0;
      board.diceRoll = 1;
      const move: Move = { playerId: '', pieceIndex: 0, from: -1, to: 5 };
      const result = game.applyMove(board, move);
      const piece = result.pieces.find((p) => p.playerNumber === 0 && p.pieceIndex === 0)!;
      expect(piece.position).toBe(5);
      expect(result.diceRoll).toBeNull();
      expect(result.currentTurn).toBe(1);
    });

    it('sets diceRoll to 2 when a mill is formed', () => {
      const board = game.initializeBoard();
      board.currentTurn = 0;
      board.diceRoll = 1;
      // Place two pieces of p0 to form a mill at [0,1,2]
      board.pieces[0].position = 0;
      board.pieces[1].position = 1;
      // Place an opponent piece on the board so removal is possible
      board.pieces[9].position = 5;
      const move: Move = { playerId: '', pieceIndex: 2, from: -1, to: 2 };
      const result = game.applyMove(board, move);
      expect(result.diceRoll).toBe(2); // mill formed, removal pending
      expect(result.currentTurn).toBe(0); // same player removes
    });

    it('removal move sends opponent piece to 99', () => {
      const board = game.initializeBoard();
      board.currentTurn = 0;
      board.diceRoll = 2;
      board.pieces[9].position = 5;
      const move: Move = { playerId: '', pieceIndex: board.pieces[9].pieceIndex, from: 5, to: 99 };
      const result = game.applyMove(board, move);
      const removed = result.pieces.find(
        (p) => p.playerNumber === 1 && p.pieceIndex === board.pieces[9].pieceIndex,
      )!;
      expect(removed.position).toBe(99);
    });
  });

  describe('checkWinCondition', () => {
    it('returns null at start', () => {
      expect(game.checkWinCondition(game.initializeBoard())).toBeNull();
    });

    it('returns winner when opponent has fewer than 3 pieces after placement', () => {
      const board = game.initializeBoard();
      const p1Pieces = board.pieces.filter((p) => p.playerNumber === 1);
      // Place all p1 pieces, then remove most
      p1Pieces.forEach((p) => (p.position = 99));
      // Leave 2 on board
      p1Pieces[0].position = 0;
      p1Pieces[1].position = 1;
      // All p0 pieces placed
      const p0Pieces = board.pieces.filter((p) => p.playerNumber === 0);
      p0Pieces.forEach((p, i) => (p.position = 3 + i));
      board.diceRoll = null;
      expect(game.checkWinCondition(board)).toBe(0); // p0 wins
    });
  });

  describe('getValidMoves', () => {
    it('returns placement moves during phase 1', () => {
      const board = game.initializeBoard();
      const moves = game.getValidMoves(board, 0, 1);
      // 24 positions × 9 unplaced pieces = 216 possible placements
      expect(moves.length).toBe(24 * 9);
    });

    it('returns removal moves when diceRoll is 2', () => {
      const board = game.initializeBoard();
      board.pieces[9].position = 5;
      const moves = game.getValidMoves(board, 0, 2);
      expect(moves.length).toBe(1);
      expect(moves[0].to).toBe(99);
    });
  });
});
