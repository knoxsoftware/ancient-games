import { useState, useEffect } from 'react';
import { Session, GameState } from '@ancient-games/shared';
import { socketService } from '../../../services/socket';
import { useTheme } from '../../../contexts/ThemeContext';

// 33-position cross-shaped board layout
// [row, col] for each position index 0-32
const POSITIONS: [number, number][] = [
  [0, 2], [0, 3], [0, 4],
  [1, 2], [1, 3], [1, 4],
  [2, 0], [2, 1], [2, 2], [2, 3], [2, 4], [2, 5], [2, 6],
  [3, 0], [3, 1], [3, 2], [3, 3], [3, 4], [3, 5], [3, 6],
  [4, 0], [4, 1], [4, 2], [4, 3], [4, 4], [4, 5], [4, 6],
  [5, 2], [5, 3], [5, 4],
  [6, 2], [6, 3], [6, 4],
];

function buildAdjacency(): number[][] {
  const adj: number[][] = POSITIONS.map(() => []);
  for (let i = 0; i < POSITIONS.length; i++) {
    for (let j = i + 1; j < POSITIONS.length; j++) {
      const dr = Math.abs(POSITIONS[i][0] - POSITIONS[j][0]);
      const dc = Math.abs(POSITIONS[i][1] - POSITIONS[j][1]);
      if (dr <= 1 && dc <= 1 && dr + dc > 0) {
        adj[i].push(j);
        adj[j].push(i);
      }
    }
  }
  return adj;
}

const ADJACENCY = buildAdjacency();

function jumpTarget(from: number, over: number): number | null {
  const [r1, c1] = POSITIONS[from];
  const [r2, c2] = POSITIONS[over];
  const tr = r2 + (r2 - r1);
  const tc = c2 + (c2 - c1);
  const idx = POSITIONS.findIndex(([r, c]) => r === tr && c === tc);
  return idx === -1 ? null : idx;
}

const CELL_SIZE = 52;
const PADDING = 24;
const COLS = 7;
const ROWS = 7;
const SVG_W = COLS * CELL_SIZE + PADDING * 2;
const SVG_H = ROWS * CELL_SIZE + PADDING * 2;

function posToXY(pos: number): [number, number] {
  const [row, col] = POSITIONS[pos];
  return [PADDING + col * CELL_SIZE, PADDING + row * CELL_SIZE];
}

const GOOSE_COLOR = '#9CA3AF';
const FOX_COLOR = '#F59E0B';
const BOARD_COLOR = '#5C3A1E';
const GRID_COLOR = '#7A4A28';
const HIGHLIGHT_COLOR = 'rgba(255,220,80,0.7)';

interface FoxAndGeeseProps {
  session: Session;
  gameState: GameState;
  playerId: string;
  isMyTurn: boolean;
  animatingPiece?: { playerNumber: number; pieceIndex: number } | null;
}

