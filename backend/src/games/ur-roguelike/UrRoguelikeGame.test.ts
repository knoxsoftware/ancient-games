import { describe, it, expect } from 'vitest';
import { UrRoguelikeGame } from './UrRoguelikeGame';

const game = new UrRoguelikeGame();

describe('UrRoguelikeGame.initializeBoard', () => {
  it('starts in draft phase with 3 event squares and 2 draft offers', () => {
    const board = game.initializeBoard();
    expect(board.draftPhase).toBe(true);
    expect(board.eventSquares).toHaveLength(3);
    expect(board.draftOffers).toHaveLength(2);
    expect(board.draftOffers![0].options).toHaveLength(3);
    expect(board.draftOffers![1].options).toHaveLength(3);
  });

  it('event squares are within candidate positions (5,7,8,9,10)', () => {
    const candidates = new Set([5, 7, 8, 9, 10]);
    const board = game.initializeBoard();
    for (const sq of board.eventSquares!) {
      expect(candidates.has(sq)).toBe(true);
    }
  });
});

describe('UrRoguelikeGame.applyDraftPick', () => {
  it('adds a modifier when a player picks a power-up', () => {
    const board = game.initializeBoard();
    const after = game.applyDraftPick(board, 0, 'double_roll');
    expect(after.modifiers).toHaveLength(1);
    expect(after.modifiers![0].id).toBe('double_roll');
    expect(after.modifiers![0].owner).toBe(0);
    expect(after.draftPhase).toBe(true); // still waiting for player 1
  });

  it('exits draft phase when both players pick', () => {
    let board = game.initializeBoard();
    board = game.applyDraftPick(board, 0, 'double_roll');
    board = game.applyDraftPick(board, 1, 'reroll');
    expect(board.draftPhase).toBe(false);
    expect(board.modifiers).toHaveLength(2);
  });
});

describe('UrRoguelikeGame.validateMove — barriers', () => {
  it('rejects a move to a barrier square', () => {
    const board = {
      ...game.initializeBoard(),
      draftPhase: false,
      diceRoll: 3,
      currentTurn: 0,
      barrierSquares: [{ position: 7, turnsRemaining: 2 }],
    };
    // Put a piece at position 4 (shared), moving 3 = position 7 (barrier)
    board.pieces[0] = { playerNumber: 0, pieceIndex: 0, position: 4 };
    const move = { playerId: '', pieceIndex: 0, from: 4, to: 7, diceRoll: 3 };
    const player = { id: '', displayName: '', socketId: '', ready: true, playerNumber: 0, status: 'active' as const };
    expect(game.validateMove(board, move, player)).toBe(false);
  });
});

describe('UrRoguelikeGame.getValidMoves — barriers', () => {
  it('filters out barrier squares', () => {
    const board = {
      ...game.initializeBoard(),
      draftPhase: false,
      diceRoll: 3,
      currentTurn: 0,
      barrierSquares: [{ position: 7, turnsRemaining: 1 }],
    };
    board.pieces[0] = { playerNumber: 0, pieceIndex: 0, position: 4 };
    const moves = game.getValidMoves(board, 0, 3);
    expect(moves.every((m) => m.to !== 7)).toBe(true);
  });
});
