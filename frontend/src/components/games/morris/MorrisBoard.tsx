import { memo, useEffect, useState } from 'react';
import { Session, GameState } from '@ancient-games/shared';
import { socketService } from '../../../services/socket';

// ── Board geometry ────────────────────────────────────────────────────────────
// 24 positions mapped to a 7×7 virtual grid (col, row), each cell = CELL px.

const CELL = 68;
const PAD = 28;
const SVG_SIZE = 6 * CELL + 2 * PAD;

// [col, row] for each position 0-23
const GRID: [number, number][] = [
  [0, 0], [3, 0], [6, 0],   //  0  1  2
  [1, 1], [3, 1], [5, 1],   //  3  4  5
  [2, 2], [3, 2], [4, 2],   //  6  7  8
  [0, 3], [1, 3], [2, 3],   //  9 10 11
  [4, 3], [5, 3], [6, 3],   // 12 13 14
  [2, 4], [3, 4], [4, 4],   // 15 16 17
  [1, 5], [3, 5], [5, 5],   // 18 19 20
  [0, 6], [3, 6], [6, 6],   // 21 22 23
];

function toSvg(col: number, row: number): [number, number] {
  return [col * CELL + PAD, row * CELL + PAD];
}

const SVG_POS: [number, number][] = GRID.map(([c, r]) => toSvg(c, r));

// ── Game constants (mirrored from backend) ────────────────────────────────────

const ADJACENT: number[][] = [
  [1, 9], [0, 2, 4], [1, 14], [4, 10], [1, 3, 5, 7], [4, 13],
  [7, 11], [4, 6, 8], [7, 12], [0, 10, 21], [3, 9, 11, 18], [6, 10, 15],
  [8, 13, 17], [5, 12, 14, 20], [2, 13, 23], [11, 16], [15, 17, 19], [12, 16],
  [10, 19], [16, 18, 20, 22], [13, 19], [9, 22], [19, 21, 23], [14, 22],
];

const MILLS: number[][] = [
  [0, 1, 2], [2, 14, 23], [21, 22, 23], [0, 9, 21],
  [3, 4, 5], [5, 13, 20], [18, 19, 20], [3, 10, 18],
  [6, 7, 8], [8, 12, 17], [15, 16, 17], [6, 11, 15],
  [1, 4, 7], [14, 13, 12], [22, 19, 16], [9, 10, 11],
];

// ── Board line edges (pairs of adjacent position indices, i < j) ──────────────
const EDGES: [number, number][] = [];
for (let i = 0; i < 24; i++) {
  for (const j of ADJACENT[i]) {
    if (j > i) EDGES.push([i, j]);
  }
}

// ── Player colours ────────────────────────────────────────────────────────────
const PLAYER_COLOR = ['#3B82F6', '#EF4444']; // blue / red

// ── Helper functions (pure, no board state side-effects) ─────────────────────

function getPhase(pieces: { playerNumber: number; position: number }[], pn: number): 1 | 2 | 3 {
  const unplaced = pieces.filter(p => p.playerNumber === pn && p.position === -1).length;
  if (unplaced > 0) return 1;
  const onBoard = pieces.filter(p => p.playerNumber === pn && p.position >= 0 && p.position <= 23).length;
  return onBoard === 3 ? 3 : 2;
}

function isInMill(pieces: { playerNumber: number; position: number }[], pos: number, pn: number): boolean {
  return MILLS.some(
    mill => mill.includes(pos) && mill.every(p => pieces.some(x => x.playerNumber === pn && x.position === p))
  );
}

// ── Props ─────────────────────────────────────────────────────────────────────

interface MorrisBoardProps {
  session: Session;
  gameState: GameState;
  playerId: string;
  isMyTurn: boolean;
}

// ── Component ─────────────────────────────────────────────────────────────────

