import { GameEngine } from '../GameEngine';
import { BoardState, Move, Player, GameType } from '@ancient-games/shared';
import {
  BombermageConfig,
  BombermagePowerupType,
  BombermageGridSize,
} from '@ancient-games/shared';

// ── Types ────────────────────────────────────────────────────────────────────

export type TerrainCell = 'empty' | 'indestructible' | 'destructible';

export interface Position {
  row: number;
  col: number;
}

export interface Bomb {
  position: Position;
  ownerPlayerNumber: number;
  placedOnMove: number;
  isManual: boolean;
}

export interface BombermagePlayer {
  playerNumber: number;
  position: Position;
  alive: boolean;
  inventory: {
    blastRadius: number;
    maxBombs: number;
    kickBomb: boolean;
    manualDetonation: boolean;
    shield: boolean;
    speedBoostTurnsRemaining: number;
  };
  activeBombCount: number;
  bankedAP: number;
  score: number; // coins collected
}

export interface BombermageState {
  players: BombermagePlayer[];
  bombs: Bomb[];
  explosions: Position[];
  totalMoveCount: number;
  config: BombermageConfig;
  actionPointsRemaining: number | null;
}

// ── Constants ────────────────────────────────────────────────────────────────

const DEFAULT_CONFIG: BombermageConfig = {
  gridSize: '11x11',
  barrierDensity: 'normal',
  powerupFrequency: 'normal',
  enabledPowerups: [
    'blast-radius',
    'extra-bomb',
    'kick-bomb',
    'manual-detonation',
    'speed-boost',
    'shield',
  ],
  fuseLength: 3,
  coinDensity: 0.25,
  apMin: 5,
  apMax: 5,
};

const GRID_DIMS: Record<BombermageGridSize, [number, number]> = {
  '9x9': [9, 9],
  '11x11': [11, 11],
  '13x11': [11, 13],
};

const BARRIER_FILL: Record<string, number> = {
  sparse: 0.4,
  normal: 0.65,
  dense: 0.85,
};

const POWERUP_CHANCE: Record<string, number> = {
  rare: 0.15,
  normal: 0.3,
  common: 0.5,
};

// ── Map generation helpers ───────────────────────────────────────────────────

function isClearZone(row: number, col: number, rows: number, cols: number): boolean {
  const nearTop = row <= 1;
  const nearBottom = row >= rows - 2;
  const nearLeft = col <= 1;
  const nearRight = col >= cols - 2;
  return (nearTop && nearLeft) || (nearTop && nearRight) || (nearBottom && nearLeft) || (nearBottom && nearRight);
}

function generateTerrain(
  rows: number,
  cols: number,
  config: BombermageConfig,
): { terrain: TerrainCell[][]; powerups: (BombermagePowerupType | null)[][]; coins: boolean[][] } {
  const terrain: TerrainCell[][] = [];
  const powerups: (BombermagePowerupType | null)[][] = [];
  const coins: boolean[][] = [];
  const fillChance = BARRIER_FILL[config.barrierDensity];
  const powerupChance = POWERUP_CHANCE[config.powerupFrequency];
  const coinDensity = config.coinDensity ?? 0.25;
  let shieldPlaced = false;

  for (let r = 0; r < rows; r++) {
    terrain[r] = [];
    powerups[r] = [];
    coins[r] = [];
    for (let c = 0; c < cols; c++) {
      coins[r][c] = false;
      if (isClearZone(r, c, rows, cols)) {
        terrain[r][c] = 'empty';
        powerups[r][c] = null;
      } else if (r % 2 === 0 && c % 2 === 0) {
        terrain[r][c] = 'indestructible';
        powerups[r][c] = null;
      } else if (Math.random() < fillChance) {
        terrain[r][c] = 'destructible';
        if (Math.random() < powerupChance && config.enabledPowerups.length > 0) {
          let candidates = config.enabledPowerups;
          if (shieldPlaced) {
            candidates = candidates.filter(p => p !== 'shield');
          }
          if (candidates.length > 0) {
            const idx = Math.floor(Math.random() * candidates.length);
            const chosen = candidates[idx];
            powerups[r][c] = chosen;
            if (chosen === 'shield') shieldPlaced = true;
          } else {
            powerups[r][c] = null;
          }
        } else {
          powerups[r][c] = null;
        }
        // Independently roll for coin (separate from powerup)
        if (Math.random() < coinDensity) {
          coins[r][c] = true;
        }
      } else {
        terrain[r][c] = 'empty';
        powerups[r][c] = null;
      }
    }
  }

  return { terrain, powerups, coins };
}

