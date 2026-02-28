import { useEffect } from 'react';
import { Session, GameState, PiecePosition } from '@ancient-games/shared';
import { socketService } from '../../../services/socket';

// ── Layout constants ──────────────────────────────────────────────────────────
const PIT_W = 62;
const PIT_H = 62;
const STORE_W = 68;
const STORE_H = PIT_H * 2 + 12; // spans both rows
const GAP = 10;
const PAD = 18;

const P0_ROW_Y = PAD + PIT_H + GAP; // bottom row
const P1_ROW_Y = PAD;               // top row
const STORE_Y = PAD;
const P1_STORE_X = PAD;
const P0_STORE_X = PAD + STORE_W + GAP + 6 * (PIT_W + GAP);
const SVG_W = P0_STORE_X + STORE_W + PAD;
const SVG_H = PAD + STORE_H + PAD;

// ── Colors ───────────────────────────────────────────────────────────────────
const BOARD_BG = '#5C3010';
const PIT_FILL = '#3A1A06';
const PIT_STROKE = '#7A4A20';
const P0_COLOR = '#C0622A';
const P1_COLOR = '#4A7A9B';
const SEED_COLOR = '#E8C870';
const HIGHLIGHT = 'rgba(255,220,80,0.55)';
const HIGHLIGHT_STROKE = '#FFD840';

// ── Helpers ───────────────────────────────────────────────────────────────────
function getSeeds(pieces: PiecePosition[], pitIndex: number): number {
  return pieces.find((p) => p.pieceIndex === pitIndex)?.position ?? 0;
}

/** Render seed count as dots (up to 12) or a plain number */
function SeedDisplay({
  count,
  cx,
  cy,
  r,
}: {
  count: number;
  cx: number;
  cy: number;
  r: number;
}) {
  if (count === 0) return null;

  if (count <= 12) {
    // Arrange dots in a grid inside the pit
    const dotR = Math.min(6, (r * 0.9) / Math.ceil(Math.sqrt(count)));
    const cols = count <= 4 ? 2 : count <= 9 ? 3 : 4;
    const rows = Math.ceil(count / cols);
    const spacingX = (r * 1.4) / cols;
    const spacingY = (r * 1.4) / rows;
    const startX = cx - (spacingX * (cols - 1)) / 2;
    const startY = cy - (spacingY * (rows - 1)) / 2;
    const dots = [];
    for (let i = 0; i < count; i++) {
      const col = i % cols;
      const row = Math.floor(i / cols);
      dots.push(
        <circle
          key={i}
          cx={startX + col * spacingX}
          cy={startY + row * spacingY}
          r={dotR}
          fill={SEED_COLOR}
          opacity={0.85}
        />,
      );
    }
    return <>{dots}</>;
  }

  // Large number for big counts
  return (
    <text
      x={cx}
      y={cy + 6}
      textAnchor="middle"
      fontSize={20}
      fontWeight="bold"
      fill={SEED_COLOR}
      style={{ userSelect: 'none' }}
    >
      {count}
    </text>
  );
}

// ── Piece preview export ──────────────────────────────────────────────────────
export function MancalaPiecePreview({
  playerNumber,
  size = 20,
}: {
  playerNumber: 0 | 1;
  size?: number;
}) {
  const color = playerNumber === 0 ? P0_COLOR : P1_COLOR;
  const r = size * 0.38;
  const cx = size / 2;
  const cy = size / 2;
  return (
    <svg viewBox={`0 0 ${size} ${size}`} width={size} height={size}>
      <rect
        x={size * 0.1}
        y={size * 0.1}
        width={size * 0.8}
        height={size * 0.8}
        rx={size * 0.18}
        fill={color}
        opacity={0.9}
      />
      <circle cx={cx} cy={cy} r={r} fill={SEED_COLOR} opacity={0.8} />
    </svg>
  );
}