function MorrisBoard({ session, gameState, playerId, isMyTurn }: MorrisBoardProps) {
  const [selected, setSelected] = useState<{ pieceIndex: number; from: number } | null>(null);

  const myPlayer = session.players.find(p => p.id === playerId);
  const myPN = myPlayer?.playerNumber ?? 0;
  const opponentPN = 1 - myPN;

  const board = gameState.board;
  const pieces = board.pieces;
  const diceRoll = board.diceRoll;

  const sessionCode = session.sessionCode;

  // ── Auto-roll (Morris has no real dice) ────────────────────────────────────
  useEffect(() => {
    if (!isMyTurn || diceRoll !== null) return;
    const socket = socketService.getSocket();
    if (socket) socket.emit('game:roll-dice', { sessionCode, playerId });
  }, [isMyTurn, diceRoll, sessionCode, playerId]);

  // Clear selection whenever it's no longer our turn or a removal phase starts
  useEffect(() => {
    if (!isMyTurn || diceRoll === 2) setSelected(null);
  }, [isMyTurn, diceRoll]);

  // ── Derived state ──────────────────────────────────────────────────────────
  const phase = getPhase(pieces, myPN);
  const occupied = new Set(pieces.filter(p => p.position >= 0 && p.position <= 23).map(p => p.position));

  // Positions that can be clicked as destinations / removal targets this turn
  const validTargets = new Set<number>();

  if (isMyTurn && diceRoll === 2) {
    // Removal mode
    const opponentOnBoard = pieces.filter(p => p.playerNumber === opponentPN && p.position >= 0 && p.position <= 23);
    const notInMill = opponentOnBoard.filter(p => !isInMill(pieces, p.position, opponentPN));
    const removable = notInMill.length > 0 ? notInMill : opponentOnBoard;
    removable.forEach(p => validTargets.add(p.position));
  } else if (isMyTurn && diceRoll === 1) {
    if (phase === 1) {
      for (let i = 0; i < 24; i++) if (!occupied.has(i)) validTargets.add(i);
    } else if (selected) {
      if (phase === 2) {
        ADJACENT[selected.from].filter(p => !occupied.has(p)).forEach(p => validTargets.add(p));
      } else {
        for (let i = 0; i < 24; i++) if (!occupied.has(i)) validTargets.add(i);
      }
    }
  }

  // Mill highlighting — all positions that are part of a mill
  const millPositions = new Set<number>();
  for (let pos = 0; pos < 24; pos++) {
    const p = pieces.find(x => x.position === pos);
    if (p && isInMill(pieces, pos, p.playerNumber)) millPositions.add(pos);
  }

  // ── Click handler ──────────────────────────────────────────────────────────
  const handleClick = (pos: number) => {
    if (!isMyTurn || diceRoll === null) return;
    const socket = socketService.getSocket();
    if (!socket) return;

    const pieceAtPos = pieces.find(p => p.position === pos);

    // ─ Removal phase ─
    if (diceRoll === 2) {
      if (!validTargets.has(pos) || !pieceAtPos) return;
      socket.emit('game:move', {
        sessionCode,
        playerId,
        move: { playerId, pieceIndex: pieceAtPos.pieceIndex, from: pos, to: 99 },
      });
      return;
    }

    // ─ Normal move phase ─
    if (diceRoll !== 1) return;

    if (phase === 1) {
      if (pieceAtPos) return; // occupied
      const unplaced = pieces.find(p => p.playerNumber === myPN && p.position === -1);
      if (!unplaced) return;
      socket.emit('game:move', {
        sessionCode,
        playerId,
        move: { playerId, pieceIndex: unplaced.pieceIndex, from: -1, to: pos },
      });
      return;
    }

    // Phase 2 / 3
    if (pieceAtPos && pieceAtPos.playerNumber === myPN) {
      // Select / re-select own piece
      setSelected({ pieceIndex: pieceAtPos.pieceIndex, from: pos });
      return;
    }

    if (selected && validTargets.has(pos)) {
      socket.emit('game:move', {
        sessionCode,
        playerId,
        move: { playerId, pieceIndex: selected.pieceIndex, from: selected.from, to: pos },
      });
      setSelected(null);
    }
  };

  // ── Status bar text ───────────────────────────────────────────────────────
  const unplacedMy = pieces.filter(p => p.playerNumber === myPN && p.position === -1).length;
  const opponent = session.players.find(p => p.id !== playerId);

  let statusText = '';
  if (!isMyTurn) {
    statusText = `Waiting for ${opponent?.displayName ?? 'opponent'}…`;
  } else if (diceRoll === null) {
    statusText = 'Preparing…';
  } else if (diceRoll === 2) {
    statusText = 'Mill! Remove an opponent piece';
  } else if (phase === 1) {
    statusText = `Place a piece (${unplacedMy} remaining)`;
  } else if (phase === 3) {
    statusText = 'Your pieces can fly anywhere';
  } else {
    statusText = selected ? 'Click a highlighted spot to move' : 'Select a piece to move';
  }

  // ── Piece counts (used by trays below the board) ──────────────────────────

  return (
    <div className="flex flex-col items-center gap-3">
      {/* Status bar */}
      <div
        className="w-full text-center text-sm font-semibold py-2 px-4 rounded-lg"
        style={{
          background: diceRoll === 2 ? 'rgba(251,191,36,0.15)' : 'rgba(30,20,10,0.6)',
          border: `1px solid ${diceRoll === 2 ? 'rgba(251,191,36,0.5)' : 'rgba(80,60,30,0.4)'}`,
          color: diceRoll === 2 ? '#FBD024' : isMyTurn ? '#F0E6C8' : '#8A7A60',
        }}
      >
        {statusText}
      </div>


      {/* SVG Board */}
      <svg
        viewBox={`0 0 ${SVG_SIZE} ${SVG_SIZE}`}
        width="100%"
        style={{ maxWidth: SVG_SIZE, userSelect: 'none' }}
      >
        {/* Board background */}
        <rect x={0} y={0} width={SVG_SIZE} height={SVG_SIZE} rx={12} fill="rgba(18,12,4,0.85)" />

        {/* Board lines */}
        {EDGES.map(([a, b]) => {
          const [x1, y1] = SVG_POS[a];
          const [x2, y2] = SVG_POS[b];
          return (
            <line
              key={`${a}-${b}`}
              x1={x1} y1={y1} x2={x2} y2={y2}
              stroke="rgba(140,110,60,0.6)"
              strokeWidth={2}
            />
          );
        })}

        {/* Position nodes */}
        {Array.from({ length: 24 }, (_, pos) => {
          const [cx, cy] = SVG_POS[pos];
          const piece = pieces.find(p => p.position === pos);
          const isSelected = selected?.from === pos;
          const isValidTarget = validTargets.has(pos);
          const inMill = millPositions.has(pos);
          const isRemovable = diceRoll === 2 && validTargets.has(pos);

          return (
            <g key={pos} onClick={() => handleClick(pos)} style={{ cursor: isMyTurn ? 'pointer' : 'default' }}>
              {/* Valid destination pulse ring */}
              {isValidTarget && !piece && (
                <circle cx={cx} cy={cy} r={18} fill="rgba(250,200,50,0.18)" stroke="rgba(250,200,50,0.55)" strokeWidth={1.5}>
                  <animate attributeName="r" values="15;19;15" dur="1.2s" repeatCount="indefinite" />
                  <animate attributeName="opacity" values="0.7;1;0.7" dur="1.2s" repeatCount="indefinite" />
                </circle>
              )}

              {/* Removable opponent piece glow */}
              {isRemovable && piece && (
                <circle cx={cx} cy={cy} r={20} fill="rgba(239,68,68,0.2)" stroke="rgba(239,68,68,0.7)" strokeWidth={1.5}>
                  <animate attributeName="r" values="17;22;17" dur="1s" repeatCount="indefinite" />
                  <animate attributeName="opacity" values="0.6;1;0.6" dur="1s" repeatCount="indefinite" />
                </circle>
              )}

              {/* Mill highlight ring */}
              {inMill && piece && !isSelected && (
                <circle cx={cx} cy={cy} r={17} fill="none" stroke="rgba(251,191,36,0.7)" strokeWidth={2} />
              )}

              {/* Selected piece ring */}
              {isSelected && (
                <circle cx={cx} cy={cy} r={19} fill="none" stroke="rgba(250,210,50,0.95)" strokeWidth={2.5} />
              )}

              {/* Piece circle */}
              {piece ? (
                <circle
                  cx={cx} cy={cy} r={13}
                  fill={PLAYER_COLOR[piece.playerNumber]}
                  stroke={isSelected ? '#FFD700' : inMill ? '#F59E0B' : 'rgba(255,255,255,0.25)'}
                  strokeWidth={isSelected ? 2.5 : 1.5}
                  style={{ filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.7))' }}
                />
              ) : (
                /* Empty intersection dot */
                <circle
                  cx={cx} cy={cy} r={4}
                  fill={isValidTarget ? 'rgba(250,200,50,0.4)' : 'rgba(140,110,60,0.5)'}
                />
              )}
            </g>
          );
        })}
      </svg>

      {/* Piece trays for seated players */}
      {session.players.map((player) => {
        const pn = player.playerNumber;
        const isMe = player.id === playerId;
        const unplaced = pieces.filter(p => p.playerNumber === pn && p.position === -1).length;
        const captured = pieces.filter(p => p.playerNumber === pn && p.position === 99).length;
        return (
          <PieceTray key={player.id} playerNumber={pn} unplaced={unplaced} captured={captured} label={isMe ? 'You' : player.displayName} isMe={isMe} />
        );
      })}
    </div>
  );
}