function cornerPositions(rows: number, cols: number): Position[] {
  return [
    { row: 0, col: 0 },
    { row: 0, col: cols - 1 },
    { row: rows - 1, col: 0 },
    { row: rows - 1, col: cols - 1 },
  ];
}

function defaultInventory() {
  return {
    blastRadius: 1,
    maxBombs: 1,
    kickBomb: false,
    manualDetonation: false,
    shield: false,
    speedBoostTurnsRemaining: 0,
  };
}

// ── Engine ───────────────────────────────────────────────────────────────────

export class BombermageGame extends GameEngine {
  gameType: GameType = 'bombermage';
  playerCount = 4;
  minPlayerCount = 2;

  initializeBoard(config: BombermageConfig = DEFAULT_CONFIG): BoardState {
    const numPlayers: number = (config as any).numPlayers ?? 4;
    const [rows, cols] = GRID_DIMS[config.gridSize];
    const { terrain, powerups, coins } = generateTerrain(rows, cols, config);
    const corners = cornerPositions(rows, cols);

    const players: BombermagePlayer[] = Array.from({ length: numPlayers }, (_, pn) => ({
      playerNumber: pn,
      position: corners[pn],
      alive: true,
      inventory: defaultInventory(),
      activeBombCount: 0,
      bankedAP: 0,
      score: 0,
    }));

    const bombermage: BombermageState = {
      players,
      bombs: [],
      explosions: [],
      totalMoveCount: 0,
      config,
      actionPointsRemaining: null,
    };

    return {
      pieces: [],
      currentTurn: 0,
      diceRoll: null,
      lastMove: null,
      ...(bombermage as any),
      terrain,
      powerups,
      coins,
    };
  }

  rollDice(): number {
    return Math.floor(Math.random() * 6) + 1;
  }

  getValidMoves(board: BoardState, playerNumber: number, diceRoll: number): Move[] {
    return [{ playerId: '', pieceIndex: 0, from: 0, to: 0 }];
  }

  canMove(board: BoardState, playerNumber: number, diceRoll: number): boolean {
    return true;
  }

  validateMove(board: BoardState, move: Move, player: Player): boolean {
    if (player.playerNumber !== board.currentTurn) return false;
    if (board.diceRoll === null) return false;
    const bm = board as any;
    const p = bm.players[player.playerNumber];
    if (!p || !p.alive) return false;

    const extra = (move as any).extra ?? {};
    const type: string = extra.type ?? 'move';

    if (type === 'move') {
      const ap = bm.actionPointsRemaining ?? 0;
      if (ap < 1) return false;
      const dest: Position = extra.dest;
      if (!dest) return false;
      const dr = Math.abs(dest.row - p.position.row);
      const dc = Math.abs(dest.col - p.position.col);
      if ((dr === 1 && dc === 0) || (dr === 0 && dc === 1)) {
        const cell = bm.terrain[dest.row]?.[dest.col];
        if (cell !== 'empty') return false;
        const occupied = bm.players.some(
          (other: BombermagePlayer) =>
            other.alive &&
            other.playerNumber !== player.playerNumber &&
            other.position.row === dest.row &&
            other.position.col === dest.col,
        );
        if (occupied) return false;
        const hasBomb = bm.bombs.some(
          (b: Bomb) => b.position.row === dest.row && b.position.col === dest.col
        );
        return !hasBomb;
      }
      return false;
    }

    if (type === 'place-bomb') {
      const ap = bm.actionPointsRemaining ?? 0;
      if (ap < 1) return false;
      if (p.activeBombCount >= p.inventory.maxBombs) return false;
      const dest: Position = extra.dest ?? p.position;
      return dest.row === p.position.row && dest.col === p.position.col;
    }

    if (type === 'kick-bomb') {
      if (!p.inventory.kickBomb) return false;
      const ap = bm.actionPointsRemaining ?? 0;
      if (ap < 1) return false;
      const bombIndex: number = extra.bombIndex;
      return bm.bombs[bombIndex]?.ownerPlayerNumber === player.playerNumber;
    }

    if (type === 'detonate') {
      if (!p.inventory.manualDetonation) return false;
      const bombIndex: number = extra.bombIndex;
      const bomb = bm.bombs[bombIndex];
      return bomb?.ownerPlayerNumber === player.playerNumber && bomb?.isManual === true;
    }

    if (type === 'end-turn') {
      return true;
    }

    return false;
  }

