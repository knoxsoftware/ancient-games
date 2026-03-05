import { describe, it, expect } from 'vitest';
import { BombermageGame } from './BombermageGame';

describe('BombermageGame - initializeBoard', () => {
  const game = new BombermageGame();

  it('initializes with default 11x11 grid', () => {
    const board = game.initializeBoard();
    const state = board as any;
    expect(state.terrain).toHaveLength(11);
    expect(state.terrain[0]).toHaveLength(11);
  });

  it('places indestructible pillars at even row/col intersections', () => {
    const board = game.initializeBoard() as any;
    expect(board.terrain[0][0]).toBe('indestructible');
    expect(board.terrain[0][2]).toBe('indestructible');
    expect(board.terrain[2][2]).toBe('indestructible');
    expect(board.terrain[1][1]).not.toBe('indestructible');
  });

  it('guarantees player corners are clear (3x3 zone)', () => {
    for (let i = 0; i < 20; i++) {
      const board = game.initializeBoard() as any;
      const { rows, cols } = getDimensions(board.terrain);
      expect(board.terrain[0][1]).not.toBe('destructible');
      expect(board.terrain[1][0]).not.toBe('destructible');
      expect(board.terrain[0][cols - 2]).not.toBe('destructible');
      expect(board.terrain[1][cols - 1]).not.toBe('destructible');
      expect(board.terrain[rows - 2][0]).not.toBe('destructible');
      expect(board.terrain[rows - 1][1]).not.toBe('destructible');
      expect(board.terrain[rows - 2][cols - 1]).not.toBe('destructible');
      expect(board.terrain[rows - 1][cols - 2]).not.toBe('destructible');
    }
  });

  it('places players in corners', () => {
    const board = game.initializeBoard() as any;
    const { rows, cols } = getDimensions(board.terrain);
    const positions = board.players.map((p: any) => `${p.position.row},${p.position.col}`);
    expect(positions).toContain('0,0');
    expect(positions).toContain(`${rows - 1},${cols - 1}`);
  });

  it('initializes players with default inventory', () => {
    const board = game.initializeBoard() as any;
    const player = board.players[0];
    expect(player.alive).toBe(true);
    expect(player.inventory.blastRadius).toBe(1);
    expect(player.inventory.maxBombs).toBe(1);
    expect(player.inventory.kickBomb).toBe(false);
    expect(player.inventory.shield).toBe(false);
    expect(player.activeBombCount).toBe(0);
  });

  it('starts with no bombs or explosions', () => {
    const board = game.initializeBoard() as any;
    expect(board.bombs).toHaveLength(0);
    expect(board.explosions).toHaveLength(0);
    expect(board.totalMoveCount).toBe(0);
  });
});

function getDimensions(terrain: string[][]): { rows: number; cols: number } {
  return { rows: terrain.length, cols: terrain[0].length };
}

describe('BombermageGame - bomb mechanics', () => {
  const game = new BombermageGame();

  it('places a bomb on player position', () => {
    const board = game.initializeBoard() as any;
    board.diceRoll = 4;
    board.actionPointsRemaining = 4;
    const move = { playerId: 'p1', pieceIndex: 0, from: 0, to: 0, extra: { type: 'place-bomb', dest: { row: 0, col: 0 } } };
    const after = game.applyMove(board, move) as any;
    expect(after.bombs).toHaveLength(1);
    expect(after.players[0].activeBombCount).toBe(1);
    expect(after.actionPointsRemaining).toBe(2); // 4 - 2
  });

  it('blast destroys destructible terrain and reveals powerup', () => {
    const board = game.initializeBoard() as any;
    board.terrain[0][1] = 'destructible';
    board.powerups[0][1] = 'blast-radius';
    board.diceRoll = 4;
    board.actionPointsRemaining = 4;
    const placeBomb = { playerId: 'p1', pieceIndex: 0, from: 0, to: 0, extra: { type: 'place-bomb', dest: { row: 0, col: 0 } } };
    let after = game.applyMove(board, placeBomb) as any;
    const endTurn = { playerId: 'p1', pieceIndex: 0, from: 0, to: 0, extra: { type: 'end-turn' } };
    for (let i = 0; i < 3; i++) {
      after.diceRoll = 1;
      after.actionPointsRemaining = 1;
      after = game.applyMove(after, endTurn);
    }
    expect(after.terrain[0][1]).toBe('empty');
  });

  it('blast eliminates a player in range', () => {
    const board = game.initializeBoard() as any;
    board.players[1].position = { row: 0, col: 1 };
    board.terrain[0][1] = 'empty';
    board.diceRoll = 4;
    board.actionPointsRemaining = 4;
    const placeBomb = { playerId: 'p1', pieceIndex: 0, from: 0, to: 0, extra: { type: 'place-bomb', dest: { row: 0, col: 0 } } };
    let after = game.applyMove(board, placeBomb) as any;
    const endTurn = { playerId: 'p1', pieceIndex: 0, from: 0, to: 0, extra: { type: 'end-turn' } };
    for (let i = 0; i < 3; i++) {
      after.diceRoll = 1;
      after.actionPointsRemaining = 1;
      after = game.applyMove(after, endTurn);
    }
    expect(after.players[1].alive).toBe(false);
  });

  it('shield absorbs one blast', () => {
    const board = game.initializeBoard() as any;
    board.players[1].position = { row: 0, col: 1 };
    board.players[1].inventory.shield = true;
    board.terrain[0][1] = 'empty';
    board.diceRoll = 4;
    board.actionPointsRemaining = 4;
    const placeBomb = { playerId: 'p1', pieceIndex: 0, from: 0, to: 0, extra: { type: 'place-bomb', dest: { row: 0, col: 0 } } };
    let after = game.applyMove(board, placeBomb) as any;
    const endTurn = { playerId: 'p1', pieceIndex: 0, from: 0, to: 0, extra: { type: 'end-turn' } };
    for (let i = 0; i < 3; i++) {
      after.diceRoll = 1;
      after.actionPointsRemaining = 1;
      after = game.applyMove(after, endTurn);
    }
    expect(after.players[1].alive).toBe(true);
    expect(after.players[1].inventory.shield).toBe(false);
  });
});

describe('BombermageGame - checkWinCondition', () => {
  const game = new BombermageGame();

  it('returns null when both players alive', () => {
    const board = game.initializeBoard();
    expect(game.checkWinCondition(board)).toBeNull();
  });

  it('returns winner when one player dead', () => {
    const board = game.initializeBoard() as any;
    board.players[1].alive = false;
    expect(game.checkWinCondition(board)).toBe(0);
  });
});
