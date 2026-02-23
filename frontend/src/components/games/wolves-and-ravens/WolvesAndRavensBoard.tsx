import { memo, useEffect, useState } from 'react';
import { Session, GameState, Move, PiecePosition } from '@ancient-games/shared';
import { socketService } from '../../../services/socket';

// ── Board geometry ─────────────────────────────────────────────────────────────
const BOARD_SIZE = 7;
const CELL = 56;
const PAD = 20;
const SVG_SIZE = BOARD_SIZE * CELL + 2 * PAD; // 432

function posToRC(pos: number): [number, number] {
  return [Math.floor(pos / BOARD_SIZE), pos % BOARD_SIZE];
}

function rcToPos(row: number, col: number): number {
  return row * BOARD_SIZE + col;
}

function cellCx(col: number): number { return col * CELL + PAD + CELL / 2; }
function cellCy(row: number): number { return row * CELL + PAD + CELL / 2; }

// ── Move helpers ───────────────────────────────────────────────────────────────
const DIRECTIONS: [number, number][] = [
  [-1, 0], [1, 0], [0, -1], [0, 1],
  [-1, -1], [-1, 1], [1, -1], [1, 1],
];

function wolfValidDestinations(
  wolfPos: number,
  pieces: PiecePosition[],
  diceRoll: number
): Set<number> {
  const valid = new Set<number>();
  const [wr, wc] = posToRC(wolfPos);

  for (const [dr, dc] of DIRECTIONS) {
    for (let dist = 1; dist <= diceRoll; dist++) {
      const tr = wr + dr * dist;
      const tc = wc + dc * dist;
      if (tr < 0 || tr >= BOARD_SIZE || tc < 0 || tc >= BOARD_SIZE) break;
      const to = rcToPos(tr, tc);

      let blocked = false;
      for (let step = 1; step < dist; step++) {
        const inter = rcToPos(wr + dr * step, wc + dc * step);
        if (pieces.some(p => p.position === inter)) { blocked = true; break; }
      }
      if (blocked) break;

      valid.add(to);
    }
  }
  return valid;
}

function ravenValidDestinations(ravenPos: number, pieces: PiecePosition[]): Set<number> {
  const valid = new Set<number>();
  const [fr, fc] = posToRC(ravenPos);

  for (const [dr, dc] of DIRECTIONS) {
    const tr = fr + dr;
    const tc = fc + dc;
    if (tr < 0 || tr >= BOARD_SIZE || tc < 0 || tc >= BOARD_SIZE) continue;
    const to = rcToPos(tr, tc);
    if (!pieces.some(p => p.position === to)) valid.add(to);
  }
  return valid;
}

// ── Component ─────────────────────────────────────────────────────────────────

interface Props {
  session: Session;
  gameState: GameState;
  playerId: string;
  isMyTurn: boolean;
}