  applyMove(board: BoardState, move: Move): BoardState {
    const state = JSON.parse(JSON.stringify(board));
    const bm = state as any;
    const extra = (move as any).extra ?? {};
    const type: string = extra.type ?? 'move';
    const playerNumber = board.currentTurn;
    const p = bm.players[playerNumber];

    // Clear explosions at the start of each action — they were shown last update
    bm.explosions = [];

    if (type === 'move') {
      const dest: Position = extra.dest;
      p.position = dest;
      bm.actionPointsRemaining = (bm.actionPointsRemaining ?? 0) - 1;
      const powerup = bm.powerups[dest.row][dest.col];
      if (powerup && bm.terrain[dest.row][dest.col] === 'empty') {
        this._applyPowerup(p, powerup);
        bm.powerups[dest.row][dest.col] = null;
      }
      // Collect coin if present
      if (bm.coins?.[dest.row]?.[dest.col]) {
        p.score = (p.score ?? 0) + 1;
        bm.coins[dest.row][dest.col] = false;
      }
    } else if (type === 'place-bomb') {
      const bomb: Bomb = {
        position: { ...p.position },
        ownerPlayerNumber: playerNumber,
        placedOnMove: bm.totalMoveCount,
        isManual: false,
      };
      bm.bombs.push(bomb);
      p.activeBombCount++;
      bm.actionPointsRemaining = (bm.actionPointsRemaining ?? 0) - 1;
    } else if (type === 'kick-bomb') {
      const bombIndex: number = extra.bombIndex;
      const dir: string = extra.direction;
      const bomb = bm.bombs[bombIndex];
      if (bomb) {
        const delta = dirToDelta(dir);
        let nr = bomb.position.row + delta[0];
        let nc = bomb.position.col + delta[1];
        while (
          nr >= 0 && nr < bm.terrain.length &&
          nc >= 0 && nc < bm.terrain[0].length &&
          bm.terrain[nr][nc] === 'empty' &&
          !bm.bombs.some((b: Bomb) => b.position.row === nr && b.position.col === nc)
        ) {
          bomb.position = { row: nr, col: nc };
          nr += delta[0];
          nc += delta[1];
        }
      }
      bm.actionPointsRemaining = (bm.actionPointsRemaining ?? 0) - 1;
    } else if (type === 'detonate') {
      const bombIndex: number = extra.bombIndex;
      this._detonateBomb(bm, bombIndex);
    } else if (type === 'end-turn') {
      // Bank leftover AP for the current player before ending turn
      p.bankedAP = bm.actionPointsRemaining ?? 0;
      // Explosion phase: increment move count, resolve expired bombs, then advance turn
      bm.totalMoveCount++;
      this._resolveExpiredBombs(bm);
      bm.currentTurn = this.getNextTurn(bm, playerNumber);
      bm.diceRoll = null;
      bm.actionPointsRemaining = null;
      return state;
    }

    if ((bm.actionPointsRemaining ?? 1) <= 0) {
      // Bank leftover AP (zero in this case) before ending turn
      p.bankedAP = 0;
      // Explosion phase: increment move count, resolve expired bombs, then advance turn
      bm.totalMoveCount++;
      this._resolveExpiredBombs(bm);
      bm.currentTurn = this.getNextTurn(bm, playerNumber);
      bm.diceRoll = null;
      bm.actionPointsRemaining = null;
    }

    return state;
  }

  checkWinCondition(board: BoardState): number | null {
    const bm = board as any;
    const alivePlayers: BombermagePlayer[] = bm.players.filter((p: BombermagePlayer) => p.alive);
    if (alivePlayers.length === 1) return alivePlayers[0].playerNumber;
    if (alivePlayers.length === 0) return bm.currentTurn;

    // Board-cleared win: if no destructible cells remain, highest score among alive players wins
    const hasDestructible = bm.terrain?.some((row: TerrainCell[]) =>
      row.some((cell: TerrainCell) => cell === 'destructible')
    );
    if (!hasDestructible) {
      const winner = alivePlayers.reduce((best: BombermagePlayer, p: BombermagePlayer) =>
        p.score > best.score ? p : best
      );
      return winner.playerNumber;
    }

    return null;
  }

  getNextTurn(board: BoardState, currentPlayer: number): number {
    const players: BombermagePlayer[] = (board as any).players ?? [];
    const count = players.length || this.playerCount;
    for (let i = 1; i <= count; i++) {
      const candidate = (currentPlayer + i) % count;
      const candidatePlayer = players.find((p) => p.playerNumber === candidate);
      if (!candidatePlayer || candidatePlayer.alive) return candidate;
    }
    return (currentPlayer + 1) % count;
  }

  isCaptureMove(board: BoardState, move: Move): boolean {
    return false;
  }

