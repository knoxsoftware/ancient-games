import { describe, it, expect } from 'vitest';
import { StellarSiegeGame } from './StellarSiegeGame';
import { BoardState, Move, Player } from '@ancient-games/shared';

const game = new StellarSiegeGame();

function makePlayer(playerNumber: number): Player {
  return { id: 'p', displayName: 'P', socketId: 's', ready: true, playerNumber, status: 'active' };
}

function getDefenderPN(board: BoardState): number {
  return board.pieces.filter((p) => p.playerNumber === 0).length === 1 ? 0 : 1;
}

describe('StellarSiegeGame', () => {
  describe('initializeBoard', () => {
    it('creates 7 pieces (1 cannon + 6 aliens)', () => {
      const board = game.initializeBoard();
      expect(board.pieces).toHaveLength(7);
    });

    it('cannon starts at row 5 col 3 (position 33)', () => {
      const board = game.initializeBoard();
      const defPN = getDefenderPN(board);
      const cannon = board.pieces.find((p) => p.playerNumber === defPN)!;
      expect(cannon.position).toBe(33);
    });

    it('aliens start in row 0, one per column', () => {
      const board = game.initializeBoard();
      const defPN = getDefenderPN(board);
      const invPN = 1 - defPN;
      const aliens = board.pieces.filter((p) => p.playerNumber === invPN);
      expect(aliens).toHaveLength(6);
      expect(aliens.map((a) => a.position).sort((a, b) => a - b)).toEqual([0, 1, 2, 3, 4, 5]);
    });

    it('defender moves first', () => {
      const board = game.initializeBoard();
      expect(board.currentTurn).toBe(getDefenderPN(board));
    });
  });

  describe('rollDice', () => {
    it('returns values 1-4', () => {
      const results = new Set<number>();
      for (let i = 0; i < 200; i++) results.add(game.rollDice());
      expect(Math.min(...results)).toBeGreaterThanOrEqual(1);
      expect(Math.max(...results)).toBeLessThanOrEqual(4);
    });
  });

  describe('validateMove', () => {
    it('defender can move cannon within dice range along row 5', () => {
      const board = game.initializeBoard();
      const defPN = getDefenderPN(board);
      board.diceRoll = 2;
      // Cannon at col 3, move to col 5 (pos 35)
      const move: Move = { playerId: '', pieceIndex: 0, from: 33, to: 35, diceRoll: 2 };
      expect(game.validateMove(board, move, makePlayer(defPN))).toBe(true);
    });

    it('defender cannot move cannon beyond dice range', () => {
      const board = game.initializeBoard();
      const defPN = getDefenderPN(board);
      board.diceRoll = 1;
      const move: Move = { playerId: '', pieceIndex: 0, from: 33, to: 35, diceRoll: 1 };
      expect(game.validateMove(board, move, makePlayer(defPN))).toBe(false);
    });

    it('alien advances exactly 1 row down', () => {
      const board = game.initializeBoard();
      const defPN = getDefenderPN(board);
      const invPN = 1 - defPN;
      board.currentTurn = invPN;
      board.diceRoll = 1;
      // Alien 0 at pos 0 (row 0, col 0) -> pos 6 (row 1, col 0)
      const move: Move = { playerId: '', pieceIndex: 0, from: 0, to: 6, diceRoll: 1 };
      expect(game.validateMove(board, move, makePlayer(invPN))).toBe(true);
    });
  });

  describe('applyMove', () => {
    it('cannon move auto-fires and destroys closest alien in column', () => {
      const board = game.initializeBoard();
      const defPN = getDefenderPN(board);
      const invPN = 1 - defPN;
      board.diceRoll = 3;
      // Move cannon to col 0 (pos 30) — alien 0 is at pos 0 (row 0, col 0)
      const move: Move = { playerId: '', pieceIndex: 0, from: 33, to: 30, diceRoll: 3 };
      const result = game.applyMove(board, move);
      const alien0 = result.pieces.find((p) => p.playerNumber === invPN && p.pieceIndex === 0)!;
      expect(alien0.position).toBe(99); // destroyed
    });

    it('alien move advances position', () => {
      const board = game.initializeBoard();
      const defPN = getDefenderPN(board);
      const invPN = 1 - defPN;
      board.currentTurn = invPN;
      board.diceRoll = 2;
      // Alien 0 at pos 0 (r0,c0) -> pos 7 (r1,c1)
      const move: Move = { playerId: '', pieceIndex: 0, from: 0, to: 7, diceRoll: 2 };
      const result = game.applyMove(board, move);
      const alien = result.pieces.find((p) => p.playerNumber === invPN && p.pieceIndex === 0)!;
      expect(alien.position).toBe(7);
      expect(result.currentTurn).toBe(defPN);
    });
  });

  describe('checkWinCondition', () => {
    it('returns null at start', () => {
      expect(game.checkWinCondition(game.initializeBoard())).toBeNull();
    });

    it('defender wins when all aliens destroyed', () => {
      const board = game.initializeBoard();
      const defPN = getDefenderPN(board);
      const invPN = 1 - defPN;
      board.pieces.filter((p) => p.playerNumber === invPN).forEach((p) => (p.position = 99));
      expect(game.checkWinCondition(board)).toBe(defPN);
    });

    it('invaders win when any alien reaches row 5', () => {
      const board = game.initializeBoard();
      const defPN = getDefenderPN(board);
      const invPN = 1 - defPN;
      board.pieces.find((p) => p.playerNumber === invPN)!.position = 30; // row 5, col 0
      expect(game.checkWinCondition(board)).toBe(invPN);
    });
  });

  describe('getValidMoves', () => {
    it('defender gets moves along row 5', () => {
      const board = game.initializeBoard();
      const defPN = getDefenderPN(board);
      const moves = game.getValidMoves(board, defPN, 2);
      expect(moves.length).toBeGreaterThan(0);
      expect(moves.every((m) => Math.floor(m.to / 6) === 5)).toBe(true);
    });

    it('invader gets moves for alive aliens', () => {
      const board = game.initializeBoard();
      const defPN = getDefenderPN(board);
      const invPN = 1 - defPN;
      const moves = game.getValidMoves(board, invPN, 1);
      expect(moves.length).toBeGreaterThan(0);
    });
  });
});
