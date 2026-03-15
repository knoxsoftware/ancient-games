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

  it('places indestructible pillars at even row/col intersections except player corners', () => {
    const board = game.initializeBoard() as any;
    // Corner (0,0) is a player starting position — must be clear
    expect(board.terrain[0][0]).toBe('empty');
    // Non-corner even intersections are pillars
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
    expect(after.actionPointsRemaining).toBe(3); // 4 - 1
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

describe('BombermageGame - validateMove collision', () => {
  const game = new BombermageGame();
  const makePlayer = (playerNumber: number) => ({ id: `p${playerNumber}`, playerNumber, sessionId: '', name: `P${playerNumber}`, connected: true });

  it('disallows moving onto a cell occupied by another alive player', () => {
    const board = game.initializeBoard() as any;
    board.players[1].position = { row: 0, col: 1 };
    board.terrain[0][1] = 'empty';
    board.diceRoll = 3;
    board.actionPointsRemaining = 3;
    const move = { playerId: 'p0', pieceIndex: 0, from: 0, to: 0, extra: { type: 'move', dest: { row: 0, col: 1 } } };
    expect(game.validateMove(board, move as any, makePlayer(0) as any)).toBe(false);
  });

  it('allows moving onto a cell that is empty', () => {
    const board = game.initializeBoard() as any;
    board.terrain[0][1] = 'empty';
    board.diceRoll = 3;
    board.actionPointsRemaining = 3;
    const move = { playerId: 'p0', pieceIndex: 0, from: 0, to: 0, extra: { type: 'move', dest: { row: 0, col: 1 } } };
    expect(game.validateMove(board, move as any, makePlayer(0) as any)).toBe(true);
  });
});

describe('BombermageGame - checkWinCondition', () => {
  const game = new BombermageGame();

  it('returns null when multiple players alive', () => {
    const board = game.initializeBoard();
    expect(game.checkWinCondition(board)).toBeNull();
  });

  it('returns winner when only one player alive', () => {
    const board = game.initializeBoard() as any;
    board.players[0].alive = false;
    board.players[1].alive = false;
    board.players[2].alive = false;
    expect(game.checkWinCondition(board)).toBe(3);
  });

  it('returns null when two players remain alive', () => {
    const board = game.initializeBoard() as any;
    board.players[0].alive = false;
    board.players[1].alive = false;
    expect(game.checkWinCondition(board)).toBeNull();
  });
});

describe('movement validation bugs', () => {
  const makePlayer = (playerNumber: number) => ({ id: `p${playerNumber}`, playerNumber, sessionId: '', name: `P${playerNumber}`, connected: true });

  it('rejects moving onto a cell that has a bomb', () => {
    const engine = new BombermageGame();
    const board = engine.initializeBoard() as any;
    const p0 = board.players[0];
    const dest = { row: p0.position.row + 1, col: p0.position.col };
    board.terrain[dest.row][dest.col] = 'empty';
    board.bombs = [{ position: dest, ownerPlayerNumber: 1, placedOnMove: 0, isManual: false }];
    board.actionPointsRemaining = 3;
    board.diceRoll = 3;

    const move = { playerId: 'p1', pieceIndex: 0, from: 0, to: 0, extra: { type: 'move', dest } };
    expect(engine.validateMove(board, move as any, makePlayer(0) as any)).toBe(false);
  });

  it('allows placing a bomb with exactly 1 AP remaining', () => {
    const engine = new BombermageGame();
    const board = engine.initializeBoard() as any;
    board.actionPointsRemaining = 1;
    board.diceRoll = 1;
    const p0 = board.players[0];

    const move = { playerId: 'p1', pieceIndex: 0, from: 0, to: 0, extra: { type: 'place-bomb', dest: p0.position } };
    expect(engine.validateMove(board, move as any, makePlayer(0) as any)).toBe(true);
  });
});

describe('chain explosions', () => {
  it('chain explosion: bomb caught in blast triggers immediately', () => {
    const engine = new BombermageGame();
    const board = engine.initializeBoard() as any;

    // Clear terrain so blasts propagate freely
    for (let r = 0; r < board.terrain.length; r++)
      for (let c = 0; c < board.terrain[0].length; c++)
        if (board.terrain[r][c] === 'destructible') board.terrain[r][c] = 'empty';

    // Bomb A at (5,5) expires at totalMoveCount=10; bomb B at (5,6) would NOT expire on its own (fuse ends at 11)
    board.bombs = [
      { position: { row: 5, col: 5 }, ownerPlayerNumber: 0, placedOnMove: 0, isManual: false },
      { position: { row: 5, col: 6 }, ownerPlayerNumber: 0, placedOnMove: 8, isManual: false },
    ];
    board.players[0].activeBombCount = 2;

    // Bomb A expires (0+3<=10), bomb B does not (8+3=11>10) — chain only
    board.totalMoveCount = 10;
    board.explosions = [];
    (engine as any)._resolveExpiredBombs(board);

    // Both bombs should be gone (chained)
    expect(board.bombs).toHaveLength(0);
  });
});

describe('BombermageGame - getNextTurn', () => {
  const game = new BombermageGame();

  it('returns next player in round-robin for 4 players', () => {
    const board = game.initializeBoard() as any;
    expect(game.getNextTurn(board, 0)).toBe(1);
    expect(game.getNextTurn(board, 1)).toBe(2);
    expect(game.getNextTurn(board, 2)).toBe(3);
    expect(game.getNextTurn(board, 3)).toBe(0);
  });

  it('skips eliminated players (alive === false)', () => {
    const board = game.initializeBoard() as any;
    board.players[1].alive = false;
    expect(game.getNextTurn(board, 0)).toBe(2);
    expect(game.getNextTurn(board, 2)).toBe(3);
    expect(game.getNextTurn(board, 3)).toBe(0);
  });

  it('skips multiple eliminated players', () => {
    const board = game.initializeBoard() as any;
    board.players[1].alive = false;
    board.players[2].alive = false;
    expect(game.getNextTurn(board, 0)).toBe(3);
    expect(game.getNextTurn(board, 3)).toBe(0);
  });
});

describe('coin pickup', () => {
  it('increments player score when walking onto a coin cell', () => {
    const engine = new BombermageGame();
    const board = engine.initializeBoard() as any;
    const p0 = board.players[0];
    const dest = { row: p0.position.row + 1, col: p0.position.col };
    board.terrain[dest.row][dest.col] = 'empty';
    board.coins[dest.row][dest.col] = true;
    board.actionPointsRemaining = 3;
    board.diceRoll = 3;

    const move = { playerId: 'p1', pieceIndex: 0, from: 0, to: 0, extra: { type: 'move', dest } };
    const next = engine.applyMove(board, move) as any;

    expect(next.players[0].score).toBe(1);
    expect(next.coins[dest.row][dest.col]).toBe(false);
  });

  it('does not increment score on empty cell without coin', () => {
    const engine = new BombermageGame();
    const board = engine.initializeBoard() as any;
    const p0 = board.players[0];
    const dest = { row: p0.position.row + 1, col: p0.position.col };
    board.terrain[dest.row][dest.col] = 'empty';
    board.coins[dest.row][dest.col] = false;
    board.actionPointsRemaining = 3;
    board.diceRoll = 3;

    const move = { playerId: 'p1', pieceIndex: 0, from: 0, to: 0, extra: { type: 'move', dest } };
    const next = engine.applyMove(board, move) as any;

    expect(next.players[0].score).toBe(0);
  });
});

describe('board-cleared win condition', () => {
  it('returns higher-score player when no destructible cells remain and both alive', () => {
    const engine = new BombermageGame();
    const board = engine.initializeBoard() as any;
    for (let r = 0; r < board.terrain.length; r++) {
      for (let c = 0; c < board.terrain[r].length; c++) {
        if (board.terrain[r][c] === 'destructible') board.terrain[r][c] = 'empty';
      }
    }
    board.players[0].score = 3;
    board.players[1].score = 1;

    expect(engine.checkWinCondition(board)).toBe(0);
  });

  it('returns null when destructible cells still remain', () => {
    const engine = new BombermageGame();
    const board = engine.initializeBoard() as any;
    board.terrain[2][1] = 'destructible';

    expect(engine.checkWinCondition(board)).toBeNull();
  });

  it('player 0 wins tiebreak when scores equal and board cleared', () => {
    const engine = new BombermageGame();
    const board = engine.initializeBoard() as any;
    for (let r = 0; r < board.terrain.length; r++) {
      for (let c = 0; c < board.terrain[r].length; c++) {
        if (board.terrain[r][c] === 'destructible') board.terrain[r][c] = 'empty';
      }
    }
    board.players[0].score = 2;
    board.players[1].score = 2;

    expect(engine.checkWinCondition(board)).toBe(0);
  });
});
