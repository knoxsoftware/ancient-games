import { useState } from 'react';
import { Session, GameState } from '@ancient-games/shared';
import { socketService } from '../../../services/socket';

// Must match backend constant
const BOARD_SIZE = 9;
const TOTAL = BOARD_SIZE * BOARD_SIZE;
export const GO_PASS = 999;

const CELL = 44;
const MARGIN = 30;
const SVG_W = MARGIN * 2 + (BOARD_SIZE - 1) * CELL;
const SVG_H = SVG_W;

// 9x9 star points (0-indexed positions): 3-3, 3-7, 7-3, 7-7 corners + center
const STAR_POINTS = [
  2 * BOARD_SIZE + 2,
  2 * BOARD_SIZE + 6,
  6 * BOARD_SIZE + 2,
  6 * BOARD_SIZE + 6,
  4 * BOARD_SIZE + 4,
];

function posToXY(pos: number): [number, number] {
  const row = Math.floor(pos / BOARD_SIZE);
  const col = pos % BOARD_SIZE;
  return [MARGIN + col * CELL, MARGIN + row * CELL];
}

function xyToPos(x: number, y: number, svgRect: DOMRect): number | null {
  const scaleX = SVG_W / svgRect.width;
  const scaleY = SVG_H / svgRect.height;
  const svgX = (x - svgRect.left) * scaleX;
  const svgY = (y - svgRect.top) * scaleY;
  const col = Math.round((svgX - MARGIN) / CELL);
  const row = Math.round((svgY - MARGIN) / CELL);
  if (col < 0 || col >= BOARD_SIZE || row < 0 || row >= BOARD_SIZE) return null;
  return row * BOARD_SIZE + col;
}

interface GoBoardProps {
  session: Session;
  gameState: GameState;
  playerId: string;
  isMyTurn: boolean;
  animatingPiece?: { playerNumber: number; pieceIndex: number } | null;
}

