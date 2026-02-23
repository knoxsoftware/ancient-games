import { describe, it, expect } from 'vitest';
import { RockPaperScissorsGame } from './RockPaperScissorsGame';
import { Move, Player } from '@ancient-games/shared';

const game = new RockPaperScissorsGame();

function makePlayer(playerNumber: number): Player {
  return { id: 'p', displayName: 'P', socketId: 's', ready: true, playerNumber, status: 'active' };
}

describe('RockPaperScissorsGame', () => {
  describe('initializeBoard', () => {
    it('creates 4 pieces (choice + score per player)', () => {
      const board = game.initializeBoard();
      expect(board.pieces).toHaveLength(4);
    });

    it('choice pieces start at -1, score pieces at 0', () => {
      const board = game.initializeBoard();
      for (let pn = 0; pn < 2; pn++) {
        const choice = board.pieces.find((p) => p.playerNumber === pn && p.pieceIndex === 0)!;
        const score = board.pieces.find((p) => p.playerNumber === pn && p.pieceIndex === 1)!;
        expect(choice.position).toBe(-1);
        expect(score.position).toBe(0);
      }
    });

    it('player 0 goes first', () => {
      expect(game.initializeBoard().currentTurn).toBe(0);
    });
  });

  describe('rollDice', () => {
    it('always returns 1', () => {
      for (let i = 0; i < 10; i++) expect(game.rollDice()).toBe(1);
    });
  });

  describe('validateMove', () => {
    it('rejects when diceRoll is null', () => {
      const board = game.initializeBoard();
      const move: Move = { playerId: '', pieceIndex: 0, from: -1, to: 1 };
      expect(game.validateMove(board, move, makePlayer(0))).toBe(false);
    });

    it('accepts choices 1-3', () => {
      const board = game.initializeBoard();
      board.diceRoll = 1;
      for (const choice of [1, 2, 3]) {
        const move: Move = { playerId: '', pieceIndex: 0, from: -1, to: choice };
        expect(game.validateMove(board, move, makePlayer(0))).toBe(true);
      }
    });

    it('rejects invalid choices', () => {
      const board = game.initializeBoard();
      board.diceRoll = 1;
      const move: Move = { playerId: '', pieceIndex: 0, from: -1, to: 4 };
      expect(game.validateMove(board, move, makePlayer(0))).toBe(false);
    });

    it('rejects wrong player', () => {
      const board = game.initializeBoard();
      board.diceRoll = 1;
      const move: Move = { playerId: '', pieceIndex: 0, from: -1, to: 1 };
      expect(game.validateMove(board, move, makePlayer(1))).toBe(false);
    });
  });

  describe('applyMove', () => {
    it('p0 choice is sealed, turn passes to p1', () => {
      const board = game.initializeBoard();
      board.diceRoll = 1;
      const move: Move = { playerId: '', pieceIndex: 0, from: -1, to: 1 }; // Rock
      const result = game.applyMove(board, move);
      expect(result.currentTurn).toBe(1);
      const choice = result.pieces.find((p) => p.playerNumber === 0 && p.pieceIndex === 0)!;
      expect(choice.position).toBe(10); // sealed rock
    });

    it('p1 choice reveals both and updates score', () => {
      const board = game.initializeBoard();
      board.diceRoll = 1;
      board.currentTurn = 1;
      // Seal p0's choice as rock (position 10)
      board.pieces[0].position = 10;
      const move: Move = { playerId: '', pieceIndex: 0, from: -1, to: 3 }; // Scissors
      const result = game.applyMove(board, move);
      // Rock beats scissors -> p0 wins round
      const p0Score = result.pieces.find((p) => p.playerNumber === 0 && p.pieceIndex === 1)!;
      expect(p0Score.position).toBe(1);
      // Choices revealed
      const p0Choice = result.pieces.find((p) => p.playerNumber === 0 && p.pieceIndex === 0)!;
      expect(p0Choice.position).toBe(1); // revealed rock
    });

    it('draw does not change scores', () => {
      const board = game.initializeBoard();
      board.diceRoll = 1;
      board.currentTurn = 1;
      board.pieces[0].position = 10; // sealed rock
      const move: Move = { playerId: '', pieceIndex: 0, from: -1, to: 1 }; // Rock
      const result = game.applyMove(board, move);
      const p0Score = result.pieces.find((p) => p.playerNumber === 0 && p.pieceIndex === 1)!;
      const p1Score = result.pieces.find((p) => p.playerNumber === 1 && p.pieceIndex === 1)!;
      expect(p0Score.position).toBe(0);
      expect(p1Score.position).toBe(0);
    });
  });

  describe('checkWinCondition', () => {
    it('returns null when no one has won', () => {
      expect(game.checkWinCondition(game.initializeBoard())).toBeNull();
    });

    it('returns winner when score reaches 1', () => {
      const board = game.initializeBoard();
      board.pieces.find((p) => p.playerNumber === 1 && p.pieceIndex === 1)!.position = 1;
      expect(game.checkWinCondition(board)).toBe(1);
    });
  });

  describe('getValidMoves', () => {
    it('returns 3 choices for current player', () => {
      const board = game.initializeBoard();
      const moves = game.getValidMoves(board, 0, 1);
      expect(moves).toHaveLength(3);
      expect(moves.map((m) => m.to)).toEqual([1, 2, 3]);
    });

    it('returns empty for non-current player', () => {
      const board = game.initializeBoard();
      expect(game.getValidMoves(board, 1, 1)).toHaveLength(0);
    });
  });
});