export default function FoxAndGeeseBoard({
  session,
  gameState,
  playerId,
  isMyTurn,
}: FoxAndGeeseProps) {
  const { board } = gameState;
  const { theme } = useTheme();
  const isYahoo = theme === 'yahoo';
  const [selectedPiece, setSelectedPiece] = useState<{ playerNumber: number; pieceIndex: number; pos: number } | null>(null);

  // Determine which player number this client is
  const myPlayer = session.players.find((p) => p.id === playerId);
  const myPlayerNumber = myPlayer?.playerNumber ?? -1;

  // Auto-roll: Fox & Geese has no real dice, so trigger the roll automatically
  useEffect(() => {
    if (!isMyTurn || board.diceRoll !== null) return;
    socketService.getSocket()?.emit('game:roll-dice', { sessionCode: session.sessionCode, playerId });
  }, [isMyTurn, board.diceRoll, session.sessionCode, playerId]);

  function getValidDestinations(_pieceIndex: number, fromPos: number, playerNumber: number): number[] {
    if (!isMyTurn || board.diceRoll === null) return [];
    const occupiedPositions = new Set(board.pieces.filter((p) => p.position !== 99).map((p) => p.position));
    const geesePositions = new Set(board.pieces.filter((p) => p.playerNumber === 0 && p.position !== 99).map((p) => p.position));
    const dests: number[] = [];

    if (playerNumber === 0) {
      // Geese: move to adjacent empty squares with row >= current row
      const [row] = POSITIONS[fromPos];
      for (const neighbor of ADJACENCY[fromPos]) {
        const [nrow] = POSITIONS[neighbor];
        if (nrow >= row && !occupiedPositions.has(neighbor)) {
          dests.push(neighbor);
        }
      }
    } else {
      // Fox: move to adjacent empty squares or jump over geese
      for (const neighbor of ADJACENCY[fromPos]) {
        if (!occupiedPositions.has(neighbor)) {
          dests.push(neighbor);
        }
      }
      for (const neighbor of ADJACENCY[fromPos]) {
        if (geesePositions.has(neighbor)) {
          const landing = jumpTarget(fromPos, neighbor);
          if (landing !== null && !occupiedPositions.has(landing)) {
            dests.push(landing);
          }
        }
      }
    }
    return dests;
  }

  function handleSquareClick(pos: number) {
    if (!isMyTurn || board.diceRoll === null || gameState.finished) return;

    // If a piece is selected and this is a valid destination, move there
    if (selectedPiece) {
      const validDests = getValidDestinations(selectedPiece.pieceIndex, selectedPiece.pos, selectedPiece.playerNumber);
      if (validDests.includes(pos)) {
        socketService.getSocket()?.emit('game:move', {
          sessionCode: session.sessionCode,
          playerId,
          move: { playerId, pieceIndex: selectedPiece.pieceIndex, from: selectedPiece.pos, to: pos, diceRoll: board.diceRoll },
        });
        setSelectedPiece(null);
        return;
      }
    }

    // Try to select a piece at this position
    const piece = board.pieces.find(
      (p) => p.position === pos && p.playerNumber === myPlayerNumber && p.position !== 99,
    );
    if (piece) {
      setSelectedPiece({ playerNumber: piece.playerNumber, pieceIndex: piece.pieceIndex, pos });
    } else {
      setSelectedPiece(null);
    }
  }

  const validDests = selectedPiece
    ? getValidDestinations(selectedPiece.pieceIndex, selectedPiece.pos, selectedPiece.playerNumber)
    : [];

  // Render board lines (edges between adjacent positions)
  const edges: [number, number][] = [];
  for (let i = 0; i < POSITIONS.length; i++) {
    for (const j of ADJACENCY[i]) {
      if (j > i) edges.push([i, j]);
    }
  }

  const bgColor = isYahoo ? '#f5f0e8' : '#2A1205';

  return (
    <div className="flex flex-col items-center gap-2">
      <svg
        width={SVG_W}
        height={SVG_H}
        style={{ background: bgColor, borderRadius: isYahoo ? 0 : 8, border: isYahoo ? '1px solid #cccccc' : '1px solid rgba(120,70,20,0.4)' }}
      >
        {/* Draw edges */}
        {edges.map(([a, b]) => {
          const [x1, y1] = posToXY(a);
          const [x2, y2] = posToXY(b);
          return <line key={`${a}-${b}`} x1={x1} y1={y1} x2={x2} y2={y2} stroke={GRID_COLOR} strokeWidth={1.5} />;
        })}

        {/* Draw squares */}
        {POSITIONS.map((_, pos) => {
          const [x, y] = posToXY(pos);
          const isHighlight = validDests.includes(pos);
          const isSelected = selectedPiece?.pos === pos;
          return (
            <rect
              key={pos}
              x={x - 10}
              y={y - 10}
              width={20}
              height={20}
              rx={3}
              fill={isSelected ? 'rgba(255,200,50,0.4)' : isHighlight ? HIGHLIGHT_COLOR : BOARD_COLOR}
              stroke={isSelected ? '#FFD700' : isHighlight ? '#FFD700' : '#7A4A28'}
              strokeWidth={isSelected || isHighlight ? 2 : 1}
              style={{ cursor: isMyTurn && board.diceRoll !== null ? 'pointer' : 'default' }}
              onClick={() => handleSquareClick(pos)}
            />
          );
        })}

        {/* Draw pieces */}
        {board.pieces.filter((p) => p.position !== 99 && p.position >= 0 && p.position < POSITIONS.length).map((piece) => {
          const [x, y] = posToXY(piece.position);
          const isFox = piece.playerNumber === 1;
          const isSelected = selectedPiece?.playerNumber === piece.playerNumber && selectedPiece?.pieceIndex === piece.pieceIndex;
          const color = isFox ? FOX_COLOR : GOOSE_COLOR;
          return (
            <g
              key={`${piece.playerNumber}-${piece.pieceIndex}`}
              onClick={() => handleSquareClick(piece.position)}
              style={{ cursor: isMyTurn && board.diceRoll !== null ? 'pointer' : 'default' }}
            >
              <circle
                cx={x}
                cy={y}
                r={isFox ? 14 : 11}
                fill={color}
                stroke={isSelected ? '#FFD700' : isFox ? '#B07800' : '#6B7280'}
                strokeWidth={isSelected ? 3 : 2}
              />
              {isFox && (
                <text x={x} y={y + 5} textAnchor="middle" fontSize={14} fill="#7A4A00" style={{ pointerEvents: 'none', userSelect: 'none' }}>
                  🦊
                </text>
              )}
            </g>
          );
        })}
      </svg>

      {/* Legend */}
      <div className="flex gap-4 text-xs" style={{ color: isYahoo ? '#666' : '#A09070' }}>
        <span className="flex items-center gap-1">
          <span style={{ display: 'inline-block', width: 12, height: 12, borderRadius: '50%', background: GOOSE_COLOR }} />
          Geese ({board.pieces.filter((p) => p.playerNumber === 0 && p.position !== 99).length} left)
        </span>
        <span className="flex items-center gap-1">
          <span style={{ display: 'inline-block', width: 12, height: 12, borderRadius: '50%', background: FOX_COLOR }} />
          Fox
        </span>
      </div>
    </div>
  );
}

export function FoxAndGeesePiecePreview({ playerNumber, size = 20 }: { playerNumber: 0 | 1; size?: number }) {
  const color = playerNumber === 0 ? GOOSE_COLOR : FOX_COLOR;
  return (
    <svg viewBox="0 0 20 20" width={size} height={size}>
      <circle cx="10" cy="10" r="8" fill={color} />
      {playerNumber === 1 && (
        <text x="10" y="14" textAnchor="middle" fontSize="10" fill="#7A4A00">🦊</text>
      )}
    </svg>
  );
}