export default function GoBoard({ session, gameState, playerId, isMyTurn }: GoBoardProps) {
  const { board } = gameState;
  const go = board as any;
  const grid: number[] = go.goGrid ?? new Array(TOTAL).fill(0);
  const koPoint: number | null = go.koPoint ?? null;
  const capturedByBlack: number = go.capturedByBlack ?? 0;
  const capturedByWhite: number = go.capturedByWhite ?? 0;
  const consecutivePasses: number = go.consecutivePasses ?? 0;

  const [hoverPos, setHoverPos] = useState<number | null>(null);

  const myPlayerNumber = session.players.find((p) => p.id === playerId)?.playerNumber ?? -1;
  const myColor = myPlayerNumber === 0 ? 1 : 2; // 1=black, 2=white

  const canPlay = isMyTurn && board.diceRoll !== null && !gameState.finished;

  function emitRoll() {
    socketService.getSocket()?.emit('game:roll-dice', {
      sessionCode: session.sessionCode,
      playerId,
    });
  }

  function emitMove(to: number) {
    socketService.getSocket()?.emit('game:move', {
      sessionCode: session.sessionCode,
      playerId,
      move: { playerId, pieceIndex: 0, from: -1, to, diceRoll: board.diceRoll ?? undefined },
    });
  }

  function handleSvgClick(e: React.MouseEvent<SVGSVGElement>) {
    if (!canPlay) return;
    const svg = e.currentTarget;
    const rect = svg.getBoundingClientRect();
    const pos = xyToPos(e.clientX, e.clientY, rect);
    if (pos === null) return;
    if (grid[pos] !== 0) return;
    if (koPoint !== null && pos === koPoint) return;
    emitMove(pos);
    setHoverPos(null);
  }

  function handleSvgMove(e: React.MouseEvent<SVGSVGElement>) {
    if (!canPlay) return;
    const svg = e.currentTarget;
    const rect = svg.getBoundingClientRect();
    const pos = xyToPos(e.clientX, e.clientY, rect);
    setHoverPos(pos !== null && grid[pos] === 0 ? pos : null);
  }

  function handleSvgLeave() {
    setHoverPos(null);
  }

  // Count stones on board for display
  const blackStones = grid.filter((c) => c === 1).length;
  const whiteStones = grid.filter((c) => c === 2).length;

  // Last move position
  const lastMovePos = board.lastMove && board.lastMove.to !== GO_PASS ? board.lastMove.to : null;

  return (
    <div className="flex flex-col items-center gap-3 p-2 select-none">
      {/* Score / info row */}
      <div className="flex gap-6 text-sm" style={{ color: '#9A8A70' }}>
        <div className="flex items-center gap-1.5">
          <div className="w-4 h-4 rounded-full bg-gray-900 border border-gray-600 shadow" />
          <span style={{ color: '#D0C8B8' }}>
            Black · {blackStones} stones · {capturedByBlack} cap
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-4 h-4 rounded-full bg-gray-100 border border-gray-400 shadow" />
          <span style={{ color: '#D0C8B8' }}>
            White · {whiteStones} stones · {capturedByWhite} cap
          </span>
        </div>
      </div>

      {/* Roll button (auto-advances to playing state) */}
      {isMyTurn && board.diceRoll === null && !gameState.finished && (
        <button
          onClick={emitRoll}
          className="px-5 py-2 rounded font-semibold text-sm"
          style={{ background: '#4A6A40', color: '#D0F0A0' }}
        >
          Your turn — click to place a stone
        </button>
      )}

      {/* Passes indicator */}
      {consecutivePasses > 0 && !gameState.finished && (
        <div className="text-xs" style={{ color: '#9A7A50' }}>
          {consecutivePasses === 1 ? 'One pass — opponent passed.' : ''}
        </div>
      )}

      {/* Board SVG */}
      <svg
        viewBox={`0 0 ${SVG_W} ${SVG_H}`}
        width="100%"
        style={{
          maxWidth: SVG_W,
          cursor: canPlay ? 'crosshair' : 'default',
          touchAction: 'none',
        }}
        onClick={handleSvgClick}
        onMouseMove={handleSvgMove}
        onMouseLeave={handleSvgLeave}
      >
        {/* Board background */}
        <rect width={SVG_W} height={SVG_H} fill="#C8A85A" rx="4" />
        <rect
          x={MARGIN - 4}
          y={MARGIN - 4}
          width={(BOARD_SIZE - 1) * CELL + 8}
          height={(BOARD_SIZE - 1) * CELL + 8}
          fill="#B89848"
          rx="2"
        />

        {/* Grid lines */}
        {Array.from({ length: BOARD_SIZE }, (_, i) => (
          <g key={i}>
            <line
              x1={MARGIN}
              y1={MARGIN + i * CELL}
              x2={MARGIN + (BOARD_SIZE - 1) * CELL}
              y2={MARGIN + i * CELL}
              stroke="#7A5A20"
              strokeWidth={0.8}
            />
            <line
              x1={MARGIN + i * CELL}
              y1={MARGIN}
              x2={MARGIN + i * CELL}
              y2={MARGIN + (BOARD_SIZE - 1) * CELL}
              stroke="#7A5A20"
              strokeWidth={0.8}
            />
          </g>
        ))}

        {/* Star points */}
        {STAR_POINTS.map((pos) => {
          const [x, y] = posToXY(pos);
          return <circle key={pos} cx={x} cy={y} r={3.5} fill="#7A5A20" />;
        })}

        {/* Ko point indicator */}
        {koPoint !== null && (
          (() => {
            const [x, y] = posToXY(koPoint);
            return (
              <rect
                x={x - 8}
                y={y - 8}
                width={16}
                height={16}
                fill="none"
                stroke="#E08020"
                strokeWidth={1.5}
                rx={2}
              />
            );
          })()
        )}

        {/* Hover ghost stone */}
        {hoverPos !== null && canPlay && (
          (() => {
            const [x, y] = posToXY(hoverPos);
            return (
              <circle
                cx={x}
                cy={y}
                r={CELL / 2 - 3}
                fill={myColor === 1 ? 'rgba(20,20,20,0.4)' : 'rgba(240,240,230,0.5)'}
                stroke={myColor === 1 ? 'rgba(20,20,20,0.6)' : 'rgba(200,200,190,0.7)'}
                strokeWidth={1}
                style={{ pointerEvents: 'none' }}
              />
            );
          })()
        )}

        {/* Stones */}
        {grid.map((color, pos) => {
          if (color === 0) return null;
          const [x, y] = posToXY(pos);
          const isBlack = color === 1;
          const isLast = pos === lastMovePos;
          return (
            <g key={pos}>
              <circle
                cx={x}
                cy={y}
                r={CELL / 2 - 2}
                fill={isBlack ? '#1A1A1A' : '#F0EDE4'}
                stroke={isBlack ? '#404040' : '#C8C4BC'}
                strokeWidth={1}
                style={{
                  filter: isBlack
                    ? 'drop-shadow(0 2px 3px rgba(0,0,0,0.6))'
                    : 'drop-shadow(0 2px 3px rgba(0,0,0,0.35))',
                }}
              />
              {/* Highlight on white stone */}
              {!isBlack && (
                <ellipse
                  cx={x - CELL * 0.1}
                  cy={y - CELL * 0.12}
                  rx={CELL * 0.12}
                  ry={CELL * 0.08}
                  fill="rgba(255,255,255,0.55)"
                  style={{ pointerEvents: 'none' }}
                />
              )}
              {/* Highlight on black stone */}
              {isBlack && (
                <ellipse
                  cx={x - CELL * 0.1}
                  cy={y - CELL * 0.12}
                  rx={CELL * 0.12}
                  ry={CELL * 0.08}
                  fill="rgba(255,255,255,0.18)"
                  style={{ pointerEvents: 'none' }}
                />
              )}
              {/* Last move marker */}
              {isLast && (
                <circle
                  cx={x}
                  cy={y}
                  r={5}
                  fill={isBlack ? 'rgba(255,255,255,0.5)' : 'rgba(0,0,0,0.35)'}
                  style={{ pointerEvents: 'none' }}
                />
              )}
            </g>
          );
        })}
      </svg>

      {/* Pass button */}
      {canPlay && (
        <button
          onClick={() => emitMove(GO_PASS)}
          className="px-4 py-1.5 rounded text-sm font-medium"
          style={{
            background: 'rgba(80,60,40,0.4)',
            color: '#B0A090',
            border: '1px solid rgba(120,90,60,0.4)',
          }}
        >
          Pass
        </button>
      )}
    </div>
  );
}

export function GoPiecePreview({ playerNumber, size = 20 }: { playerNumber: 0 | 1; size?: number }) {
  const isBlack = playerNumber === 0;
  return (
    <svg viewBox="0 0 20 20" width={size} height={size}>
      <circle
        cx="10"
        cy="10"
        r="8"
        fill={isBlack ? '#1A1A1A' : '#F0EDE4'}
        stroke={isBlack ? '#404040' : '#C8C4BC'}
        strokeWidth="1"
      />
      {!isBlack && (
        <ellipse cx="8" cy="7.5" rx="2.5" ry="1.5" fill="rgba(255,255,255,0.55)" />
      )}
    </svg>
  );
}
