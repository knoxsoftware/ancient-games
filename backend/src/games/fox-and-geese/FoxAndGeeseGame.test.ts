import { describe, it, expect } from 'vitest';
import { FoxAndGeeseGame } from './FoxAndGeeseGame';
import { Move, Player } from '@ancient-games/shared';

const game = new FoxAndGeeseGame();

function makePlayer(playerNumber: number): Player {
  return { id: 'p', displayName: 'P', socketId: 's', ready: true, playerNumber, status: 'active' };
}

describe('FoxAndGeeseGame', () => {
  describe('initializeBoard', () => {
    it('creates 14 pieces total (13 geese + 1 fox)', () => {
      const board = game.initializeBoard();
      expect(board.pieces).toHaveLength(14);
      expect(board.pieces.filter((p) => p.playerNumber === 0)).toHaveLength(13);
      expect(board.pieces.filter((p) => p.playerNumber === 1)).toHaveLength(1);
    });

    it('geese start at positions 0-12', () => {
      const board = game.initializeBoard();
      const geesePositions = board.pieces
        .filter((p) => p.playerNumber === 0)
        .map((p) => p.position)
        .sort((a, b) => a - b);
      expect(geesePositions).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
    });

    it('fox starts at position 16 (center)', () => {
      const board = game.initializeBoard();
      const fox = board.pieces.find((p) => p.playerNumber === 1);
      expect(fox?.position).toBe(16);
    });

    it('starts with null diceRoll', () => {
      expect(game.initializeBoard().diceRoll).toBeNull();
    });

    it('geese go first (currentTurn = 0)', () => {
      expect(game.initializeBoard().currentTurn).toBe(0);
    });
  });

  describe('rollDice', () => {
    it('always returns 1', () => {
      for (let i = 0; i < 10; i++) {
        expect(game.rollDice()).toBe(1);
      }
    });
  });

  describe('validateMove', () => {
    it('rejects move when diceRoll is null', () => {
      const board = game.initializeBoard();
      const move: Move = { playerId: '', pieceIndex: 0, from: 0, to: 1 };
      expect(game.validateMove(board, move, makePlayer(0))).toBe(false);
    });

    it('rejects move for wrong player', () => {
      const board = { ...game.initializeBoard(), diceRoll: 1, currentTurn: 0 };
      const move: Move = { playerId: '', pieceIndex: 0, from: 16, to: 15 };
      expect(game.validateMove(board, move, makePlayer(1))).toBe(false);
    });

    it('accepts a valid goose move forward', () => {
      // Place a single goose at pos 13=(3,0) and move it forward to pos 20=(4,0)
      // Both positions are > 12 so initially unoccupied by other geese
      const board = game.initializeBoard();
      const pieces = board.pieces.map((p) =>
        p.playerNumber === 0 && p.pieceIndex === 0 ? { ...p, position: 13 } : p,
      );
      const testBoard = { ...board, pieces, diceRoll: 1, currentTurn: 0 };
      const move: Move = { playerId: '', pieceIndex: 0, from: 13, to: 20 };
      expect(game.validateMove(testBoard, move, makePlayer(0))).toBe(true);
    });

    it('rejects goose moving backward', () => {
      // Place a goose on row 2, try to move to row 1
      const board = game.initializeBoard();
      // Goose at pos 6 = (2,0), row 2. Backward would be... nowhere in that direction for (2,0)
      // Goose at pos 8 = (2,2), adjacent to pos 3 = (1,2), row 1 < row 2 → backward
      const pieces = board.pieces.map((p) =>
        p.playerNumber === 0 && p.pieceIndex === 0 ? { ...p, position: 8 } : p,
      );
      const testBoard = { ...board, pieces, diceRoll: 1, currentTurn: 0 };
      const move: Move = { playerId: '', pieceIndex: 0, from: 8, to: 3 };
      expect(game.validateMove(testBoard, move, makePlayer(0))).toBe(false);
    });
  });

  describe('applyMove', () => {
    it('moves a goose and advances turn', () => {
      const board = { ...game.initializeBoard(), diceRoll: 1, currentTurn: 0 };
      const move: Move = { playerId: '', pieceIndex: 3, from: 3, to: 8 };
      const newBoard = game.applyMove(board, move);
      const goose = newBoard.pieces.find((p) => p.playerNumber === 0 && p.pieceIndex === 3);
      expect(goose?.position).toBe(8);
      expect(newBoard.currentTurn).toBe(1);
      expect(newBoard.diceRoll).toBeNull();
    });

    it('fox captures goose by jumping', () => {
      const board = game.initializeBoard();
      // Fox at 16=(3,3). Goose at 15=(3,2). Landing would be 14=(3,1).
      // But pos 14 and 15 must not be occupied by geese initially...
      // Actually pos 15 = (3,2), within geese start range 0-12? No, 15 > 12 so not occupied.
      // Let's place fox at 16 and goose at 15, and ensure 14 is empty.
      const pieces = board.pieces.map((p) => {
        if (p.playerNumber === 1) return { ...p, position: 16 };
        if (p.playerNumber === 0 && p.pieceIndex === 0) return { ...p, position: 15 };
        // move other geese away from 14
        if (p.playerNumber === 0 && p.pieceIndex === 1) return { ...p, position: 99 };
        return p;
      });
      const testBoard = { ...board, pieces, diceRoll: 1, currentTurn: 1 };
      const move: Move = { playerId: '', pieceIndex: 0, from: 16, to: 14 };
      const newBoard = game.applyMove(testBoard, move);

      const fox = newBoard.pieces.find((p) => p.playerNumber === 1);
      expect(fox?.position).toBe(14);

      const capturedGoose = newBoard.pieces.find((p) => p.playerNumber === 0 && p.pieceIndex === 0);
      expect(capturedGoose?.position).toBe(99);
    });
  });

  describe('checkWinCondition', () => {
    it('returns null at game start', () => {
      expect(game.checkWinCondition(game.initializeBoard())).toBeNull();
    });

    it('fox wins when fewer than 4 geese remain', () => {
      const board = game.initializeBoard();
      const pieces = board.pieces.map((p) => {
        if (p.playerNumber === 0 && p.pieceIndex >= 4) return { ...p, position: 99 };
        return p;
      });
      // 4 geese remain (indices 0-3)
      const testBoard = { ...board, pieces };
      expect(game.checkWinCondition(testBoard)).toBeNull(); // exactly 4, not < 4

      const pieces2 = board.pieces.map((p) => {
        if (p.playerNumber === 0 && p.pieceIndex >= 3) return { ...p, position: 99 };
        return p;
      });
      const testBoard2 = { ...board, pieces: pieces2 };
      expect(game.checkWinCondition(testBoard2)).toBe(1); // fox wins
    });

    it('geese win when fox has no moves', () => {
      // Fox at pos 32=(6,4). Adjacent: 29=(5,4), 31=(6,3), 28=(5,3).
      // Jump targets: 29→(4,4)=24, 31→(6,2)=30, 28→(4,2)=22.
      // Block all adjacent AND jump target squares with geese (keep >= 4 active).
      const board = game.initializeBoard();
      const blockedPositions = [29, 31, 28, 24, 30, 22]; // adjacent + jump targets
      const pieces = board.pieces.map((p) => {
        if (p.playerNumber === 1) return { ...p, position: 32 };
        if (p.playerNumber === 0 && p.pieceIndex < blockedPositions.length) {
          return { ...p, position: blockedPositions[p.pieceIndex] };
        }
        return { ...p, position: 99 };
      });
      const testBoard = { ...board, pieces };
      expect(game.checkWinCondition(testBoard)).toBe(0); // geese win
    });
  });

  describe('getValidMoves', () => {
    it('returns goose moves from initial position', () => {
      const board = { ...game.initializeBoard(), diceRoll: 1 };
      const moves = game.getValidMoves(board, 0, 1);
      expect(moves.length).toBeGreaterThan(0);
    });

    it('returns fox moves from initial position', () => {
      const board = { ...game.initializeBoard(), diceRoll: 1 };
      const moves = game.getValidMoves(board, 1, 1);
      expect(moves.length).toBeGreaterThan(0);
    });

    it('geese cannot move backward', () => {
      const board = game.initializeBoard();
      // Place one goose at row 2, check it can't go to row 1
      const pieces = board.pieces.map((p) =>
        p.playerNumber === 0 && p.pieceIndex === 0 ? { ...p, position: 8 } : p,
      );
      const testBoard = { ...board, pieces, diceRoll: 1, currentTurn: 0 };
      const moves = game.getValidMoves(testBoard, 0, 1);
      const gooseMoves = moves.filter((m) => m.pieceIndex === 0);
      // None should go to pos 3 (row 1)
      expect(gooseMoves.every((m) => m.to !== 3)).toBe(true);
    });
  });

  describe('isCaptureMove', () => {
    it('returns false for goose moves', () => {
      const board = { ...game.initializeBoard(), currentTurn: 0 };
      const move: Move = { playerId: '', pieceIndex: 0, from: 0, to: 3 };
      expect(game.isCaptureMove(board, move)).toBe(false);
    });

    it('returns false for non-jump fox moves', () => {
      const board = { ...game.initializeBoard(), currentTurn: 1 };
      const move: Move = { playerId: '', pieceIndex: 0, from: 16, to: 17 };
      expect(game.isCaptureMove(board, move)).toBe(false);
    });

    it('returns true for fox jump moves', () => {
      const board = { ...game.initializeBoard(), currentTurn: 1 };
      // Jump from 16=(3,3) over 15=(3,2) to 14=(3,1): dr=0, dc=2 → capture
      const move: Move = { playerId: '', pieceIndex: 0, from: 16, to: 14 };
      expect(game.isCaptureMove(board, move)).toBe(true);
    });
  });
});