  afterDiceRoll(board: BoardState, _roll: number): BoardState {
    const bm = board as any;
    const apMin: number = bm.config?.apMin ?? 1;
    const apMax: number = bm.config?.apMax ?? 6;
    const actualRoll = apMin === apMax
      ? apMin
      : Math.floor(Math.random() * (apMax - apMin + 1)) + apMin;
    const p: BombermagePlayer = bm.players[bm.currentTurn];
    const banked = p?.bankedAP ?? 0;
    const cap = apMax + Math.max(0, apMax - apMin); // bank cap scales with range
    const total = Math.min(banked + actualRoll, cap);
    if (p) p.bankedAP = 0;
    return { ...board, diceRoll: actualRoll, players: bm.players, actionPointsRemaining: total } as BoardState;
  }

  // ── Private helpers ──────────────────────────────────────────────────────

  private _applyPowerup(player: BombermagePlayer, powerup: BombermagePowerupType): void {
    switch (powerup) {
      case 'blast-radius': player.inventory.blastRadius++; break;
      case 'extra-bomb': player.inventory.maxBombs++; break;
      case 'kick-bomb': player.inventory.kickBomb = true; break;
      case 'manual-detonation': player.inventory.manualDetonation = true; break;
      case 'speed-boost': player.inventory.speedBoostTurnsRemaining += 3; break;
      case 'shield': player.inventory.shield = true; break;
    }
  }

  private _detonateBomb(bm: any, bombIndex: number): void {
    const posKey = (p: Position) => `${p.row},${p.col}`;
    const pendingPositions: Position[] = [bm.bombs[bombIndex]?.position];
    const detonatedPositions = new Set<string>();

    while (pendingPositions.length > 0) {
      const pos = pendingPositions.shift()!;
      const key = posKey(pos);
      if (detonatedPositions.has(key)) continue;
      detonatedPositions.add(key);

      const idx = bm.bombs.findIndex((b: Bomb) => b.position.row === pos.row && b.position.col === pos.col);
      if (idx === -1) continue;

      const bomb: Bomb = bm.bombs[idx];
      const owner: BombermagePlayer = bm.players[bomb.ownerPlayerNumber];
      const radius = owner?.inventory.blastRadius ?? 1;
      const blastCells = this._calcBlast(bm.terrain, bomb.position, radius);
      bm.explosions.push(...blastCells);

      for (const cell of blastCells) {
        if (bm.terrain[cell.row][cell.col] === 'destructible') {
          bm.terrain[cell.row][cell.col] = 'empty';
          if (bm.powerups?.[cell.row]?.[cell.col]) bm.powerups[cell.row][cell.col] = null;
          if (bm.coins?.[cell.row]?.[cell.col]) bm.coins[cell.row][cell.col] = false;
        }
      }

      for (const player of bm.players) {
        if (!player.alive) continue;
        if (blastCells.some((c: Position) => c.row === player.position.row && c.col === player.position.col)) {
          if (player.inventory.shield) {
            player.inventory.shield = false;
          } else {
            player.alive = false;
            if (player.deathOrder === undefined) {
              player.deathOrder = bm.deathCount ?? 0;
              bm.deathCount = (bm.deathCount ?? 0) + 1;
            }
          }
        }
      }

      bm.bombs.splice(idx, 1);
      if (owner) owner.activeBombCount = Math.max(0, owner.activeBombCount - 1);

      for (const b of bm.bombs) {
        const bKey = posKey(b.position);
        if (!detonatedPositions.has(bKey) && blastCells.some((c: Position) => c.row === b.position.row && c.col === b.position.col)) {
          pendingPositions.push({ ...b.position });
        }
      }
    }
  }

  private _resolveExpiredBombs(bm: any): void {
    const fuseLength: number = bm.config?.fuseLength ?? 3;
    let i = 0;
    while (i < bm.bombs.length) {
      const bomb: Bomb = bm.bombs[i];
      if (!bomb.isManual && bm.totalMoveCount >= bomb.placedOnMove + fuseLength) {
        this._detonateBomb(bm, i);
      } else {
        i++;
      }
    }
  }

  private _calcBlast(terrain: TerrainCell[][], center: Position, radius: number): Position[] {
    const cells: Position[] = [center];
    const dirs = [[-1, 0], [1, 0], [0, -1], [0, 1]];
    for (const [dr, dc] of dirs) {
      for (let i = 1; i <= radius; i++) {
        const r = center.row + dr * i;
        const c = center.col + dc * i;
        if (r < 0 || r >= terrain.length || c < 0 || c >= terrain[0].length) break;
        if (terrain[r][c] === 'indestructible') break;
        cells.push({ row: r, col: c });
        if (terrain[r][c] === 'destructible') break;
      }
    }
    return cells;
  }
}

function dirToDelta(dir: string): [number, number] {
  switch (dir) {
    case 'up': return [-1, 0];
    case 'down': return [1, 0];
    case 'left': return [0, -1];
    case 'right': return [0, 1];
    default: return [0, 0];
  }
}
