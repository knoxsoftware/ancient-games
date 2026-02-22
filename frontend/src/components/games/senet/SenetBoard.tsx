import { useEffect, useRef, useState } from 'react';
import { Session, GameState, Move, PiecePosition } from '@ancient-games/shared';
import { socketService } from '../../../services/socket';

interface SenetBoardProps {
  session: Session;
  gameState: GameState;
  playerId: string;
  isMyTurn: boolean;
  animatingPiece?: { playerNumber: number; pieceIndex: number } | null;
}

// Ivory cone piece (Player 0) - historical Egyptian senet piece shape
export function ConePiece({ size = 28 }: { size?: number }) {
  const h = Math.round(size * 1.25);
  return (
    <svg viewBox="0 0 32 40" width={size} height={h} style={{ filter: 'drop-shadow(0 2px 3px rgba(0,0,0,0.45))' }}>
      <ellipse cx="16" cy="36" rx="13" ry="4" fill="rgba(0,0,0,0.3)" />
      <path d="M 3,35 Q 16,4 29,35 Z" fill="#F2E6C8" stroke="#C4A870" strokeWidth="1" strokeLinejoin="round" />
      <path d="M 3,35 Q 8,7 13,5 Q 9,18 5,35 Z" fill="rgba(255,255,255,0.28)" />
      <ellipse cx="16" cy="35" rx="13" ry="4" fill="#D4B483" stroke="#A48050" strokeWidth="1" />
    </svg>
  );
}

// Dark ebony spool piece (Player 1) - second type of historical senet piece
export function SpoolPiece({ size = 28 }: { size?: number }) {
  const h = Math.round(size * 1.25);
  return (
    <svg viewBox="0 0 32 40" width={size} height={h} style={{ filter: 'drop-shadow(0 2px 3px rgba(0,0,0,0.55))' }}>
      <ellipse cx="16" cy="37" rx="13" ry="3.5" fill="rgba(0,0,0,0.4)" />
      {/* Bottom flange */}
      <ellipse cx="16" cy="34" rx="13" ry="4.5" fill="#0E0600" />
      <ellipse cx="16" cy="32" rx="13" ry="4.5" fill="#3A1A00" />
      {/* Cylinder body */}
      <rect x="7" y="17" width="18" height="15" rx="2" fill="#4A2800" />
      {/* Center groove */}
      <ellipse cx="16" cy="24" rx="8" ry="2.5" fill="#0E0600" />
      {/* Top flange */}
      <ellipse cx="16" cy="19" rx="13" ry="4.5" fill="#0E0600" />
      <ellipse cx="16" cy="17" rx="13" ry="4.5" fill="#3A1A00" />
      <ellipse cx="16" cy="15" rx="9" ry="3" fill="#5A3200" />
      <ellipse cx="14" cy="14" rx="5" ry="1.5" fill="rgba(255,255,255,0.08)" />
    </svg>
  );
}

// Ankh symbol for House of Rebirth (position 14)
function AnkhIcon({ color }: { color: string }) {
  return (
    <svg viewBox="0 0 20 28" width={16} height={22}>
      <ellipse cx="10" cy="9" rx="5" ry="6.5" fill="none" stroke={color} strokeWidth="2.5" />
      <line x1="10" y1="15" x2="10" y2="27" stroke={color} strokeWidth="2.5" />
      <line x1="3.5" y1="19" x2="16.5" y2="19" stroke={color} strokeWidth="2.5" />
    </svg>
  );
}

