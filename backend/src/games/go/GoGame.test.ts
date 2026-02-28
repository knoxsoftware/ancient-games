import { describe, it, expect } from 'vitest';
import { GoGame, GO_PASS, BOARD_SIZE } from './GoGame';
import { Move, Player, BoardState } from '@ancient-games/shared';

const TOTAL = BOARD_SIZE * BOARD_SIZE;
const game = new GoGame();

function makePlayer(playerNumber: number): Player {
  return {
    id: 'p',
    displayName: 'P',
    socketId: 's',
    ready: true,
    playerNumber,
    status: 'active',
  };
}

function withDiceRoll(board: BoardState, diceRoll: number): BoardState {
  return { ...board, diceRoll } as BoardState;
}

function goBoard(board: BoardState): any {
  return board as any;
}

describe('GoGame', () => {
  describe('initializeBoard', () => {
    it('creates an empty 9x9 grid', () => {
      const board = game.initializeBoard();
      expect(goBoard(board).goGrid).toHaveLength(TOTAL);
      expect(goBoard(board).goGrid.every((c: number) => c === 0)).toBe(true);
    });

    it('starts with no pieces', () => {
      expect(game.initializeBoard().pieces).toHaveLength(0);
    });

    it('starts with null diceRoll', () => {
      expect(game.initializeBoard().diceRoll).toBeNull();
    });

    it('black (player 0) goes first', () => {
      expect(game.initializeBoard().currentTurn).toBe(0);
    });

    it('starts with 0 consecutive passes', () => {
      expect(goBoard(game.initializeBoard()).consecutivePasses).toBe(0);
    });

    it('starts with null koPoint', () => {
      expect(goBoard(game.initializeBoard()).koPoint).toBeNull();
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
      const move: Move = { playerId: '', pieceIndex: 0, from: -1, to: 40 };
      expect(game.validateMove(board, move, makePlayer(0))).toBe(false);
    });

    it('allows placing at empty intersection', () => {
      const board = withDiceRoll(game.initializeBoard(), 1);
      const move: Move = { playerId: '', pieceIndex: 0, from: -1, to: 40 };
      expect(game.validateMove(board, move, makePlayer(0))).toBe(true);
    });

    it('allows pass (GO_PASS)', () => {
      const board = withDiceRoll(game.initializeBoard(), 1);
      const move: Move = { playerId: '', pieceIndex: 0, from: -1, to: GO_PASS };
      expect(game.validateMove(board, move, makePlayer(0))).toBe(true);
    });

    it('rejects placing on occupied intersection', () => {
      let board = withDiceRoll(game.initializeBoard(), 1);
      board = game.applyMove(board, { playerId: '', pieceIndex: 0, from: -1, to: 40 });
      board = withDiceRoll(board, 1);
      const move: Move = { playerId: '', pieceIndex: 0, from: -1, to: 40 };
      // Player 1's turn now
      expect(game.validateMove(board, move, makePlayer(1))).toBe(false);
    });

    it('rejects suicide move (single stone with no liberties)', () => {
      // Surround position 0 (corner) by opponent stones on its two neighbors (1 and 9)
      let board = game.initializeBoard() as any;
      board.goGrid[1] = 2; // opponent to the right
      board.goGrid[9] = 2; // opponent below
      board.diceRoll = 1;
      board.currentTurn = 0;
      const move: Move = { playerId: '', pieceIndex: 0, from: -1, to: 0 };
      expect(game.validateMove(board as BoardState, move, makePlayer(0))).toBe(false);
    });

    it('allows capture move (not suicide even though neighbors are opponent)', () => {
      // Black plays at pos 0, white stones at 1 and 9 but black has a liberty at pos 0 via capture of white group
      // Place white single stone at pos 1 (surrounded except by pos 0)
      let board = game.initializeBoard() as any;
      board.goGrid[2] = 1; // black above pos 1 (row 0, col 2)
      board.goGrid[10] = 1; // black below pos 1 (row 1, col 1)
      board.goGrid[0] = 0; // pos 0 is empty (where black will play)
      // White at pos 1: neighbors are pos 0 (empty), pos 2 (black), pos 10 (black)
      board.goGrid[1] = 2;
      board.diceRoll = 1;
      board.currentTurn = 0;
      const move: Move = { playerId: '', pieceIndex: 0, from: -1, to: 0 };
      // Black plays at 0, capturing white at 1
      expect(game.validateMove(board as BoardState, move, makePlayer(0))).toBe(true);
    });

    it('rejects move at ko point', () => {
      const board = game.initializeBoard() as any;
      board.goGrid[40] = 2; // some setup
      board.koPoint = 40;
      board.diceRoll = 1;
      board.currentTurn = 0;
      const move: Move = { playerId: '', pieceIndex: 0, from: -1, to: 40 };
      expect(game.validateMove(board as BoardState, move, makePlayer(0))).toBe(false);
    });
  });

  describe('applyMove', () => {
    it('places a stone on the grid', () => {
      let board = withDiceRoll(game.initializeBoard(), 1);
      board = game.applyMove(board, { playerId: '', pieceIndex: 0, from: -1, to: 40 });
      expect(goBoard(board).goGrid[40]).toBe(1); // black stone
    });

    it('advances currentTurn after placement', () => {
      let board = withDiceRoll(game.initializeBoard(), 1);
      board = game.applyMove(board, { playerId: '', pieceIndex: 0, from: -1, to: 40 });
      expect(board.currentTurn).toBe(1);
    });

    it('clears diceRoll after placement', () => {
      let board = withDiceRoll(game.initializeBoard(), 1);
      board = game.applyMove(board, { playerId: '', pieceIndex: 0, from: -1, to: 40 });
      expect(board.diceRoll).toBeNull();
    });

    it('captures surrounded opponent stones', () => {
      let board = game.initializeBoard() as any;
      // Surround white stone at center (40) with black stones on 3 sides, then play 4th
      board.goGrid[31] = 1; // above 40
      board.goGrid[39] = 1; // left of 40
      board.goGrid[41] = 1; // right of 40
      board.goGrid[40] = 2; // white stone to be captured
      board.diceRoll = 1;
      board.currentTurn = 0;
      const result = game.applyMove(board as BoardState, {
        playerId: '',
        pieceIndex: 0,
        from: -1,
        to: 49, // below 40
      });
      expect(goBoard(result).goGrid[40]).toBe(0); // white stone removed
      expect(goBoard(result).capturedByBlack).toBe(1);
    });

    it('increments consecutivePasses on pass', () => {
      let board = withDiceRoll(game.initializeBoard(), 1);
      board = game.applyMove(board, { playerId: '', pieceIndex: 0, from: -1, to: GO_PASS });
      expect(goBoard(board).consecutivePasses).toBe(1);
    });

    it('resets consecutivePasses on placement', () => {
      let board = game.initializeBoard() as any;
      board.consecutivePasses = 1;
      board.diceRoll = 1;
      board = game.applyMove(board as BoardState, {
        playerId: '',
        pieceIndex: 0,
        from: -1,
        to: 40,
      });
      expect(goBoard(board).consecutivePasses).toBe(0);
    });
  });

  describe('checkWinCondition', () => {
    it('returns null at game start', () => {
      expect(game.checkWinCondition(game.initializeBoard())).toBeNull();
    });

    it('returns null after one pass', () => {
      let board = withDiceRoll(game.initializeBoard(), 1);
      board = game.applyMove(board, { playerId: '', pieceIndex: 0, from: -1, to: GO_PASS });
      expect(game.checkWinCondition(board)).toBeNull();
    });

    it('returns a winner after two consecutive passes', () => {
      let board = withDiceRoll(game.initializeBoard(), 1);
      board = game.applyMove(board, { playerId: '', pieceIndex: 0, from: -1, to: GO_PASS });
      board = withDiceRoll(board, 1);
      board = game.applyMove(board, { playerId: '', pieceIndex: 0, from: -1, to: GO_PASS });
      const winner = game.checkWinCondition(board);
      expect(winner).not.toBeNull();
      expect([0, 1]).toContain(winner);
    });

    it('white wins with komi on empty board (both pass immediately)', () => {
      // On empty board, score is 0-0, but white gets komi → white wins
      let board = withDiceRoll(game.initializeBoard(), 1);
      board = game.applyMove(board, { playerId: '', pieceIndex: 0, from: -1, to: GO_PASS });
      board = withDiceRoll(board, 1);
      board = game.applyMove(board, { playerId: '', pieceIndex: 0, from: -1, to: GO_PASS });
      expect(game.checkWinCondition(board)).toBe(1); // white wins
    });
  });

  describe('getValidMoves', () => {
    it('includes all empty intersections + pass on empty board', () => {
      const board = withDiceRoll(game.initializeBoard(), 1);
      const moves = game.getValidMoves(board, 0, 1);
      // All 81 intersections + pass
      expect(moves.length).toBe(TOTAL + 1);
    });

    it('excludes occupied intersections', () => {
      let board = withDiceRoll(game.initializeBoard(), 1);
      board = game.applyMove(board, { playerId: '', pieceIndex: 0, from: -1, to: 40 });
      board = withDiceRoll(board, 1);
      const moves = game.getValidMoves(board, 1, 1);
      const toValues = moves.map((m) => m.to);
      expect(toValues).not.toContain(40);
    });

    it('always includes pass as a valid move', () => {
      const board = withDiceRoll(game.initializeBoard(), 1);
      const moves = game.getValidMoves(board, 0, 1);
      expect(moves.some((m) => m.to === GO_PASS)).toBe(true);
    });
  });

  describe('canMove', () => {
    it('always returns true (can always pass)', () => {
      expect(game.canMove(game.initializeBoard(), 0, 1)).toBe(true);
      expect(game.canMove(game.initializeBoard(), 1, 1)).toBe(true);
    });
  });

  describe('isCaptureMove', () => {
    it('returns false on pass', () => {
      const board = game.initializeBoard();
      expect(game.isCaptureMove(board, { playerId: '', pieceIndex: 0, from: -1, to: GO_PASS })).toBe(false);
    });

    it('returns false for placement with no captures', () => {
      const board = game.initializeBoard();
      expect(game.isCaptureMove(board, { playerId: '', pieceIndex: 0, from: -1, to: 40 })).toBe(false);
    });

    it('returns true when the move captures opponent stones', () => {
      let board = game.initializeBoard() as any;
      // White stone at 40 surrounded except pos 49
      board.goGrid[31] = 1;
      board.goGrid[39] = 1;
      board.goGrid[41] = 1;
      board.goGrid[40] = 2;
      board.diceRoll = 1;
      board.currentTurn = 0;
      expect(
        game.isCaptureMove(board as BoardState, {
          playerId: '',
          pieceIndex: 0,
          from: -1,
          to: 49,
        }),
      ).toBe(true);
    });
  });
});
