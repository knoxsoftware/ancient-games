import { GameEngine } from '../GameEngine';
import { BoardState, Move, Player, PiecePosition } from '@ancient-games/shared';

// 33-position cross-shaped board
// Positions 0-32 laid out as:
//   Row 0: pos 0,1,2     → (0,2),(0,3),(0,4)
//   Row 1: pos 3,4,5     → (1,2),(1,3),(1,4)
//   Row 2: pos 6-12      → (2,0)-(2,6)
//   Row 3: pos 13-19     → (3,0)-(3,6), center=16=(3,3)
//   Row 4: pos 20-26     → (4,0)-(4,6)
//   Row 5: pos 27,28,29  → (5,2),(5,3),(5,4)
//   Row 6: pos 30,31,32  → (6,2),(6,3),(6,4)
//
// Player 0 = Geese (13 pieces, start pos 0-12)
// Player 1 = Fox   (1 piece, starts pos 16)
//
// Geese move to adjacent squares but only forward (increasing row) or sideways
// Fox moves to any adjacent square and can jump-capture geese
// Geese win if fox cannot move; Fox wins if < 4 geese remain active

const POSITIONS: [number, number][] = [
  [0, 2], [0, 3], [0, 4],         // 0-2
  [1, 2], [1, 3], [1, 4],         // 3-5
  [2, 0], [2, 1], [2, 2], [2, 3], [2, 4], [2, 5], [2, 6], // 6-12
  [3, 0], [3, 1], [3, 2], [3, 3], [3, 4], [3, 5], [3, 6], // 13-19
  [4, 0], [4, 1], [4, 2], [4, 3], [4, 4], [4, 5], [4, 6], // 20-26
  [5, 2], [5, 3], [5, 4],         // 27-29
  [6, 2], [6, 3], [6, 4],         // 30-32
];

// Build adjacency lists from (row, col) distance <= 1 in each dimension
function buildAdjacency(): number[][] {
  const adj: number[][] = POSITIONS.map(() => []);
  for (let i = 0; i < POSITIONS.length; i++) {
    for (let j = i + 1; j < POSITIONS.length; j++) {
      const dr = Math.abs(POSITIONS[i][0] - POSITIONS[j][0]);
      const dc = Math.abs(POSITIONS[i][1] - POSITIONS[j][1]);
      if (dr <= 1 && dc <= 1 && (dr + dc) > 0) {
        adj[i].push(j);
        adj[j].push(i);
      }
    }
  }
  return adj;
}

const ADJACENCY = buildAdjacency();

// For fox jump: given pos and neighbor, compute the landing square (if it exists)
function jumpTarget(from: number, over: number): number | null {
  const [r1, c1] = POSITIONS[from];
  const [r2, c2] = POSITIONS[over];
  const tr = r2 + (r2 - r1);
  const tc = c2 + (c2 - c1);
  const idx = POSITIONS.findIndex(([r, c]) => r === tr && c === tc);
  return idx === -1 ? null : idx;
}

export class FoxAndGeeseGame extends GameEngine {
  gameType = 'fox-and-geese' as const;
  playerCount = 2;

  initializeBoard(): BoardState {
    const pieces: PiecePosition[] = [];
    // 13 geese (player 0) at positions 0-12
    for (let i = 0; i < 13; i++) {
      pieces.push({ playerNumber: 0, pieceIndex: i, position: i });
    }
    // 1 fox (player 1) at position 16 (center)
    pieces.push({ playerNumber: 1, pieceIndex: 0, position: 16 });

    return {
      pieces,
      currentTurn: 0, // Geese go first
      diceRoll: null,
      lastMove: null,
    };
  }

  rollDice(): number {
    return 1; // No dice in Fox & Geese
  }

  validateMove(board: BoardState, move: Move, player: Player): boolean {
    if (board.diceRoll === null) return false;
    if (player.playerNumber !== board.currentTurn) return false;
    const piece = board.pieces.find(
      (p) => p.playerNumber === player.playerNumber && p.pieceIndex === move.pieceIndex,
    );
    if (!piece || piece.position === 99) return false;
    if (piece.position !== move.from) return false;

    const validMoves = this.getValidMoves(board, player.playerNumber, 1);
    return validMoves.some((m) => m.pieceIndex === move.pieceIndex && m.to === move.to);
  }

