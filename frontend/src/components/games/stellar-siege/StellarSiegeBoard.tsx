import { useEffect, useState } from 'react';
import { Session, GameState, PiecePosition } from '@ancient-games/shared';
import { socketService } from '../../../services/socket';

// ── Board geometry ─────────────────────────────────────────────────────────────
const COLS = 6;
const ROWS = 6;
const CELL = 56;
const PAD = 20;
const SVG_SIZE = COLS * CELL + 2 * PAD; // 376

function posToRC(pos: number): [number, number] {
  return [Math.floor(pos / COLS), pos % COLS];
}
function rcToPos(row: number, col: number): number {
  return row * COLS + col;
}
function cellCx(col: number): number { return col * CELL + PAD + CELL / 2; }
function cellCy(row: number): number { return row * CELL + PAD + CELL / 2; }

// Deterministic stars so they don't flicker on re-render
const STARS: [number, number, number][] = [
  [30, 18, 1.2], [88, 52, 0.9], [145, 10, 1.5], [205, 38, 0.8], [265, 14, 1.1],
  [325, 62, 1.0], [48, 100, 0.8], [135, 85, 1.3], [255, 75, 0.9], [345, 95, 1.1],
  [18, 168, 1.0], [315, 155, 0.8], [75, 210, 1.2], [185, 198, 0.9], [295, 188, 1.4],
  [105, 255, 0.8], [225, 245, 1.1], [355, 235, 0.9], [35, 315, 1.3], [155, 325, 0.8],
  [275, 308, 1.0], [362, 342, 0.9], [92, 362, 1.2], [202, 358, 0.8], [322, 372, 1.0],
  [55, 45, 0.7], [295, 125, 1.1], [160, 140, 0.8], [370, 180, 1.3], [240, 290, 0.9],
];

// ── Role derivation ────────────────────────────────────────────────────────────
function getDefenderPN(pieces: PiecePosition[]): number {
  return pieces.filter(p => p.playerNumber === 0).length === 1 ? 0 : 1;
}

// ── Valid move helpers ─────────────────────────────────────────────────────────
function cannonValidDests(cannonPos: number, diceRoll: number): Set<number> {
  const valid = new Set<number>();
  const [, fromCol] = posToRC(cannonPos);
  for (let c = 0; c < COLS; c++) {
    if (Math.abs(c - fromCol) <= diceRoll) valid.add(rcToPos(5, c));
  }
  return valid;
}

function alienValidDests(
  alienPos: number,
  diceRoll: number,
  pieces: PiecePosition[],
  invaderPN: number
): Set<number> {
  const valid = new Set<number>();
  const [fromRow, fromCol] = posToRC(alienPos);
  const newRow = fromRow + 1;
  if (newRow >= ROWS) return valid;
  for (let dc = -(diceRoll - 1); dc <= diceRoll - 1; dc++) {
    const newCol = fromCol + dc;
    if (newCol < 0 || newCol >= COLS) continue;
    const to = rcToPos(newRow, newCol);
    if (pieces.some(p => p.playerNumber === invaderPN && p.position === to)) continue;
    valid.add(to);
  }
  return valid;
}

// ── Component ──────────────────────────────────────────────────────────────────

interface Props {
  session: Session;
  gameState: GameState;
  playerId: string;
  isMyTurn: boolean;
}