function WolvesAndRavensBoard({ session, gameState, playerId, isMyTurn }: Props) {
  const [selectedRaven, setSelectedRaven] = useState<PiecePosition | null>(null);
  const [flashCell, setFlashCell] = useState<number | null>(null);

  const myPlayer = session.players.find(p => p.id === playerId);
  const myPN = myPlayer?.playerNumber ?? 0;

  const board = gameState.board;
  const pieces = board.pieces;
  const diceRoll = board.diceRoll;
  const sessionCode = session.sessionCode;

  // Derive wolf/raven player numbers from piece counts (wolf = 1 piece, ravens = 8 pieces)
  const wolfPN = pieces.filter(p => p.playerNumber === 0).length === 1 ? 0 : 1;
  const ravenPN = 1 - wolfPN;

  const wolf = pieces.find(p => p.playerNumber === wolfPN)!;
  const ravens = pieces.filter(p => p.playerNumber === ravenPN);
  const aliveRavens = ravens.filter(p => p.position !== 99);
  const capturedCount = ravens.filter(p => p.position === 99).length;

  // Clear raven selection on turn change or dice reset
  useEffect(() => {
    setSelectedRaven(null);
  }, [board.currentTurn, board.diceRoll === null]);

  // Valid move sets
  const wolfMoves =
    isMyTurn && myPN === wolfPN && diceRoll !== null
      ? wolfValidDestinations(wolf.position, pieces, diceRoll)
      : new Set<number>();

  const ravenMoves =
    isMyTurn && myPN === ravenPN && selectedRaven && diceRoll !== null && diceRoll > 0
      ? ravenValidDestinations(selectedRaven.position, pieces)
      : new Set<number>();

  // Flash a cell red on invalid click
  const flash = (pos: number) => {
    setFlashCell(pos);
    setTimeout(() => setFlashCell(null), 500);
  };

  const handleCellClick = (pos: number) => {
    if (!isMyTurn || diceRoll === null || gameState.finished) return;
    const socket = socketService.getSocket();
    if (!socket) return;

    const pieceAt = pieces.find(p => p.position === pos);

    if (myPN === wolfPN) {
      // ── Wolf player ──
      if (wolfMoves.has(pos)) {
        const move: Move = { playerId, pieceIndex: 0, from: wolf.position, to: pos };
        socket.emit('game:move', { sessionCode, playerId, move });
      } else if (pos !== wolf.position) {
        flash(pos);
      }
    } else {
      // ── Raven player ──
      if (diceRoll <= 0) return;

      // Clicking own raven selects it
      if (pieceAt?.playerNumber === ravenPN) {
        setSelectedRaven(pieceAt);
        return;
      }

      // Clicking valid destination moves selected raven
      if (selectedRaven && ravenMoves.has(pos)) {
        const move: Move = {
          playerId,
          pieceIndex: selectedRaven.pieceIndex,
          from: selectedRaven.position,
          to: pos,
        };
        socket.emit('game:move', { sessionCode, playerId, move });
        setSelectedRaven(null);
        return;
      }

      if (pos !== selectedRaven?.position) flash(pos);
    }
  };

  // ── Status text ───────────────────────────────────────────────────────────
  const turnPlayerName = session.players.find(p => p.playerNumber === board.currentTurn)?.displayName ?? 'Opponent';
  let statusText = '';
  if (gameState.finished) {
    statusText = gameState.winner === myPN ? 'You win!' : 'You lose';
  } else if (!isMyTurn) {
    statusText = `${turnPlayerName}'s turn…`;
  } else if (diceRoll === null) {
    statusText = myPN === wolfPN ? 'Roll to hunt' : 'Roll to move your flock';
  } else if (myPN === wolfPN) {
    statusText = `Rolled ${diceRoll} — click a glowing cell to move`;
  } else {
    const plural = diceRoll !== 1 ? 'moves' : 'move';
    statusText = selectedRaven
      ? `${diceRoll} ${plural} left — click a green cell`
      : `${diceRoll} ${plural} left — select a raven`;
  }

  // ── Surround threat indicator (3 of N orthogonal neighbors blocked) ───────
  const [wr, wc] = posToRC(wolf.position);
  const orthNeighbors = (
    [[wr - 1, wc], [wr + 1, wc], [wr, wc - 1], [wr, wc + 1]] as [number, number][]
  ).filter(([r, c]) => r >= 0 && r < BOARD_SIZE && c >= 0 && c < BOARD_SIZE)
    .map(([r, c]) => rcToPos(r, c));

  const blockedNeighbors = orthNeighbors.filter(p =>
    pieces.some(raven => raven.playerNumber === ravenPN && raven.position === p)
  ).length;
  const wolfThreatened = !gameState.finished && blockedNeighbors >= orthNeighbors.length - 1 && orthNeighbors.length > 0;

  return (
    <div className="flex flex-col items-center gap-3">
      {/* Status bar */}
      <div
        className="w-full text-center text-sm font-semibold py-2 px-4 rounded-lg"
        style={{
          background: isMyTurn ? 'rgba(30,20,10,0.7)' : 'rgba(15,10,5,0.6)',
          border: `1px solid ${isMyTurn ? 'rgba(196,140,30,0.45)' : 'rgba(50,40,30,0.4)'}`,
          color: isMyTurn ? '#F0D090' : '#6A5A40',
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
        <rect x={0} y={0} width={SVG_SIZE} height={SVG_SIZE} rx={10} fill="#080E06" />

        {/* Cells */}
        {Array.from({ length: BOARD_SIZE }, (_, row) =>
          Array.from({ length: BOARD_SIZE }, (_, col) => {
            const pos = rcToPos(row, col);
            const isLight = (row + col) % 2 === 0;
            const isWolfCell = wolf.position === pos;
            const isWolfDest = wolfMoves.has(pos);
            const isRavenDest = ravenMoves.has(pos);
            const isSelectedRaven = selectedRaven?.position === pos;
            const isFlash = flashCell === pos;

            let fill = isLight ? 'rgba(25,40,18,0.7)' : 'rgba(16,26,11,0.7)';
            if (isWolfCell) fill = 'rgba(100,65,8,0.5)';

            return (
              <g
                key={pos}
                onClick={() => handleCellClick(pos)}
                style={{ cursor: isMyTurn && !gameState.finished ? 'pointer' : 'default' }}
              >
                {/* Cell background */}
                <rect
                  x={col * CELL + PAD}
                  y={row * CELL + PAD}
                  width={CELL}
                  height={CELL}
                  fill={fill}
                  stroke={isFlash ? 'rgba(239,68,68,0.9)' : 'rgba(35,55,25,0.6)'}
                  strokeWidth={isFlash ? 2 : 0.5}
                  rx={1}
                />

                {/* Wolf valid destination glow */}
                {isWolfDest && (
                  <rect
                    x={col * CELL + PAD + 3}
                    y={row * CELL + PAD + 3}
                    width={CELL - 6}
                    height={CELL - 6}
                    fill="rgba(212,155,20,0.12)"
                    stroke="rgba(212,155,20,0.65)"
                    strokeWidth={1.5}
                    rx={2}
                  >
                    <animate attributeName="opacity" values="0.55;1;0.55" dur="1.3s" repeatCount="indefinite" />
                  </rect>
                )}

                {/* Raven valid destination glow */}
                {isRavenDest && (
                  <rect
                    x={col * CELL + PAD + 3}
                    y={row * CELL + PAD + 3}
                    width={CELL - 6}
                    height={CELL - 6}
                    fill="rgba(80,195,80,0.1)"
                    stroke="rgba(80,195,80,0.65)"
                    strokeWidth={1.5}
                    rx={2}
                  >
                    <animate attributeName="opacity" values="0.5;1;0.5" dur="1s" repeatCount="indefinite" />
                  </rect>
                )}

                {/* Selected raven border */}
                {isSelectedRaven && (
                  <rect
                    x={col * CELL + PAD + 2}
                    y={row * CELL + PAD + 2}
                    width={CELL - 4}
                    height={CELL - 4}
                    fill="none"
                    stroke="rgba(100,225,100,0.9)"
                    strokeWidth={2}
                    rx={2}
                  />
                )}
              </g>
            );
          })
        )}

        {/* Grid lines overlay (subtle) */}
        {Array.from({ length: BOARD_SIZE + 1 }, (_, i) => (
          <g key={`grid-${i}`}>
            <line
              x1={PAD + i * CELL} y1={PAD}
              x2={PAD + i * CELL} y2={PAD + BOARD_SIZE * CELL}
              stroke="rgba(40,65,30,0.4)" strokeWidth={0.5}
            />
            <line
              x1={PAD} y1={PAD + i * CELL}
              x2={PAD + BOARD_SIZE * CELL} y2={PAD + i * CELL}
              stroke="rgba(40,65,30,0.4)" strokeWidth={0.5}
            />
          </g>
        ))}

        {/* Wolf piece */}
        {(() => {
          const cx = cellCx(wc);
          const cy = cellCy(wr);
          return (
            <g key="wolf" style={{ pointerEvents: 'none' }}>
              {/* Threat glow */}
              {wolfThreatened && (
                <circle cx={cx} cy={cy} r={26} fill="rgba(239,68,68,0.15)">
                  <animate attributeName="r" values="22;28;22" dur="1s" repeatCount="indefinite" />
                  <animate attributeName="opacity" values="0.5;0.9;0.5" dur="1s" repeatCount="indefinite" />
                </circle>
              )}
              {/* Ambient glow */}
              <circle cx={cx} cy={cy} r={22} fill="rgba(200,130,15,0.18)" />
              {/* Body */}
              <circle
                cx={cx} cy={cy} r={19}
                fill="url(#wolfGrad)"
                stroke="#E8B020"
                strokeWidth={2}
                style={{ filter: 'drop-shadow(0 3px 8px rgba(200,140,10,0.7))' }}
              />
              {/* Symbol */}
              <text
                x={cx} y={cy + 6}
                textAnchor="middle"
                fontSize={16}
                fontWeight="bold"
                fill="#3A2000"
                style={{ fontFamily: 'Georgia, serif', letterSpacing: '-1px' }}
              >
                W
              </text>
            </g>
          );
        })()}

        {/* Raven pieces */}
        {aliveRavens.map(raven => {
          const [rr, rc] = posToRC(raven.position);
          const cx = cellCx(rc);
          const cy = cellCy(rr);
          const isSel = selectedRaven?.pieceIndex === raven.pieceIndex;
          const canSelect = isMyTurn && myPN === ravenPN && diceRoll !== null && diceRoll > 0 && !gameState.finished;

          return (
            <g
              key={`raven-${raven.pieceIndex}`}
              onClick={(e) => {
                e.stopPropagation();
                if (canSelect) setSelectedRaven(raven);
              }}
              style={{ cursor: canSelect ? 'pointer' : 'default' }}
            >
              {/* Body */}
              <circle
                cx={cx} cy={cy} r={15}
                fill="url(#ravenGrad)"
                stroke={isSel ? '#70E070' : 'rgba(160,160,200,0.45)'}
                strokeWidth={isSel ? 2.5 : 1.5}
                style={{ filter: 'drop-shadow(0 2px 5px rgba(0,0,0,0.8))' }}
              />
              {/* Small dot indicator */}
              <circle cx={cx} cy={cy} r={3.5} fill="rgba(200,200,240,0.5)" />
            </g>
          );
        })}

        {/* Gradient defs */}
        <defs>
          <radialGradient id="wolfGrad" cx="40%" cy="35%" r="65%">
            <stop offset="0%" stopColor="#F0B820" />
            <stop offset="100%" stopColor="#9A6008" />
          </radialGradient>
          <radialGradient id="ravenGrad" cx="35%" cy="30%" r="70%">
            <stop offset="0%" stopColor="#2A2A48" />
            <stop offset="100%" stopColor="#0A0A18" />
          </radialGradient>
        </defs>
      </svg>

      {/* Player trays for seated players */}
      {session.players.map((player) => {
        const pn = player.playerNumber;
        const isMe = player.id === playerId;
        return (
          <PlayerTray
            key={player.id}
            name={isMe ? 'You' : player.displayName}
            isWolf={pn === wolfPN}
            capturedCount={pn === wolfPN ? capturedCount : 0}
            aliveRavenCount={pn === ravenPN ? aliveRavens.length : 0}
            isActive={!gameState.finished && gameState.currentTurn === pn}
          />
        );
      })}
    </div>
  );
}

// ── Player info tray ──────────────────────────────────────────────────────────

function PlayerTray({
  name,
  isWolf,
  capturedCount,
  aliveRavenCount,
  isActive,
}: {
  name: string;
  isWolf: boolean;
  capturedCount: number;
  aliveRavenCount: number;
  isActive: boolean;
}) {
  return (
    <div className="flex items-center gap-3 w-full px-1">
      <span
        className="text-xs font-semibold w-16 truncate"
        style={{ color: isActive ? '#F0E6C8' : '#5A4A38' }}
      >
        {name}
      </span>

      {isWolf ? (
        /* Wolf: show 5 capture slots */
        <div className="flex items-center gap-2 flex-1">
          <span className="text-xs" style={{ color: '#7A6A50' }}>Wolf</span>
          <div className="flex gap-1">
            {Array.from({ length: 5 }, (_, i) => (
              <svg key={i} width={14} height={14} viewBox="0 0 14 14">
                <circle
                  cx={7} cy={7} r={5}
                  fill={i < capturedCount ? '#161625' : 'transparent'}
                  stroke={i < capturedCount ? 'rgba(160,160,200,0.7)' : 'rgba(80,80,100,0.3)'}
                  strokeWidth={1.5}
                />
                {i < capturedCount && <circle cx={7} cy={7} r={2} fill="rgba(180,180,220,0.4)" />}
              </svg>
            ))}
          </div>
          <span className="text-xs font-mono" style={{ color: capturedCount >= 4 ? '#D4A017' : '#6A5A40' }}>
            {capturedCount}/5
          </span>
        </div>
      ) : (
        /* Ravens: show alive raven count */
        <div className="flex items-center gap-2 flex-1">
          <span className="text-xs" style={{ color: '#7A6A50' }}>Ravens</span>
          <div className="flex gap-1">
            {Array.from({ length: 8 }, (_, i) => (
              <svg key={i} width={12} height={12} viewBox="0 0 12 12">
                <circle
                  cx={6} cy={6} r={4}
                  fill={i < aliveRavenCount ? '#161625' : 'transparent'}
                  stroke={i < aliveRavenCount ? 'rgba(140,140,180,0.6)' : 'rgba(60,60,80,0.25)'}
                  strokeWidth={1.2}
                />
              </svg>
            ))}
          </div>
          <span className="text-xs font-mono" style={{ color: aliveRavenCount <= 4 ? '#EF6060' : '#6A5A40' }}>
            {aliveRavenCount}/8
          </span>
        </div>
      )}
    </div>
  );
}

export default memo(WolvesAndRavensBoard);
