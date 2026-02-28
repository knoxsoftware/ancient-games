import { GameEngine } from '../GameEngine';
import { BoardState, Move, Player } from '@ancient-games/shared';

export const BOARD_SIZE = 9;
const TOTAL = BOARD_SIZE * BOARD_SIZE; // 81 intersections

/** Sentinel value for move.to indicating a pass. */
export const GO_PASS = 999;

const KOMI = 6.5; // compensation for white going second

// --- Board utilities --------------------------------------------------------

function rowOf(pos: number): number {
  return Math.floor(pos / BOARD_SIZE);
}
function colOf(pos: number): number {
  return pos % BOARD_SIZE;
}

function neighbors(pos: number): number[] {
  const r = rowOf(pos);
  const c = colOf(pos);
  const ns: number[] = [];
  if (r > 0) ns.push(pos - BOARD_SIZE);
  if (r < BOARD_SIZE - 1) ns.push(pos + BOARD_SIZE);
  if (c > 0) ns.push(pos - 1);
  if (c < BOARD_SIZE - 1) ns.push(pos + 1);
  return ns;
}

/** Returns the group containing `pos` and its liberties. */
function getGroup(grid: number[], pos: number): { group: number[]; liberties: Set<number> } {
  const color = grid[pos];
  const group: number[] = [];
  const liberties = new Set<number>();
  const visited = new Set<number>();
  const queue: number[] = [pos];
  while (queue.length > 0) {
    const cur = queue.pop()!;
    if (visited.has(cur)) continue;
    visited.add(cur);
    group.push(cur);
    for (const n of neighbors(cur)) {
      if (grid[n] === 0) {
        liberties.add(n);
      } else if (grid[n] === color && !visited.has(n)) {
        queue.push(n);
      }
    }
  }
  return { group, liberties };
}

/**
 * Simulates placing `color` at `pos` on a copy of `grid`.
 * Returns the list of captured positions, or null if the move is suicidal.
 */
function getCapturedAfterPlacement(
  grid: number[],
  pos: number,
  color: number,
): number[] | null {
  const newGrid = [...grid];
  newGrid[pos] = color;
  const opponent = color === 1 ? 2 : 1;

  const captured: number[] = [];
  for (const n of neighbors(pos)) {
    if (newGrid[n] === opponent) {
      const { group, liberties } = getGroup(newGrid, n);
      if (liberties.size === 0) {
        for (const stone of group) {
          captured.push(stone);
          newGrid[stone] = 0;
        }
      }
    }
  }

  // Suicide: after capturing, the placed stone still has no liberties
  const { liberties: ownLiberties } = getGroup(newGrid, pos);
  if (ownLiberties.size === 0) return null;

  return captured;
}

/**
 * Chinese rules scoring: count each player's stones on board + surrounded empty territory.
 * Returns { black, white } (raw counts, without komi).
 */
function scoreBoard(grid: number[]): { black: number; white: number } {
  let black = 0;
  let white = 0;

  // Count stones
  for (const cell of grid) {
    if (cell === 1) black++;
    else if (cell === 2) white++;
  }

  // Flood-fill empty regions to determine territory
  const visited = new Set<number>();
  for (let i = 0; i < TOTAL; i++) {
    if (grid[i] !== 0 || visited.has(i)) continue;

    const region: number[] = [];
    const borders = new Set<number>(); // stone colors bordering this region
    const queue: number[] = [i];

    while (queue.length > 0) {
      const cur = queue.pop()!;
      if (visited.has(cur)) continue;
      visited.add(cur);
      region.push(cur);
      for (const n of neighbors(cur)) {
        if (grid[n] === 0 && !visited.has(n)) {
          queue.push(n);
        } else if (grid[n] !== 0) {
          borders.add(grid[n]);
        }
      }
    }

    // Only count territory if the region is surrounded by exactly one color
    if (borders.size === 1) {
      const owner = [...borders][0];
      if (owner === 1) black += region.length;
      else if (owner === 2) white += region.length;
    }
  }

  return { black, white };
}

// --- BoardState accessors ---------------------------------------------------

interface GoBoard extends BoardState {
  goGrid: number[];
  consecutivePasses: number;
  koPoint: number | null;
  capturedByBlack: number;
  capturedByWhite: number;
}

function asGoBoard(board: BoardState): GoBoard {
  return board as unknown as GoBoard;
}

// ---------------------------------------------------------------------------

export class GoGame extends GameEngine {
  gameType = 'go' as const;
  playerCount = 2;