  applyMove(board: BoardState, move: Move): BoardState {
    const newPieces = board.pieces.map((p) => ({ ...p }));
    const pieceIdx = newPieces.findIndex(
      (p) => p.playerNumber === board.currentTurn && p.pieceIndex === move.pieceIndex,
    );
    if (pieceIdx === -1) return board;

    newPieces[pieceIdx] = { ...newPieces[pieceIdx], position: move.to };

    // If fox (player 1) jumped, remove the captured goose
    if (board.currentTurn === 1) {
      const from = move.from;
      const to = move.to;
      const [r1, c1] = POSITIONS[from];
      const [r2, c2] = POSITIONS[to];
      const dr = Math.abs(r2 - r1);
      const dc = Math.abs(c2 - c1);
      if (dr === 2 || dc === 2) {
        // This is a jump — find and capture the goose in between
        const mr = (r1 + r2) / 2;
        const mc = (c1 + c2) / 2;
        const capturedIdx = newPieces.findIndex(
          (p) => p.playerNumber === 0 && POSITIONS[p.position]?.[0] === mr && POSITIONS[p.position]?.[1] === mc,
        );
        if (capturedIdx !== -1) {
          newPieces[capturedIdx] = { ...newPieces[capturedIdx], position: 99 };
        }
      }
    }

    return {
      ...board,
      pieces: newPieces,
      currentTurn: (board.currentTurn + 1) % 2,
      diceRoll: null,
      lastMove: move,
    };
  }

  checkWinCondition(board: BoardState): number | null {
    // Geese win if fox has no valid moves
    const foxPiece = board.pieces.find((p) => p.playerNumber === 1);
    if (foxPiece && foxPiece.position !== 99) {
      const foxMoves = this._getFoxMoves(board, foxPiece.position);
      if (foxMoves.length === 0) return 0; // Geese win
    }

    // Fox wins if fewer than 4 geese remain active
    const activeGeese = board.pieces.filter((p) => p.playerNumber === 0 && p.position !== 99);
    if (activeGeese.length < 4) return 1; // Fox wins

    return null;
  }

  getValidMoves(board: BoardState, playerNumber: number, _diceRoll: number): Move[] {
    const moves: Move[] = [];
    if (playerNumber === 0) {
      // Geese: move to adjacent square with higher or equal row (forward/sideways)
      const geese = board.pieces.filter((p) => p.playerNumber === 0 && p.position !== 99);
      const occupiedPositions = new Set(
        board.pieces.filter((p) => p.position !== 99).map((p) => p.position),
      );
      for (const goose of geese) {
        const [row] = POSITIONS[goose.position];
        for (const neighbor of ADJACENCY[goose.position]) {
          const [nrow] = POSITIONS[neighbor];
          if (nrow >= row && !occupiedPositions.has(neighbor)) {
            moves.push({ playerId: '', pieceIndex: goose.pieceIndex, from: goose.position, to: neighbor });
          }
        }
      }
    } else {
      // Fox
      const foxPiece = board.pieces.find((p) => p.playerNumber === 1);
      if (foxPiece && foxPiece.position !== 99) {
        const foxMoves = this._getFoxMoves(board, foxPiece.position);
        moves.push(...foxMoves.map((to) => ({ playerId: '', pieceIndex: 0, from: foxPiece.position, to })));
      }
    }
    return moves;
  }

  private _getFoxMoves(board: BoardState, foxPos: number): number[] {
    const occupiedPositions = new Set(
      board.pieces.filter((p) => p.position !== 99).map((p) => p.position),
    );
    const geesePositions = new Set(
      board.pieces.filter((p) => p.playerNumber === 0 && p.position !== 99).map((p) => p.position),
    );
    const destinations: number[] = [];

    // Normal moves to empty adjacent squares
    for (const neighbor of ADJACENCY[foxPos]) {
      if (!occupiedPositions.has(neighbor)) {
        destinations.push(neighbor);
      }
    }

    // Jump captures over adjacent geese
    for (const neighbor of ADJACENCY[foxPos]) {
      if (geesePositions.has(neighbor)) {
        const landing = jumpTarget(foxPos, neighbor);
        if (landing !== null && !occupiedPositions.has(landing)) {
          destinations.push(landing);
        }
      }
    }

    return destinations;
  }

  canMove(board: BoardState, playerNumber: number, diceRoll: number): boolean {
    return this.getValidMoves(board, playerNumber, diceRoll).length > 0;
  }

  isCaptureMove(board: BoardState, move: Move): boolean {
    if (board.currentTurn !== 1) return false; // Only fox captures
    const foxPiece = board.pieces.find((p) => p.playerNumber === 1);
    if (!foxPiece) return false;
    const from = move.from;
    const to = move.to;
    if (from < 0 || from >= POSITIONS.length || to < 0 || to >= POSITIONS.length) return false;
    const [r1, c1] = POSITIONS[from];
    const [r2, c2] = POSITIONS[to];
    return Math.abs(r2 - r1) === 2 || Math.abs(c2 - c1) === 2;
  }
}
