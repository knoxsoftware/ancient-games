import { describe, it, expect } from 'vitest';
import { WolvesAndRavensGame } from './WolvesAndRavensGame';
import { Move, Player } from '@ancient-games/shared';

const game = new WolvesAndRavensGame();

function makePlayer(playerNumber: number): Player {
  return { id: 'p', displayName: 'P', socketId: 's', ready: true, playerNumber, status: 'active' };
}

describe('WolvesAndRavensGame', () => {
  describe('initializeBoard', () => {
    it('creates 9 pieces total (1 wolf + 8 ravens)', () => {
      const board = game.initializeBoard();
      expect(board.pieces).toHaveLength(9);
    });

    it('wolf starts at center (position 24)', () => {
      const board = game.initializeBoard();
      // One player has 1 piece (wolf), the other has 8 (ravens)
      const wolfPN = board.pieces.filter((p) => p.playerNumber === 0).length === 1 ? 0 : 1;
      const wolf = board.pieces.find((p) => p.playerNumber === wolfPN)!;
      expect(wolf.position).toBe(24);
    });

    it('wolf moves first', () => {
      const board = game.initializeBoard();
      const wolfPN = board.pieces.filter((p) => p.playerNumber === 0).length === 1 ? 0 : 1;
      expect(board.currentTurn).toBe(wolfPN);
    });
  });

  describe('rollDice', () => {
    it('returns values 1-6', () => {
      const results = new Set<number>();
      for (let i = 0; i < 200; i++) results.add(game.rollDice());
      expect(Math.min(...results)).toBeGreaterThanOrEqual(1);
      expect(Math.max(...results)).toBeLessThanOrEqual(6);
    });
  });

  describe('validateMove', () => {
    it('rejects move when diceRoll is null', () => {
      const board = game.initializeBoard();
      const wolfPN = board.currentTurn;
      const move: Move = { playerId: '', pieceIndex: 0, from: 24, to: 25 };
      expect(game.validateMove(board, move, makePlayer(wolfPN))).toBe(false);
    });

    it('allows wolf to move within dice range', () => {
      const board = game.initializeBoard();
      const wolfPN = board.currentTurn;
      board.diceRoll = 3;
      // Wolf at center (24) = row 3, col 3. Move right to col 6 = pos 27
      const move: Move = { playerId: '', pieceIndex: 0, from: 24, to: 27 };
      expect(game.validateMove(board, move, makePlayer(wolfPN))).toBe(true);
    });
  });

  describe('applyMove', () => {
    it('wolf captures raven when landing on it', () => {
      const board = game.initializeBoard();
      const wolfPN = board.currentTurn;
      const ravenPN = 1 - wolfPN;
      board.diceRoll = 3;
      // Place a raven at pos 25 (row 3, col 4) — 1 step right of wolf at 24
      const raven = board.pieces.find((p) => p.playerNumber === ravenPN)!;
      raven.position = 25;
      const move: Move = { playerId: '', pieceIndex: 0, from: 24, to: 25, diceRoll: 3 };
      const result = game.applyMove(board, move);
      const capturedRaven = result.pieces.find(
        (p) => p.playerNumber === ravenPN && p.pieceIndex === raven.pieceIndex,
      )!;
      expect(capturedRaven.position).toBe(99);
    });

    it('raven move decrements remaining moves counter', () => {
      const board = game.initializeBoard();
      const wolfPN = board.currentTurn;
      const ravenPN = 1 - wolfPN;
      board.currentTurn = ravenPN;
      board.diceRoll = 3;
      const raven = board.pieces.find((p) => p.playerNumber === ravenPN && p.position !== 99)!;
      const [fr, fc] = [Math.floor(raven.position / 7), raven.position % 7];
      // Find an adjacent empty cell
      const to =
        fr + 1 < 7 && !board.pieces.some((p) => p.position === (fr + 1) * 7 + fc)
          ? (fr + 1) * 7 + fc
          : (fr - 1) * 7 + fc;
      const move: Move = { playerId: '', pieceIndex: raven.pieceIndex, from: raven.position, to };
      const result = game.applyMove(board, move);
      expect(result.diceRoll).toBe(2); // 3 - 1
      expect(result.currentTurn).toBe(ravenPN); // still raven's turn
    });
  });

  describe('checkWinCondition', () => {
    it('returns null at start', () => {
      expect(game.checkWinCondition(game.initializeBoard())).toBeNull();
    });

    it('wolf wins when 5 ravens captured', () => {
      const board = game.initializeBoard();
      const wolfPN = board.currentTurn;
      const ravenPN = 1 - wolfPN;
      const ravens = board.pieces.filter((p) => p.playerNumber === ravenPN);
      for (let i = 0; i < 5; i++) ravens[i].position = 99;
      expect(game.checkWinCondition(board)).toBe(wolfPN);
    });

    it('ravens win when wolf is surrounded orthogonally', () => {
      const board = game.initializeBoard();
      const wolfPN = board.currentTurn;
      const ravenPN = 1 - wolfPN;
      const wolf = board.pieces.find((p) => p.playerNumber === wolfPN)!;
      wolf.position = 24; // row 3, col 3
      // Place ravens at all orthogonal neighbors: 17 (r2c3), 31 (r4c3), 23 (r3c2), 25 (r3c4)
      const ravens = board.pieces.filter((p) => p.playerNumber === ravenPN);
      ravens[0].position = 17;
      ravens[1].position = 31;
      ravens[2].position = 23;
      ravens[3].position = 25;
      expect(game.checkWinCondition(board)).toBe(ravenPN);
    });
  });

  describe('getValidMoves', () => {
    it('returns wolf moves from center', () => {
      const board = game.initializeBoard();
      const wolfPN = board.currentTurn;
      const moves = game.getValidMoves(board, wolfPN, 1);
      expect(moves.length).toBeGreaterThan(0);
    });

    it('returns raven moves', () => {
      const board = game.initializeBoard();
      const wolfPN = board.currentTurn;
      const ravenPN = 1 - wolfPN;
      const moves = game.getValidMoves(board, ravenPN, 1);
      expect(moves.length).toBeGreaterThan(0);
    });
  });
});