// ── Piece tray sub-component ──────────────────────────────────────────────────

function PieceTray({
  playerNumber,
  unplaced,
  captured,
  label,
  isMe = false,
}: {
  playerNumber: number;
  unplaced: number;
  captured: number;
  label: string;
  isMe?: boolean;
}) {
  const color = PLAYER_COLOR[playerNumber];
  const total = 9;
  const onBoard = total - unplaced - captured;

  return (
    <div className="flex items-center gap-3 w-full px-1">
      <span className="text-xs font-semibold w-16 truncate" style={{ color: isMe ? '#F0E6C8' : '#8A7A60' }}>
        {label}
      </span>
      <div className="flex gap-1 flex-wrap flex-1">
        {Array.from({ length: total }, (_, i) => {
          const state = i < onBoard ? 'on' : i < onBoard + unplaced ? 'unplaced' : 'captured';
          return (
            <svg key={i} viewBox="0 0 16 16" width={16} height={16}>
              <circle
                cx={8} cy={8} r={6}
                fill={state === 'on' ? color : state === 'unplaced' ? color : 'transparent'}
                fillOpacity={state === 'on' ? 1 : state === 'unplaced' ? 0.35 : 0}
                stroke={state === 'captured' ? 'rgba(255,255,255,0.1)' : color}
                strokeWidth={state === 'captured' ? 1 : 1.5}
                strokeOpacity={state === 'captured' ? 0.15 : 0.8}
                strokeDasharray={state === 'captured' ? '2 2' : undefined}
              />
            </svg>
          );
        })}
      </div>
      {captured > 0 && (
        <span className="text-xs" style={{ color: '#EF4444' }}>
          -{captured}
        </span>
      )}
    </div>
  );
}

export default memo(MorrisBoard);