  initializeBoard(): BoardState {
    return {
      pieces: [],
      currentTurn: 0, // black (player 0) always goes first
      diceRoll: null,
      lastMove: null,
      goGrid: new Array(TOTAL).fill(0),
      consecutivePasses: 0,
      koPoint: null,
      capturedByBlack: 0,
      capturedByWhite: 0,
    } as unknown as BoardState;
  }

  /** No dice in Go — always return 1 so the server can proceed immediately. */
  rollDice(): number {
    return 1;
  }

  validateMove(board: BoardState, move: Move, player: Player): boolean {
    if (board.diceRoll === null) return false;
    if (player.playerNumber !== board.currentTurn) return false;

    const { to } = move;
    const go = asGoBoard(board);

    // Pass is always legal
    if (to === GO_PASS) return true;

    if (to < 0 || to >= TOTAL) return false;
    if (go.goGrid[to] !== 0) return false; // occupied

    // Ko rule: cannot play at the ko point
    if (go.koPoint !== null && to === go.koPoint) return false;

    // Suicide check
    const color = player.playerNumber === 0 ? 1 : 2;
    const result = getCapturedAfterPlacement(go.goGrid, to, color);
    if (result === null) return false;

    return true;
  }

  applyMove(board: BoardState, move: Move): BoardState {
    const { to } = move;
    const go = asGoBoard(board);
    const playerNumber = board.currentTurn;
    const grid = [...go.goGrid];
    let consecutivePasses = go.consecutivePasses;
    let capturedByBlack = go.capturedByBlack;
    let capturedByWhite = go.capturedByWhite;
    let koPoint: number | null = null;

    if (to === GO_PASS) {
      consecutivePasses += 1;
    } else {
      consecutivePasses = 0;
      const color = playerNumber === 0 ? 1 : 2;
      grid[to] = color;

      // Remove captured groups
      const opponent = color === 1 ? 2 : 1;
      const capturedStones: number[] = [];
      for (const n of neighbors(to)) {
        if (grid[n] === opponent) {
          const { group, liberties } = getGroup(grid, n);
          if (liberties.size === 0) {
            for (const stone of group) {
              capturedStones.push(stone);
              grid[stone] = 0;
            }
          }
        }
      }

      // Detect simple ko: exactly one stone captured, and the placed stone
      // would be recaptured if the opponent played at the captured position.
      if (capturedStones.length === 1) {
        const potentialKo = capturedStones[0];
        const { group: placedGroup, liberties: placedLiberties } = getGroup(grid, to);
        if (placedGroup.length === 1 && placedLiberties.size === 1) {
          koPoint = potentialKo;
        }
      }

      if (playerNumber === 0) capturedByBlack += capturedStones.length;
      else capturedByWhite += capturedStones.length;
    }

    return {
      ...board,
      pieces: [],
      currentTurn: (playerNumber + 1) % 2,
      diceRoll: null,
      lastMove: move,
      goGrid: grid,
      consecutivePasses,
      koPoint,
      capturedByBlack,
      capturedByWhite,
    } as unknown as BoardState;
  }

  checkWinCondition(board: BoardState): number | null {
    const go = asGoBoard(board);
    if (go.consecutivePasses < 2) return null;

    const { black, white } = scoreBoard(go.goGrid);
    const whiteTotal = white + KOMI;

    // black wins on tie-break due to integer scores; komi makes actual ties rare
    return black >= whiteTotal ? 0 : 1;
  }

  getValidMoves(board: BoardState, playerNumber: number, _diceRoll: number): Move[] {
    const go = asGoBoard(board);
    const color = playerNumber === 0 ? 1 : 2;
    const moves: Move[] = [];

    for (let pos = 0; pos < TOTAL; pos++) {
      if (go.goGrid[pos] !== 0) continue;
      if (go.koPoint !== null && pos === go.koPoint) continue;
      const result = getCapturedAfterPlacement(go.goGrid, pos, color);
      if (result === null) continue; // suicide
      moves.push({ playerId: '', pieceIndex: 0, from: -1, to: pos });
    }

    // Pass is always legal
    moves.push({ playerId: '', pieceIndex: 0, from: -1, to: GO_PASS });

    return moves;
  }

  canMove(_board: BoardState, _playerNumber: number, _diceRoll: number): boolean {
    return true; // can always pass
  }

  isCaptureMove(board: BoardState, move: Move): boolean {
    if (move.to === GO_PASS || move.to < 0 || move.to >= TOTAL) return false;
    const go = asGoBoard(board);
    if (go.goGrid[move.to] !== 0) return false;
    const color = board.currentTurn === 0 ? 1 : 2;
    const result = getCapturedAfterPlacement(go.goGrid, move.to, color);
    return result !== null && result.length > 0;
  }
}
