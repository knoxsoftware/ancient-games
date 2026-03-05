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