// ── Main board ────────────────────────────────────────────────────────────────
interface MancalaBoardProps {
  session: Session;
  gameState: GameState;
  playerId: string;
  isMyTurn: boolean;
  animatingPiece?: { playerNumber: number; pieceIndex: number } | null;
}

export default function MancalaBoard({
  session,
  gameState,
  playerId,
  isMyTurn,
}: MancalaBoardProps) {
  const { board } = gameState;

  const myPlayer = session.players.find((p) => p.id === playerId);
  const myPlayerNumber = myPlayer?.playerNumber ?? -1;

  // Auto-roll: no dice in Mancala, just trigger the turn gate
  useEffect(() => {
    if (!isMyTurn || board.diceRoll !== null || gameState.finished) return;
    socketService.getSocket()?.emit('game:roll-dice', {
      sessionCode: session.sessionCode,
      playerId,
    });
  }, [isMyTurn, board.diceRoll, session.sessionCode, playerId, gameState.finished]);

  function handlePitClick(pitIndex: number) {
    if (!isMyTurn || board.diceRoll === null || gameState.finished) return;
    const ownPits = myPlayerNumber === 0 ? [0, 1, 2, 3, 4, 5] : [7, 8, 9, 10, 11, 12];
    if (!ownPits.includes(pitIndex)) return;
    if (getSeeds(board.pieces, pitIndex) === 0) return;

    socketService.getSocket()?.emit('game:move', {
      sessionCode: session.sessionCode,
      playerId,
      move: { playerId, pieceIndex: pitIndex, from: pitIndex, to: 0, diceRoll: board.diceRoll },
    });
  }

  const canClick =
    isMyTurn && board.diceRoll !== null && !gameState.finished;

  function pitProps(pitIndex: number, isOwn: boolean) {
    const isEmpty = getSeeds(board.pieces, pitIndex) === 0;
    const clickable = canClick && isOwn && !isEmpty;
    return {
      style: { cursor: clickable ? 'pointer' : 'default' },
      onClick: () => handlePitClick(pitIndex),
    };
  }

  // ── SVG rendering ────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col items-center gap-3 p-2 select-none">
      {/* Player labels */}
      <div className="flex w-full justify-between text-xs px-1" style={{ maxWidth: SVG_W }}>
        <span style={{ color: P1_COLOR }} className="font-semibold">
          {session.players.find((p) => p.playerNumber === 1)?.displayName ?? 'Player 2'}
        </span>
        <span style={{ color: P0_COLOR }} className="font-semibold">
          {session.players.find((p) => p.playerNumber === 0)?.displayName ?? 'Player 1'}
        </span>
      </div>

      <svg
        viewBox={`0 0 ${SVG_W} ${SVG_H}`}
        width="100%"
        style={{ maxWidth: SVG_W, display: 'block' }}
      >
        {/* Board background */}
        <rect
          x={0}
          y={0}
          width={SVG_W}
          height={SVG_H}
          rx={18}
          fill={BOARD_BG}
          stroke="rgba(255,200,100,0.15)"
          strokeWidth={1.5}
        />

        {/* ── P1 Store (left, pit 13) ── */}
        <StoreCell
          x={P1_STORE_X}
          y={STORE_Y}
          w={STORE_W}
          h={STORE_H}
          seeds={getSeeds(board.pieces, 13)}
          color={P1_COLOR}
          label="←"
        />

        {/* ── P0 Store (right, pit 6) ── */}
        <StoreCell
          x={P0_STORE_X}
          y={STORE_Y}
          w={STORE_W}
          h={STORE_H}
          seeds={getSeeds(board.pieces, 6)}
          color={P0_COLOR}
          label="→"
        />

        {/* ── P1 pits (top row, pits 7-12, displayed 12→7 left to right) ── */}
        {[12, 11, 10, 9, 8, 7].map((pitIndex) => {
          const slot = 12 - pitIndex;
          const x = PAD + STORE_W + GAP + slot * (PIT_W + GAP);
          const isOwn = myPlayerNumber === 1;
          const clickable = canClick && isOwn && getSeeds(board.pieces, pitIndex) > 0;
          return (
            <PitCell
              key={pitIndex}
              x={x}
              y={P1_ROW_Y}
              w={PIT_W}
              h={PIT_H}
              seeds={getSeeds(board.pieces, pitIndex)}
              highlight={clickable}
              {...pitProps(pitIndex, isOwn)}
            />
          );
        })}

        {/* ── P0 pits (bottom row, pits 0-5 left to right) ── */}
        {[0, 1, 2, 3, 4, 5].map((pitIndex) => {
          const x = PAD + STORE_W + GAP + pitIndex * (PIT_W + GAP);
          const isOwn = myPlayerNumber === 0;
          const clickable = canClick && isOwn && getSeeds(board.pieces, pitIndex) > 0;
          return (
            <PitCell
              key={pitIndex}
              x={x}
              y={P0_ROW_Y}
              w={PIT_W}
              h={PIT_H}
              seeds={getSeeds(board.pieces, pitIndex)}
              highlight={clickable}
              {...pitProps(pitIndex, isOwn)}
            />
          );
        })}

        {/* Arrow hints showing sow direction */}
        <text
          x={PAD + STORE_W + GAP + 2.5 * (PIT_W + GAP)}
          y={SVG_H / 2 + 4}
          textAnchor="middle"
          fontSize={11}
          fill="rgba(255,200,100,0.25)"
          style={{ userSelect: 'none', pointerEvents: 'none' }}
        >
          ← P1 sows this way · P0 sows this way →
        </text>
      </svg>

      {/* Turn status */}
      {!gameState.finished && (
        <div className="text-xs" style={{ color: 'rgba(200,160,80,0.7)' }}>
          {isMyTurn
            ? board.diceRoll !== null
              ? 'Your turn — choose a pit to sow'
              : 'Your turn…'
            : 'Waiting for opponent…'}
        </div>
      )}
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────
function PitCell({
  x,
  y,
  w,
  h,
  seeds,
  highlight,
  style,
  onClick,
}: {
  x: number;
  y: number;
  w: number;
  h: number;
  seeds: number;
  highlight: boolean;
  style?: React.CSSProperties;
  onClick?: () => void;
}) {
  const cx = x + w / 2;
  const cy = y + h / 2;
  const r = Math.min(w, h) / 2 - 4;
  return (
    <g style={style} onClick={onClick}>
      <rect
        x={x}
        y={y}
        width={w}
        height={h}
        rx={10}
        fill={highlight ? HIGHLIGHT : PIT_FILL}
        stroke={highlight ? HIGHLIGHT_STROKE : PIT_STROKE}
        strokeWidth={highlight ? 2 : 1}
      />
      <SeedDisplay count={seeds} cx={cx} cy={cy} r={r} />
    </g>
  );
}

function StoreCell({
  x,
  y,
  w,
  h,
  seeds,
  color,
  label,
}: {
  x: number;
  y: number;
  w: number;
  h: number;
  seeds: number;
  color: string;
  label: string;
}) {
  const cx = x + w / 2;
  const cy = y + h / 2;
  const r = Math.min(w, h * 0.45) / 2 - 2;
  return (
    <g>
      <rect
        x={x}
        y={y}
        width={w}
        height={h}
        rx={14}
        fill={PIT_FILL}
        stroke={color}
        strokeWidth={1.5}
        opacity={0.9}
      />
      {/* Colored accent strip */}
      <rect x={x + 2} y={y + 2} width={4} height={h - 4} rx={3} fill={color} opacity={0.5} />
      <SeedDisplay count={seeds} cx={cx + 3} cy={cy} r={r} />
      <text
        x={cx + 3}
        y={y + h - 8}
        textAnchor="middle"
        fontSize={9}
        fill={color}
        opacity={0.6}
        style={{ userSelect: 'none' }}
      >
        {label}
      </text>
    </g>
  );
}