// Wave symbol for House of Water (position 26)
function WaveIcon({ color }: { color: string }) {
  return (
    <svg viewBox="0 0 26 18" width={20} height={14}>
      <path d="M 2,5 Q 7.5,0 13,5 Q 18.5,10 24,5" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" />
      <path d="M 2,12 Q 7.5,7 13,12 Q 18.5,17 24,12" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

// 5-pointed star for House of Beauty (position 25)
function StarIcon({ color }: { color: string }) {
  return (
    <svg viewBox="0 0 22 22" width={16} height={16}>
      <polygon
        points="11,1 13.5,8 21,8 15,13 17.5,20 11,15.5 4.5,20 7,13 1,8 8.5,8"
        fill={color}
        stroke="rgba(0,0,0,0.3)"
        strokeWidth="0.5"
      />
    </svg>
  );
}

// Sun/Ra symbol for end squares 27-29
function SunIcon({ color }: { color: string }) {
  return (
    <svg viewBox="0 0 22 22" width={16} height={16}>
      <circle cx="11" cy="11" r="4.5" fill={color} />
      {[0, 45, 90, 135, 180, 225, 270, 315].map((deg) => {
        const r = (deg * Math.PI) / 180;
        return (
          <line
            key={deg}
            x1={11 + 6 * Math.cos(r)}
            y1={11 + 6 * Math.sin(r)}
            x2={11 + 9 * Math.cos(r)}
            y2={11 + 9 * Math.sin(r)}
            stroke={color}
            strokeWidth="1.5"
            strokeLinecap="round"
          />
        );
      })}
    </svg>
  );
}

// 4 throwing sticks display — light side = flat/scored, dark = round side
export function ThrowingSticks({ result }: { result: number }) {
  const flatCount = result === 5 ? 0 : result;
  return (
    <div className="flex items-end justify-center gap-2 py-1">
      {Array.from({ length: 4 }, (_, i) => {
        const isFlat = i < flatCount;
        return (
          <div
            key={i}
            style={{
              width: '11px',
              height: '52px',
              borderRadius: '5.5px',
              background: isFlat
                ? 'linear-gradient(to right, #E8D5A0, #F5EDD5, #E8D5A0)'
                : 'linear-gradient(to right, #3D1800, #5A2E00, #3D1800)',
              border: `1px solid ${isFlat ? '#A89060' : '#1A0800'}`,
              boxShadow: isFlat
                ? '1px 2px 4px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.3)'
                : '1px 2px 4px rgba(0,0,0,0.6)',
              transform: `rotate(${(i - 1.5) * 7}deg)`,
              transformOrigin: 'bottom center',
            }}
          />
        );
      })}
    </div>
  );
}

type SpecialSquare = {
  name: string;
  bg: string;
  border: string;
  iconType: 'ankh' | 'wave' | 'star' | 'sun';
};

const SPECIAL_SQUARES: Record<number, SpecialSquare> = {
  14: { name: 'Rebirth', bg: '#2D1800', border: '#C4860A', iconType: 'ankh' },
  25: { name: 'Beauty', bg: '#0C280C', border: '#5A9A30', iconType: 'star' },
  26: { name: 'Water', bg: '#081C2E', border: '#2A7AA8', iconType: 'wave' },
  27: { name: '', bg: '#1E1430', border: '#7860A0', iconType: 'sun' },
  28: { name: '', bg: '#1E1430', border: '#7860A0', iconType: 'sun' },
  29: { name: '', bg: '#1E1430', border: '#7860A0', iconType: 'sun' },
};

function SpecialIcon({ type, color }: { type: SpecialSquare['iconType']; color: string }) {
  if (type === 'ankh') return <AnkhIcon color={color} />;
  if (type === 'wave') return <WaveIcon color={color} />;
  if (type === 'star') return <StarIcon color={color} />;
  return <SunIcon color={color} />;
}

export default function SenetBoard({ session, gameState, playerId, isMyTurn, animatingPiece }: SenetBoardProps) {
  const currentPlayer = session.players.find((p) => p.id === playerId);
  const playerNumber = currentPlayer?.playerNumber ?? 0;

  const [selectedPiece, setSelectedPiece] = useState<PiecePosition | null>(null);
  const [invalidPiece, setInvalidPiece] = useState<{ playerNumber: number; pieceIndex: number } | null>(null);
  const invalidTimerRef = useRef<ReturnType<typeof setTimeout>>();

  // Clear selection when turn changes or dice roll resets
  useEffect(() => {
    if (!isMyTurn || gameState.board.diceRoll === null) {
      setSelectedPiece(null);
    }
  }, [isMyTurn, gameState.board.diceRoll]);

  // Returns the board position the selected piece would land on, or null
  const selectedLanding = (() => {
    if (!selectedPiece || !isMyTurn || selectedPiece.playerNumber !== playerNumber) return null;
    if (gameState.board.diceRoll === null) return null;
    const to = selectedPiece.position + gameState.board.diceRoll;
    return to < 30 ? to : null; // 99+ (exiting) has no board square to highlight
  })();

  // Client-side move validity check (server re-validates; this is for UX only)
  const canMovePiece = (piece: PiecePosition): boolean => {
    const roll = gameState.board.diceRoll;
    if (roll === null) return false;
    if (piece.position === 99) return false;
    const to = piece.position + roll;
    if (to >= 30) return true; // exiting, valid
    // Blocked if own 2+ pieces already at destination
    const ownAtDest = gameState.board.pieces.filter(
      (p) => p.playerNumber === playerNumber && p.position === to
    ).length;
    return ownAtDest < 2;
  };

  const handlePieceClick = (piece: PiecePosition) => {
    if (!isMyTurn || gameState.board.diceRoll === null) return;
    if (piece.playerNumber !== playerNumber) return;
    if (piece.position === 99) return;

    const isSelected =
      selectedPiece?.playerNumber === piece.playerNumber &&
      selectedPiece?.pieceIndex === piece.pieceIndex;

    if (isSelected) {
      // Second click: confirm the move
      const from = piece.position;
      const diceRoll = gameState.board.diceRoll;
      const to = from + diceRoll;

      const move: Move = {
        playerId,
        pieceIndex: piece.pieceIndex,
        from,
        to: to >= 30 ? 99 : to,
        diceRoll,
      };

      const socket = socketService.getSocket();
      if (socket) {
        socket.emit('game:move', { sessionCode: session.sessionCode, playerId, move });
      }
      setSelectedPiece(null);
      return;
    }

    // First click or switching selection
    if (!canMovePiece(piece)) {
      setInvalidPiece({ playerNumber: piece.playerNumber, pieceIndex: piece.pieceIndex });
      if (invalidTimerRef.current) clearTimeout(invalidTimerRef.current);
      invalidTimerRef.current = setTimeout(() => setInvalidPiece(null), 600);
      return;
    }

    setSelectedPiece(piece);
  };

  const getPiecesAtPosition = (position: number): PiecePosition[] =>
    gameState.board.pieces.filter((p) => p.position === position);

  // Piece button style: golden glow when selected, red glow when invalid
  const pieceButtonStyle = (piece: PiecePosition, sz: number): React.CSSProperties => {
    const isSelected =
      selectedPiece?.playerNumber === piece.playerNumber &&
      selectedPiece?.pieceIndex === piece.pieceIndex;
    const isInvalid =
      invalidPiece?.playerNumber === piece.playerNumber &&
      invalidPiece?.pieceIndex === piece.pieceIndex;
    const isAnimating =
      !!animatingPiece &&
      piece.playerNumber === animatingPiece.playerNumber &&
      piece.pieceIndex === animatingPiece.pieceIndex;
    return {
      width: sz,
      height: Math.round(sz * 1.25),
      opacity: isAnimating ? 0 : undefined,
      borderRadius: '4px',
      ...(isSelected && {
        boxShadow: '0 0 0 2px #FFD060, 0 0 10px rgba(255,208,60,0.5)',
      }),
      ...(isInvalid && {
        boxShadow: '0 0 0 2px #FF4040, 0 0 10px rgba(255,64,64,0.4)',
      }),
    };
  };

  const renderSquare = (position: number) => {
    const pieces = getPiecesAtPosition(position);
    const special = SPECIAL_SQUARES[position];
    const isEven = position % 2 === 0;
    const isLanding = selectedLanding === position;
    const bg = isLanding
      ? special ? special.bg : isEven ? '#F2E4B0' : '#DFC080'
      : special ? special.bg : isEven ? '#E8D5A3' : '#C9A86C';
    const border = isLanding ? '#FFD060' : special ? special.border : '#9A7840';

    return (
      <div
        key={position}
        data-cell={`senet-pos-${position}`}
        className="aspect-square flex items-center justify-center relative rounded-sm overflow-hidden"
        style={{
          background: bg,
          border: `2px solid ${border}`,
          boxShadow: isLanding
            ? '0 0 0 2px #FFD060, 0 0 10px rgba(255,208,60,0.5), inset 0 1px 0 rgba(255,255,255,0.2)'
            : 'inset 0 1px 0 rgba(255,255,255,0.14), inset 0 -1px 0 rgba(0,0,0,0.2)',
          zIndex: isLanding ? 1 : undefined,
          transition: 'background 0.1s, box-shadow 0.1s, border-color 0.1s',
        }}
      >
        {/* Special square decoration */}
        {special && (
          <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
            <div style={{ opacity: 0.85 }}>
              <SpecialIcon type={special.iconType} color={border} />
            </div>
            {special.name && (
              <span
                className="absolute bottom-0.5 left-0 right-0 text-center truncate px-0.5"
                style={{ fontSize: '5.5px', color: border, fontWeight: 700, lineHeight: 1 }}
              >
                {special.name}
              </span>
            )}
          </div>
        )}

        {/* Subtle grain texture on light squares */}
        {!special && isEven && (
          <div
            className="absolute inset-0 pointer-events-none"
            style={{
              background: 'repeating-linear-gradient(90deg, transparent, transparent 3px, rgba(0,0,0,0.03) 3px, rgba(0,0,0,0.03) 4px)',
            }}
          />
        )}

        {/* Pieces */}
        <div className="relative z-10 flex items-center justify-center w-full h-full">
          {pieces.map((piece) => {
            const canClick = isMyTurn && piece.playerNumber === playerNumber;
            const sz = pieces.length > 1 ? 16 : 24;
            return (
              <button
                key={`${piece.playerNumber}-${piece.pieceIndex}`}
                onClick={() => handlePieceClick(piece)}
                disabled={!canClick}
                className={`transition-transform focus:outline-none ${
                  canClick ? 'active:scale-95 cursor-pointer' : 'cursor-not-allowed opacity-80'
                }`}
                style={pieceButtonStyle(piece, sz)}
                title={`${session.players.find((p) => p.playerNumber === piece.playerNumber)?.displayName} – piece ${piece.pieceIndex + 1}`}
              >
                {piece.playerNumber === 0 ? <ConePiece size={sz} /> : <SpoolPiece size={sz} />}
              </button>
            );
          })}
        </div>
      </div>
    );
  };

  const row0 = Array.from({ length: 10 }, (_, i) => i);
  const row1 = Array.from({ length: 10 }, (_, i) => 19 - i);
  const row2 = Array.from({ length: 10 }, (_, i) => i + 20);

  return (
    <div className="space-y-4">
      {/* Senet Board */}
      <div
        className="rounded-xl p-3 border-2"
        style={{
          background: 'linear-gradient(160deg, #7A5628 0%, #9A7040 50%, #7A5628 100%)',
          borderColor: '#4A3010',
          boxShadow: '0 6px 24px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,215,100,0.08)',
        }}
      >
        {/* Row 0: positions 0–9, left to right */}
        <div className="grid grid-cols-10 gap-1">{row0.map(renderSquare)}</div>

        {/* Turn-around indicator */}
        <div className="flex justify-end pr-1 my-0.5">
          <span style={{ color: '#C4A870', fontSize: '11px' }}>↩</span>
        </div>

        {/* Row 1: positions 19–10, right to left */}
        <div className="grid grid-cols-10 gap-1">{row1.map(renderSquare)}</div>

        <div className="flex justify-start pl-1 my-0.5">
          <span style={{ color: '#C4A870', fontSize: '11px' }}>↩</span>
        </div>

        {/* Row 2: positions 20–29, left to right → exit */}
        <div className="grid grid-cols-10 gap-1">{row2.map(renderSquare)}</div>

        {/* Legend */}
        <div className="mt-3 pt-2.5 border-t flex flex-wrap gap-x-4 gap-y-1" style={{ borderColor: '#4A3010' }}>
          {(
            [
              { key: 14, label: 'Rebirth' },
              { key: 26, label: 'Water → Rebirth' },
              { key: 25, label: 'Beauty (exact roll)' },
            ] as { key: number; label: string }[]
          ).map(({ key, label }) => {
            const sq = SPECIAL_SQUARES[key];
            return (
              <div key={key} className="flex items-center gap-1.5">
                <div
                  className="flex items-center justify-center rounded"
                  style={{ width: 18, height: 18, background: sq.bg, border: `1px solid ${sq.border}` }}
                >
                  <SpecialIcon type={sq.iconType} color={sq.border} />
                </div>
                <span style={{ fontSize: '9px', color: '#B0A080' }}>{label}</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
