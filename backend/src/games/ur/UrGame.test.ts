import { describe, it, expect } from 'vitest';
import { UrGame } from './UrGame';
import { Move, Player } from '@ancient-games/shared';

const game = new UrGame();

function makePlayer(playerNumber: number): Player {
  return { id: 'p', displayName: 'P', socketId: 's', ready: true, playerNumber, status: 'active' };
}

describe('UrGame', () => {
  describe('initializeBoard', () => {
    it('creates 14 pieces (7 per player) all at position -1', () => {
      const board = game.initializeBoard();
      expect(board.pieces).toHaveLength(14);
      expect(board.pieces.every((p) => p.position === -1)).toBe(true);
      expect(board.pieces.filter((p) => p.playerNumber === 0)).toHaveLength(7);
      expect(board.pieces.filter((p) => p.playerNumber === 1)).toHaveLength(7);
    });

    it('starts with null diceRoll', () => {
      const board = game.initializeBoard();
      expect(board.diceRoll).toBeNull();
    });

    it('currentTurn is 0 or 1', () => {
      const board = game.initializeBoard();
      expect([0, 1]).toContain(board.currentTurn);
    });
  });

  describe('rollDice', () => {
    it('returns values between 0 and 4', () => {
      const results = new Set<number>();
      for (let i = 0; i < 200; i++) results.add(game.rollDice());
      expect(Math.min(...results)).toBeGreaterThanOrEqual(0);
      expect(Math.max(...results)).toBeLessThanOrEqual(4);
    });
  });

  describe('validateMove', () => {
    it('rejects move when diceRoll is null', () => {
      const board = game.initializeBoard();
      board.currentTurn = 0;
      const move: Move = { playerId: '', pieceIndex: 0, from: -1, to: 0, diceRoll: 1 };
      expect(game.validateMove(board, move, makePlayer(0))).toBe(false);
    });

    it('allows entering a piece with dice roll 1 to position 0', () => {
      const board = game.initializeBoard();
      board.currentTurn = 0;
      board.diceRoll = 1;
      const move: Move = { playerId: '', pieceIndex: 0, from: -1, to: 0, diceRoll: 1 };
      expect(game.validateMove(board, move, makePlayer(0))).toBe(true);
    });

    it('rejects move to position occupied by own piece', () => {
      const board = game.initializeBoard();
      board.currentTurn = 0;
      board.diceRoll = 1;
      board.pieces[0].position = 0; // place piece 0 at pos 0
      // Try to enter piece 1 to same position
      const move: Move = { playerId: '', pieceIndex: 1, from: -1, to: 0, diceRoll: 1 };
      expect(game.validateMove(board, move, makePlayer(0))).toBe(false);
    });

    it('rejects roll of 0', () => {
      const board = game.initializeBoard();
      board.currentTurn = 0;
      board.diceRoll = 0;
      const move: Move = { playerId: '', pieceIndex: 0, from: -1, to: 0 };
      expect(game.validateMove(board, move, makePlayer(0))).toBe(false);
    });
  });

  describe('applyMove', () => {
    it('moves piece to target position and clears diceRoll', () => {
      const board = game.initializeBoard();
      board.currentTurn = 0;
      board.diceRoll = 2;
      const move: Move = { playerId: '', pieceIndex: 0, from: -1, to: 1, diceRoll: 2 };
      const result = game.applyMove(board, move);
      const piece = result.pieces.find((p) => p.playerNumber === 0 && p.pieceIndex === 0)!;
      expect(piece.position).toBe(1);
      expect(result.diceRoll).toBeNull();
    });

    it('grants extra turn when landing on rosette (position 2)', () => {
      const board = game.initializeBoard();
      board.currentTurn = 0;
      board.diceRoll = 3;
      const move: Move = { playerId: '', pieceIndex: 0, from: -1, to: 2, diceRoll: 3 };
      const result = game.applyMove(board, move);
      expect(result.currentTurn).toBe(0); // same player
    });

    it('switches turn when not landing on rosette', () => {
      const board = game.initializeBoard();
      board.currentTurn = 0;
      board.diceRoll = 2;
      const move: Move = { playerId: '', pieceIndex: 0, from: -1, to: 1, diceRoll: 2 };
      const result = game.applyMove(board, move);
      expect(result.currentTurn).toBe(1);
    });

    it('captures opponent piece in shared section', () => {
      const board = game.initializeBoard();
      board.currentTurn = 0;
      board.diceRoll = 1;
      board.pieces[0].position = 4; // p0 piece at shared pos 4
      board.pieces[7].position = 5; // p1 piece at shared pos 5
      const move: Move = { playerId: '', pieceIndex: 0, from: 4, to: 5, diceRoll: 1 };
      const result = game.applyMove(board, move);
      const captured = result.pieces.find((p) => p.playerNumber === 1 && p.pieceIndex === 0)!;
      expect(captured.position).toBe(-1);
    });
  });

  describe('checkWinCondition', () => {
    it('returns null when no player has finished all pieces', () => {
      const board = game.initializeBoard();
      expect(game.checkWinCondition(board)).toBeNull();
    });

    it('returns player number when all 7 pieces are at 99', () => {
      const board = game.initializeBoard();
      board.pieces.filter((p) => p.playerNumber === 0).forEach((p) => (p.position = 99));
      expect(game.checkWinCondition(board)).toBe(0);
    });
  });

  describe('getValidMoves', () => {
    it('returns empty array for diceRoll of 0', () => {
      const board = game.initializeBoard();
      expect(game.getValidMoves(board, 0, 0)).toHaveLength(0);
    });

    it('returns moves for entering pieces', () => {
      const board = game.initializeBoard();
      const moves = game.getValidMoves(board, 0, 1);
      expect(moves.length).toBeGreaterThan(0);
      expect(moves[0].to).toBe(0);
    });

    it('includes exit move when exact roll reaches position 14', () => {
      const board = game.initializeBoard();
      board.pieces[0].position = 12; // 2 away from exit
      const moves = game.getValidMoves(board, 0, 2);
      const exitMove = moves.find((m) => m.to === 99);
      expect(exitMove).toBeDefined();
    });
  });
});