export default function StellarSiegeBoard({ session, gameState, playerId, isMyTurn }: Props) {
  const [selectedAlien, setSelectedAlien] = useState<PiecePosition | null>(null);
  const [flashCell, setFlashCell] = useState<number | null>(null);

  const board = gameState.board;
  const pieces = board.pieces;
  const diceRoll = board.diceRoll;
  const sessionCode = session.sessionCode;

  const defenderPN = getDefenderPN(pieces);
  const invaderPN = 1 - defenderPN;
  const myPlayer = session.players.find(p => p.id === playerId);
  const myPN = myPlayer?.playerNumber ?? 0;
  const isDefender = myPN === defenderPN;
  const isInvader = myPN === invaderPN;

  const cannon = pieces.find(p => p.playerNumber === defenderPN && p.pieceIndex === 0);
  const aliens = pieces.filter(p => p.playerNumber === invaderPN);
  const aliveAliens = aliens.filter(p => p.position !== 99);
  const destroyedCount = aliens.length - aliveAliens.length;

  // Clear alien selection when turn changes or dice resets
  useEffect(() => {
    setSelectedAlien(null);
  }, [board.currentTurn, board.diceRoll === null]);

  // Valid move sets
  const validCannonDests: Set<number> =
    isMyTurn && isDefender && diceRoll !== null && cannon
      ? cannonValidDests(cannon.position, diceRoll)
      : new Set();

  const validAlienDests: Set<number> =
    isMyTurn && isInvader && diceRoll !== null && selectedAlien
      ? alienValidDests(selectedAlien.position, diceRoll, pieces, invaderPN)
      : new Set();

  const flash = (pos: number) => {
    setFlashCell(pos);
    setTimeout(() => setFlashCell(null), 400);
  };

  const handleCellClick = (pos: number) => {
    if (!isMyTurn || diceRoll === null || gameState.finished) return;
    const socket = socketService.getSocket();
    if (!socket || !cannon) return;

    const [row] = posToRC(pos);

    if (isDefender) {
      if (row === 5 && validCannonDests.has(pos)) {
        socket.emit('game:move', {
          sessionCode,
          playerId,
          move: { playerId, pieceIndex: 0, from: cannon.position, to: pos, diceRoll },
        });
      } else if (pos !== cannon.position) {
        flash(pos);
      }
    } else {
      // Invader: click alien to select, click valid dest to move
      const alienAt = aliveAliens.find(a => a.position === pos);
      if (alienAt) {
        setSelectedAlien(alienAt);
        return;
      }
      if (selectedAlien && validAlienDests.has(pos)) {
        socket.emit('game:move', {
          sessionCode,
          playerId,
          move: {
            playerId,
            pieceIndex: selectedAlien.pieceIndex,
            from: selectedAlien.position,
            to: pos,
            diceRoll,
          },
        });
        setSelectedAlien(null);
        return;
      }
      if (selectedAlien && pos !== selectedAlien.position) flash(pos);
    }
  };

  // ── Status text ──────────────────────────────────────────────────────────────
  const turnPlayerName = session.players.find(p => p.playerNumber === board.currentTurn)?.displayName ?? 'Opponent';

  let statusText = '';
  if (gameState.finished) {
    statusText = gameState.winner === myPN ? 'Victory!' : 'Defeated!';
  } else if (!isMyTurn) {
    statusText = `${turnPlayerName}'s turn…`;
  } else if (diceRoll === null) {
    statusText = isDefender ? 'Roll to fire' : 'Roll to advance';
  } else if (isDefender) {
    statusText = `Rolled ${diceRoll} — click a column to fire`;
  } else {
    statusText = selectedAlien
      ? `Rolled ${diceRoll} — click a green cell to advance`
      : `Rolled ${diceRoll} — select an alien to move`;
  }

  const isMyActive = isMyTurn && !gameState.finished;

  return (
    <div className="flex flex-col items-center gap-3">
      {/* Status bar */}
      <div
        className="w-full text-center text-sm font-semibold py-2 px-4 rounded-lg"
        style={{
          background: isMyTurn ? 'rgba(0,20,40,0.8)' : 'rgba(0,5,15,0.7)',
          border: `1px solid ${isMyTurn ? (isDefender ? 'rgba(0,180,255,0.4)' : 'rgba(57,255,20,0.35)') : 'rgba(30,50,80,0.4)'}`,
          color: isMyTurn ? (isDefender ? '#80DFFF' : '#7FFF5A') : '#3A5060',
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
        <defs>
          <radialGradient id="ssCannonGrad" cx="40%" cy="30%" r="65%">
            <stop offset="0%" stopColor="#80EEFF" />
            <stop offset="100%" stopColor="#0070A0" />
          </radialGradient>
          <radialGradient id="ssAlienGrad" cx="35%" cy="35%" r="65%">
            <stop offset="0%" stopColor="#0A2A0A" />
            <stop offset="100%" stopColor="#010801" />
          </radialGradient>
          <filter id="ssGlowCyan" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="3" result="blur" />
            <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
          <filter id="ssGlowGreen" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="4" result="blur" />
            <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
        </defs>

        {/* Space background */}
        <rect x={0} y={0} width={SVG_SIZE} height={SVG_SIZE} rx={10} fill="#010810" />

        {/* Stars */}
        {STARS.map(([sx, sy, sr], i) => (
          <circle key={`star-${i}`} cx={sx} cy={sy} r={sr} fill="rgba(255,255,255,0.7)" />
        ))}

        {/* Cells */}
        {Array.from({ length: ROWS }, (_, row) =>
          Array.from({ length: COLS }, (_, col) => {
            const pos = rcToPos(row, col);
            const isBase = row === 5;
            const isCannonDest = validCannonDests.has(pos);
            const isAlienDest = validAlienDests.has(pos);
            const isFlash = flashCell === pos;
            const isSelected = selectedAlien?.position === pos;

            let fill = isBase
              ? 'rgba(0,20,45,0.65)'
              : (row + col) % 2 === 0
              ? 'rgba(2,12,28,0.7)'
              : 'rgba(1,8,20,0.7)';

            return (
              <g
                key={pos}
                onClick={() => handleCellClick(pos)}
                style={{ cursor: isMyActive ? 'pointer' : 'default' }}
              >
                <rect
                  x={col * CELL + PAD}
                  y={row * CELL + PAD}
                  width={CELL}
                  height={CELL}
                  fill={fill}
                  stroke={
                    isFlash ? 'rgba(239,68,68,0.9)'
                    : isBase ? 'rgba(0,80,160,0.4)'
                    : 'rgba(0,30,70,0.4)'
                  }
                  strokeWidth={isFlash ? 2 : 0.5}
                  rx={1}
                />

                {/* Cannon valid dest: cyan column highlight */}
                {isCannonDest && (
                  <rect
                    x={col * CELL + PAD + 3}
                    y={row * CELL + PAD + 3}
                    width={CELL - 6}
                    height={CELL - 6}
                    fill="rgba(0,180,255,0.10)"
                    stroke="rgba(0,200,255,0.65)"
                    strokeWidth={1.5}
                    rx={2}
                  >
                    <animate attributeName="opacity" values="0.5;1;0.5" dur="1.2s" repeatCount="indefinite" />
                  </rect>
                )}

                {/* Alien valid dest: green highlight */}
                {isAlienDest && (
                  <rect
                    x={col * CELL + PAD + 3}
                    y={row * CELL + PAD + 3}
                    width={CELL - 6}
                    height={CELL - 6}
                    fill="rgba(57,255,20,0.08)"
                    stroke="rgba(57,255,20,0.6)"
                    strokeWidth={1.5}
                    rx={2}
                  >
                    <animate attributeName="opacity" values="0.45;1;0.45" dur="1s" repeatCount="indefinite" />
                  </rect>
                )}

                {/* Selected alien ring */}
                {isSelected && (
                  <rect
                    x={col * CELL + PAD + 2}
                    y={row * CELL + PAD + 2}
                    width={CELL - 4}
                    height={CELL - 4}
                    fill="none"
                    stroke="rgba(57,255,20,0.9)"
                    strokeWidth={2}
                    rx={2}
                  />
                )}
              </g>
            );
          })
        )}

        {/* Grid lines */}
        {Array.from({ length: ROWS + 1 }, (_, i) => (
          <g key={`grid-${i}`}>
            <line
              x1={PAD + i * CELL} y1={PAD}
              x2={PAD + i * CELL} y2={PAD + ROWS * CELL}
              stroke="rgba(0,40,100,0.35)" strokeWidth={0.5}
            />
            <line
              x1={PAD} y1={PAD + i * CELL}
              x2={PAD + COLS * CELL} y2={PAD + i * CELL}
              stroke="rgba(0,40,100,0.35)" strokeWidth={0.5}
            />
          </g>
        ))}

        {/* Base line (defender row separator) */}
        <line
          x1={PAD} y1={5 * CELL + PAD}
          x2={COLS * CELL + PAD} y2={5 * CELL + PAD}
          stroke="rgba(0,120,220,0.5)" strokeWidth={1.5} strokeDasharray="6,4"
        />

        {/* Cannon firing column indicator (faint dotted beam from cannon to top) */}
        {cannon && (
          <line
            x1={cellCx(cannon.position % COLS)}
            y1={PAD}
            x2={cellCx(cannon.position % COLS)}
            y2={5 * CELL + PAD}
            stroke="rgba(0,180,255,0.08)"
            strokeWidth={CELL - 4}
          />
        )}

        {/* Alien pieces */}
        {aliveAliens.map(alien => {
          const [ar, ac] = posToRC(alien.position);
          const cx = cellCx(ac);
          const cy = cellCy(ar);
          const isSel = selectedAlien?.pieceIndex === alien.pieceIndex;
          const canSelect = isMyActive && isInvader && diceRoll !== null;

          return (
            <g
              key={`alien-${alien.pieceIndex}`}
              onClick={e => {
                e.stopPropagation();
                if (canSelect) setSelectedAlien(alien);
              }}
              style={{ cursor: canSelect ? 'pointer' : 'default' }}
            >
              {/* Glow ring when selected */}
              {isSel && (
                <circle cx={cx} cy={cy + 2} r={21} fill="rgba(57,255,20,0.12)">
                  <animate attributeName="r" values="18;23;18" dur="1s" repeatCount="indefinite" />
                </circle>
              )}
              {/* Body */}
              <circle
                cx={cx} cy={cy + 2} r={15}
                fill="url(#ssAlienGrad)"
                stroke={isSel ? '#39FF14' : 'rgba(57,255,20,0.65)'}
                strokeWidth={isSel ? 2.5 : 1.8}
                filter="url(#ssGlowGreen)"
              />
              {/* Eyes */}
              <circle cx={cx - 5} cy={cy + 1} r={3} fill="#39FF14" />
              <circle cx={cx + 5} cy={cy + 1} r={3} fill="#39FF14" />
              {/* Antennae */}
              <line x1={cx - 6} y1={cy - 10} x2={cx - 10} y2={cy - 18}
                stroke="rgba(57,255,20,0.55)" strokeWidth={1.5} />
              <circle cx={cx - 10} cy={cy - 20} r={2.5} fill="#39FF14" />
              <line x1={cx + 6} y1={cy - 10} x2={cx + 10} y2={cy - 18}
                stroke="rgba(57,255,20,0.55)" strokeWidth={1.5} />
              <circle cx={cx + 10} cy={cy - 20} r={2.5} fill="#39FF14" />
            </g>
          );
        })}

        {/* Cannon piece */}
        {cannon && (() => {
          const [, cc] = posToRC(cannon.position);
          const cx = cellCx(cc);
          const cy = cellCy(5);
          const isActive = isMyActive && isDefender;

          return (
            <g key="cannon" style={{ pointerEvents: 'none' }}>
              {/* Pulse glow when active */}
              {isActive && (
                <circle cx={cx} cy={cy} r={24} fill="rgba(0,180,255,0.07)">
                  <animate attributeName="r" values="18;26;18" dur="1.8s" repeatCount="indefinite" />
                  <animate attributeName="opacity" values="0.4;0.9;0.4" dur="1.8s" repeatCount="indefinite" />
                </circle>
              )}
              {/* Base block */}
              <rect
                x={cx - 8} y={cy + 10} width={16} height={8} rx={2}
                fill="#005578"
                stroke="rgba(0,200,255,0.5)" strokeWidth={1}
              />
              {/* Cannon barrel */}
              <rect
                x={cx - 4} y={cy - 2} width={8} height={14} rx={2}
                fill="#00A0C8"
                stroke="rgba(0,220,255,0.6)" strokeWidth={1}
              />
              {/* Cannon tip */}
              <polygon
                points={`${cx},${cy - 18} ${cx + 10},${cy - 2} ${cx - 10},${cy - 2}`}
                fill="url(#ssCannonGrad)"
                stroke="#40E8FF"
                strokeWidth={1.5}
                filter="url(#ssGlowCyan)"
              />
            </g>
          );
        })()}
      </svg>

      {/* Player trays */}
      {session.players.map(player => {
        const pn = player.playerNumber;
        const isMe = player.id === playerId;
        const isPlayerDefender = pn === defenderPN;
        const isActive = !gameState.finished && gameState.currentTurn === pn;
        const shotDown = isPlayerDefender ? destroyedCount : 0;
        const remaining = isPlayerDefender ? 0 : aliveAliens.length;

        return (
          <div key={player.id} className="flex items-center gap-3 w-full px-1">
            <span
              className="text-xs font-semibold w-16 truncate"
              style={{ color: isActive ? '#F0E6C8' : '#3A4A5A' }}
            >
              {isMe ? 'You' : player.displayName}
            </span>

            {isPlayerDefender ? (
              <div className="flex items-center gap-2 flex-1">
                <span className="text-xs" style={{ color: '#2A6A8A' }}>Defender</span>
                <div className="flex gap-1">
                  {Array.from({ length: 6 }, (_, i) => (
                    <svg key={i} width={12} height={12} viewBox="0 0 12 12">
                      <polygon
                        points="6,1 11,10 1,10"
                        fill={i < shotDown ? '#00C8FF' : 'transparent'}
                        stroke={i < shotDown ? 'rgba(0,200,255,0.8)' : 'rgba(0,80,120,0.3)'}
                        strokeWidth={1.2}
                      />
                    </svg>
                  ))}
                </div>
                <span className="text-xs font-mono" style={{ color: shotDown >= 4 ? '#00C8FF' : '#2A5060' }}>
                  {shotDown}/6
                </span>
              </div>
            ) : (
              <div className="flex items-center gap-2 flex-1">
                <span className="text-xs" style={{ color: '#1A4A1A' }}>Invaders</span>
                <div className="flex gap-1">
                  {Array.from({ length: 6 }, (_, i) => (
                    <svg key={i} width={12} height={12} viewBox="0 0 12 12">
                      <circle
                        cx={6} cy={7} r={4}
                        fill={i < remaining ? '#041A04' : 'transparent'}
                        stroke={i < remaining ? 'rgba(57,255,20,0.65)' : 'rgba(20,60,20,0.25)'}
                        strokeWidth={1.2}
                      />
                    </svg>
                  ))}
                </div>
                <span className="text-xs font-mono" style={{ color: remaining <= 2 ? '#39FF14' : '#1A4A1A' }}>
                  {remaining}/6
                </span>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
