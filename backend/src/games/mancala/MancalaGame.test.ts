import { describe, it, expect } from 'vitest';
import { MancalaGame } from './MancalaGame';
import { Move, Player, PiecePosition } from '@ancient-games/shared';

const game = new MancalaGame();

function makePlayer(playerNumber: number): Player {
  return { id: 'p', displayName: 'P', socketId: 's', ready: true, playerNumber, status: 'active' };
}

function makeMove(from: number, playerNumber: number): Move {
  return { playerId: '', pieceIndex: from, from, to: 0 };
}

function seeds(pieces: PiecePosition[], pos: number): number {
  return pieces.find((p) => p.pieceIndex === pos)?.position ?? 0;
}

describe('MancalaGame', () => {
  describe('initializeBoard', () => {
    it('creates 14 positions', () => {
      const board = game.initializeBoard();
      expect(board.pieces).toHaveLength(14);
    });

    it('each non-store pit starts with 4 seeds', () => {
      const board = game.initializeBoard();
      for (let i = 0; i < 14; i++) {
        if (i === 6 || i === 13) {
          expect(seeds(board.pieces, i)).toBe(0);
        } else {
          expect(seeds(board.pieces, i)).toBe(4);
        }
      }
    });

    it('starts with null diceRoll', () => {
      expect(game.initializeBoard().diceRoll).toBeNull();
    });

    it('currentTurn is 0 or 1', () => {
      expect([0, 1]).toContain(game.initializeBoard().currentTurn);
    });
  });

  describe('rollDice', () => {
    it('always returns 1', () => {
      for (let i = 0; i < 20; i++) {
        expect(game.rollDice()).toBe(1);
      }
    });
  });

  describe('validateMove', () => {
    it('rejects move when diceRoll is null', () => {
      const board = game.initializeBoard();
      expect(game.validateMove(board, makeMove(0, 0), makePlayer(0))).toBe(false);
    });

    it('rejects move from opponent pit', () => {
      const board = { ...game.initializeBoard(), currentTurn: 0, diceRoll: 1 };
      expect(game.validateMove(board, makeMove(7, 0), makePlayer(0))).toBe(false);
    });

    it('rejects move from empty pit', () => {
      const board = game.initializeBoard();
      board.pieces = board.pieces.map((p) => (p.pieceIndex === 0 ? { ...p, position: 0 } : p));
      const withRoll = { ...board, diceRoll: 1 };
      expect(game.validateMove(withRoll, makeMove(0, 0), makePlayer(0))).toBe(false);
    });

    it('accepts valid move from own non-empty pit', () => {
      const board = { ...game.initializeBoard(), currentTurn: 0, diceRoll: 1 };
      expect(game.validateMove(board, makeMove(0, 0), makePlayer(0))).toBe(true);
    });

    it('rejects move for wrong player', () => {
      const board = { ...game.initializeBoard(), currentTurn: 0, diceRoll: 1 };
      expect(game.validateMove(board, makeMove(7, 1), makePlayer(1))).toBe(false);
    });
  });

  describe('applyMove', () => {
    it('clears diceRoll after move', () => {
      const board = { ...game.initializeBoard(), currentTurn: 0, diceRoll: 1 };
      const after = game.applyMove(board, makeMove(0, 0));
      expect(after.diceRoll).toBeNull();
    });

    it('distributes seeds correctly (pit 0, P0)', () => {
      const board = { ...game.initializeBoard(), currentTurn: 0, diceRoll: 1 };
      const after = game.applyMove(board, makeMove(0, 0));
      // pit 0 emptied, pits 1-4 each get +1
      expect(seeds(after.pieces, 0)).toBe(0);
      expect(seeds(after.pieces, 1)).toBe(5);
      expect(seeds(after.pieces, 2)).toBe(5);
      expect(seeds(after.pieces, 3)).toBe(5);
      expect(seeds(after.pieces, 4)).toBe(5);
      expect(seeds(after.pieces, 5)).toBe(4); // not reached
    });

    it('advances turn normally (no extra turn)', () => {
      const board = { ...game.initializeBoard(), currentTurn: 0, diceRoll: 1 };
      const after = game.applyMove(board, makeMove(0, 0));
      expect(after.currentTurn).toBe(1);
    });

    it('grants extra turn when last seed lands in own store (pit 2, P0)', () => {
      // pit 2 has 4 seeds: lands at 3,4,5,6 — 6 is P0's store
      const board = { ...game.initializeBoard(), currentTurn: 0, diceRoll: 1 };
      const after = game.applyMove(board, makeMove(2, 0));
      expect(seeds(after.pieces, 6)).toBe(1); // store got 1 seed
      expect(after.currentTurn).toBe(0); // extra turn
    });

    it('does not add to opponent store when P0 sows past position 12', () => {
      // Set up P0 pit 5 with enough seeds to wrap around
      const board = game.initializeBoard();
      // Give pit 5 enough seeds to reach past P1 store (13)
      board.pieces = board.pieces.map((p) => (p.pieceIndex === 5 ? { ...p, position: 8 } : p));
      const withRoll = { ...board, currentTurn: 0, diceRoll: 1 };
      const after = game.applyMove(withRoll, makeMove(5, 0));
      // seeds land at 6,7,8,9,10,11,12,0 — skips 13
      expect(seeds(after.pieces, 13)).toBe(0);
    });

    it('capture: last seed in own empty pit takes opposite pit', () => {
      const board = game.initializeBoard();
      // Empty pit 0 for P0
      board.pieces = board.pieces.map((p) => (p.pieceIndex === 0 ? { ...p, position: 0 } : p));
      // Set pit 5 to 1 seed (will land in pit 6? No, 5+1=6, that's the store, not pit 0)
      // Need last seed to land in pit 0 — from pit 12 (P1), 12→13→0 skips P0 store? No.
      // Actually we need a P0 move that lands last seed in pit 0.
      // pit X with N seeds: last lands at X+N (mod 14, skipping opponent store)
      // For P0 to land last in pit 0: from pit 13-N... but we skip P1 store (13)
      // Easiest: from pit 5 with 8 seeds: 5→6→7→8→9→10→11→12→0 (skips 13) → lands at 0
      board.pieces = board.pieces.map((p) => {
        if (p.pieceIndex === 5) return { ...p, position: 8 };
        return p;
      });
      // Also ensure pit 12 (opposite of 0) has seeds
      // pit 12 starts with 4 seeds, leave it
      const withRoll = { ...board, currentTurn: 0, diceRoll: 1 };
      const after = game.applyMove(withRoll, makeMove(5, 0));
      // pit 0 should be empty after capture
      expect(seeds(after.pieces, 0)).toBe(0);
      // pit 12 should be empty after capture
      expect(seeds(after.pieces, 12)).toBe(0);
      // Store receives 1 seed during sowing, then captures 1 (pit 0) + 5 (pit 12 after being seeded)
      expect(seeds(after.pieces, 6)).toBe(7);
    });
  });

  describe('checkWinCondition', () => {
    it('returns null at game start', () => {
      expect(game.checkWinCondition(game.initializeBoard())).toBeNull();
    });

    it('returns winner when one side is empty', () => {
      const board = game.initializeBoard();
      // Empty all P0 pits, give P0 store more seeds
      board.pieces = board.pieces.map((p) => {
        if (p.pieceIndex >= 0 && p.pieceIndex <= 5) return { ...p, position: 0 };
        if (p.pieceIndex === 6) return { ...p, position: 25 };
        if (p.pieceIndex === 13) return { ...p, position: 20 };
        return { ...p, position: 0 };
      });
      expect(game.checkWinCondition(board)).toBe(0);
    });
  });

  describe('getValidMoves', () => {
    it('returns 6 moves from initial position for P0', () => {
      const board = game.initializeBoard();
      const moves = game.getValidMoves(board, 0, 1);
      expect(moves).toHaveLength(6);
      expect(moves.map((m) => m.from).sort((a, b) => a - b)).toEqual([0, 1, 2, 3, 4, 5]);
    });

    it('returns 6 moves for P1', () => {
      const board = game.initializeBoard();
      const moves = game.getValidMoves(board, 1, 1);
      expect(moves).toHaveLength(6);
      expect(moves.map((m) => m.from).sort((a, b) => a - b)).toEqual([7, 8, 9, 10, 11, 12]);
    });

    it('returns fewer moves when some pits empty', () => {
      const board = game.initializeBoard();
      board.pieces = board.pieces.map((p) => (p.pieceIndex === 0 ? { ...p, position: 0 } : p));
      const moves = game.getValidMoves(board, 0, 1);
      expect(moves).toHaveLength(5);
    });
  });

  describe('isCaptureMove', () => {
    it('returns false for normal move', () => {
      const board = { ...game.initializeBoard(), currentTurn: 0, diceRoll: 1 };
      expect(game.isCaptureMove(board, makeMove(0, 0))).toBe(false);
    });

    it('returns true when last seed captures opposite pit', () => {
      const board = game.initializeBoard();
      board.pieces = board.pieces.map((p) => {
        if (p.pieceIndex === 0) return { ...p, position: 0 };
        if (p.pieceIndex === 5) return { ...p, position: 8 };
        return p;
      });
      const withRoll = { ...board, currentTurn: 0, diceRoll: 1 };
      expect(game.isCaptureMove(withRoll, makeMove(5, 0))).toBe(true);
    });
  });
});
