import { memo, useEffect, useId, useRef, useState } from 'react';
import { Session, GameState, Move, PiecePosition } from '@ancient-games/shared';
import { socketService } from '../../../services/socket';
import { useTheme } from '../../../hooks/useTheme';

interface UrBoardProps {
  session: Session;
  gameState: GameState;
  playerId: string;
  isMyTurn: boolean;
  animatingPiece?: { playerNumber: number; pieceIndex: number } | null;
  boardOnly?: boolean;
}

const ROSETTE_POSITIONS = [2, 6, 13];
const SHARED_START = 4;
const SHARED_END = 11;

// Thin disk piece viewed from slightly above — 5 pips (center + 4 cardinal)
// Player 0: white disk, blue pips  |  Player 1: black disk, brown pips
export function UrPiece({
  playerNumber,
  size = '100%',
}: {
  playerNumber: number;
  size?: number | string;
}) {
  const uid = useId();
  const gradId = `ur-hl-${uid}`;
  const isWhite = playerNumber === 0;
  const face = isWhite ? '#F2EEE4' : '#1C1C1C';
  const edge = isWhite ? '#C0BAA8' : '#080808';
  const pip = isWhite ? '#2F6BAD' : '#7A4A22'; // blue vs brown
  // pip positions: center (20,20) + cardinal at radius 9
  return (
    <svg
      viewBox="0 0 40 40"
      width={size}
      height={size}
      style={{ filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.7))' }}
    >
      <defs>
        {/* Radial gradient: soft specular highlight from top-left, fades across face */}
        <radialGradient id={gradId} cx="36%" cy="30%" r="55%" fx="36%" fy="30%">
          <stop offset="0%" stopColor="rgba(255,255,255,0.5)" />
          <stop offset="60%" stopColor="rgba(255,255,255,0.08)" />
          <stop offset="100%" stopColor="rgba(255,255,255,0)" />
        </radialGradient>
      </defs>
      {/* Thin edge — offset ellipse beneath face gives depth */}
      <ellipse cx="20" cy="23" rx="16.5" ry="3.5" fill={edge} />
      {/* Disk face */}
      <circle cx="20" cy="20" r="17" fill={face} stroke="white" strokeWidth="1.8" />
      {/* Specular highlight — radial gradient overlay confined to the face circle */}
      <circle cx="20" cy="20" r="17" fill={`url(#${gradId})`} />
      {/* 5 pips */}
      <circle cx="20" cy="20" r="2.6" fill={pip} /> {/* center */}
      <circle cx="20" cy="11" r="2.6" fill={pip} /> {/* top */}
      <circle cx="29" cy="20" r="2.6" fill={pip} /> {/* right */}
      <circle cx="20" cy="29" r="2.6" fill={pip} /> {/* bottom */}
      <circle cx="11" cy="20" r="2.6" fill={pip} /> {/* left */}
    </svg>
  );
}

// Rosette flower pattern — 6-petal design matching the actual Ur board inlay
function RosettePattern() {
  const cx = 20;
  const cy = 20;
  const innerR = 4;
  const petalR = 5.5;
  const petalD = 9;
  return (
    <svg viewBox="0 0 40 40" className="absolute inset-0 w-full h-full" aria-hidden>
      {/* Outer ring */}
      <circle cx={cx} cy={cy} r={18} fill="none" stroke="rgba(255,200,60,0.35)" strokeWidth="1.2" />
      {/* Six petals */}
      {[0, 60, 120, 180, 240, 300].map((deg) => {
        const r = (deg * Math.PI) / 180;
        return (
          <circle
            key={deg}
            cx={cx + petalD * Math.cos(r)}
            cy={cy + petalD * Math.sin(r)}
            r={petalR}
            fill="rgba(255,200,60,0.55)"
            stroke="rgba(255,180,20,0.7)"
            strokeWidth="0.8"
          />
        );
      })}
      {/* Center */}
      <circle
        cx={cx}
        cy={cy}
        r={innerR}
        fill="rgba(255,215,80,0.85)"
        stroke="rgba(200,150,0,0.8)"
        strokeWidth="0.8"
      />
      {/* Inner petal details */}
      {[0, 60, 120, 180, 240, 300].map((deg) => {
        const r = (deg * Math.PI) / 180;
        return (
          <line
            key={deg}
            x1={cx + innerR * Math.cos(r)}
            y1={cy + innerR * Math.sin(r)}
            x2={cx + (petalD - 1) * Math.cos(r)}
            y2={cy + (petalD - 1) * Math.sin(r)}
            stroke="rgba(180,130,0,0.5)"
            strokeWidth="0.7"
          />
        );
      })}
    </svg>
  );
}

// 4 tetrahedral (pyramid) dice — each shows scored tip or blank base
export function TetraDice({ result }: { result: number }) {
  return (
    <div className="flex gap-2 justify-center items-center py-1">
      {Array.from({ length: 4 }, (_, i) => {
        const scored = i < result;
        return (
          <svg
            key={i}
            viewBox="0 0 32 30"
            width={30}
            height={28}
            style={{ filter: 'drop-shadow(0 1px 3px rgba(0,0,0,0.6))' }}
          >
            {/* Tetrahedron silhouette */}
            <polygon
              points="16,2 30,27 2,27"
              fill={scored ? '#C4860A' : '#1A1000'}
              stroke={scored ? '#FFD060' : '#3D2A00'}
              strokeWidth="1.5"
              strokeLinejoin="round"
            />
            {/* Inner triangle for depth */}
            <polygon
              points="16,8 25,24 7,24"
              fill={scored ? 'rgba(0,0,0,0.15)' : 'rgba(255,255,255,0.04)'}
              stroke="none"
            />
            {/* Scored pip at tip */}
            {scored && <circle cx="16" cy="6" r="2.2" fill="#FFE080" />}
          </svg>
        );
      })}
    </div>
  );
}

function UrBoard({ session, gameState, playerId, isMyTurn, animatingPiece, boardOnly }: UrBoardProps) {
  const eg = useTheme() === 'egyptian';
  const currentPlayer = session.players.find((p) => p.id === playerId);
  const playerNumber = currentPlayer?.playerNumber ?? 0;
  // topPlayer = opponent's row (far side); bottomPlayer = my row (near side)
  const topPlayer = playerNumber === 0 ? 1 : 0;
  const bottomPlayer = playerNumber;

  const [selectedPiece, setSelectedPiece] = useState<PiecePosition | null>(null);
  const [invalidPiece, setInvalidPiece] = useState<{
    playerNumber: number;
    pieceIndex: number;
  } | null>(null);
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
    const from = selectedPiece.position;
    const roll = gameState.board.diceRoll;
    if (from !== -1 && from + roll >= 14) return null; // exits board
    const to = from === -1 ? roll - 1 : from + roll;
    return { pos: to, player: selectedPiece.playerNumber };
  })();

  // Client-side move validity check (server re-validates; this is for UX only)
  const canMovePiece = (piece: PiecePosition): boolean => {
    const roll = gameState.board.diceRoll;
    if (roll === null || roll === 0) return false;
    if (piece.position === 99) return false;

    const from = piece.position;

    if (from === -1) {
      // Entering: target is roll-1
      const to = roll - 1;
      return !gameState.board.pieces.some(
        (p) => p.playerNumber === playerNumber && p.position === to,
      );
    }

    // Exact roll required to exit (PATH_LENGTH = 14)
    if (from + roll > 14) return false; // overrun
    if (from + roll === 14) return true; // exact exit

    const to = from + roll;
    // Own piece blocks
    if (gameState.board.pieces.some((p) => p.playerNumber === playerNumber && p.position === to)) {
      return false;
    }
    // Opponent on rosette in shared lane blocks
    if (
      to >= SHARED_START &&
      to <= SHARED_END &&
      ROSETTE_POSITIONS.includes(to) &&
      gameState.board.pieces.some((p) => p.playerNumber !== playerNumber && p.position === to)
    ) {
      return false;
    }
    return true;
  };

  const handlePieceClick = (piece: PiecePosition) => {
    if (!isMyTurn || gameState.board.diceRoll === null) return;
    if (piece.playerNumber !== playerNumber) return;

    const isSelected =
      selectedPiece?.playerNumber === piece.playerNumber &&
      selectedPiece?.pieceIndex === piece.pieceIndex;

    if (isSelected) {
      // Second click: confirm the move
      const from = piece.position;
      const diceRoll = gameState.board.diceRoll;
      const to = from === -1 ? diceRoll - 1 : from + diceRoll;

      const move: Move = {
        playerId,
        pieceIndex: piece.pieceIndex,
        from,
        to: from !== -1 && from + diceRoll >= 14 ? 99 : to,
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

  const getPiecesAt = (position: number, player: number): PiecePosition[] =>
    gameState.board.pieces.filter((p) => p.position === position && p.playerNumber === player);

  const offBoardPieces = (playerNum: number) =>
    gameState.board.pieces.filter((p) => p.playerNumber === playerNum && p.position === -1);

  // Shared highlight styling helper
  const landingStyle = (isLanding: boolean, baseBg: string, baseBorder: string) => ({
    background: isLanding ? (baseBg === '#3A2400' ? '#4A3010' : '#2A2010') : baseBg,
    border: `2px solid ${isLanding ? '#FFD060' : baseBorder}`,
    boxShadow: isLanding
      ? '0 0 0 2px #FFD060, 0 0 10px rgba(255,208,60,0.5), inset 0 1px 0 rgba(255,255,255,0.1)'
      : 'inset 0 1px 0 rgba(255,255,255,0.06), inset 0 -1px 0 rgba(0,0,0,0.25)',
    zIndex: isLanding ? 1 : (undefined as number | undefined),
    transition: 'background 0.1s, box-shadow 0.1s, border-color 0.1s',
  });

  // Piece button style: golden glow when selected, red glow when invalid
  const pieceButtonStyle = (piece: PiecePosition, sz?: number): React.CSSProperties => {
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
      ...(sz !== undefined && { width: sz, height: sz }),
      opacity: isAnimating ? 0 : undefined,
      borderRadius: '50%',
      ...(isSelected && {
        boxShadow: '0 0 0 2px #FFD060, 0 0 10px rgba(255,208,60,0.5)',
      }),
      ...(isInvalid && {
        boxShadow: '0 0 0 2px #FF4040, 0 0 10px rgba(255,64,64,0.4)',
      }),
    };
  };

  // Private-lane square for one player
  const renderPrivate = (position: number, player: number) => {
    const isRosette = ROSETTE_POSITIONS.includes(position);
    const pieces = getPiecesAt(position, player);
    const isLanding =
      selectedLanding !== null &&
      selectedLanding.pos === position &&
      selectedLanding.player === player &&
      (position < 4 || position >= 12); // must be in private zone

    const baseBg = isRosette ? '#3A2400' : player === 0 ? '#0C1A2E' : '#2E0C0C';
    const baseBorder = isRosette ? '#C4860A' : player === 0 ? '#1E3A5A' : '#5A1E1E';

    return (
      <div
        key={`priv-${player}-${position}`}
        data-cell={`ur-p${player}-${position}`}
        className="aspect-square flex items-center justify-center relative rounded-sm overflow-hidden"
        style={landingStyle(isLanding, baseBg, baseBorder)}
      >
        {isRosette && <RosettePattern />}
        <div className="relative z-10 flex items-center justify-center w-full h-full">
          {pieces.map((piece) => {
            const canClick = isMyTurn && piece.playerNumber === playerNumber;
            return (
              <button
                key={`${piece.playerNumber}-${piece.pieceIndex}`}
                onClick={() => handlePieceClick(piece)}
                disabled={!canClick}
                className={`transition-transform focus:outline-none w-[80%] h-[80%] flex items-center justify-center ${
                  canClick ? 'active:scale-95 cursor-pointer' : 'cursor-not-allowed opacity-80'
                }`}
                style={pieceButtonStyle(piece)}
                title={`${session.players.find((p) => p.playerNumber === piece.playerNumber)?.displayName} – piece ${piece.pieceIndex + 1}`}
              >
                <UrPiece playerNumber={piece.playerNumber} />
              </button>
            );
          })}
        </div>
      </div>
    );
  };

  // Shared-lane square (both players' pieces may coexist or fight)
  const renderShared = (sharedIndex: number) => {
    const position = sharedIndex + 4;
    const isRosette = ROSETTE_POSITIONS.includes(position);
    const piecesP0 = getPiecesAt(position, 0);
    const piecesP1 = getPiecesAt(position, 1);
    const allPieces = [...piecesP0, ...piecesP1];
    const isLanding =
      selectedLanding !== null &&
      selectedLanding.pos === position &&
      position >= 4 &&
      position <= 11;

    const baseBg = isRosette ? '#3A2400' : '#1A1208';
    const baseBorder = isRosette ? '#C4860A' : '#3A2E1C';

    return (
      <div
        key={`shared-${position}`}
        data-cell={`ur-shared-${position}`}
        className="aspect-square flex items-center justify-center relative rounded-sm overflow-hidden"
        style={landingStyle(isLanding, baseBg, baseBorder)}
      >
        {isRosette && <RosettePattern />}
        <div className="relative z-10 flex gap-0.5 items-center justify-center">
          {allPieces.map((piece) => {
            const canClick = isMyTurn && piece.playerNumber === playerNumber;
            const sizeClass = allPieces.length > 1 ? 'w-[44%] h-[44%]' : 'w-[80%] h-[80%]';
            return (
              <button
                key={`${piece.playerNumber}-${piece.pieceIndex}`}
                onClick={() => handlePieceClick(piece)}
                disabled={!canClick}
                className={`transition-transform focus:outline-none flex items-center justify-center ${sizeClass} ${
                  canClick ? 'active:scale-95 cursor-pointer' : 'cursor-not-allowed opacity-80'
                }`}
                style={pieceButtonStyle(piece)}
                title={`${session.players.find((p) => p.playerNumber === piece.playerNumber)?.displayName} – piece ${piece.pieceIndex + 1}`}
              >
                <UrPiece playerNumber={piece.playerNumber} />
              </button>
            );
          })}
        </div>
      </div>
    );
  };

  // Empty board gap cell
  const emptyCell = (key: string) => (
    <div
      key={key}
      className="aspect-square rounded-sm"
      style={{ background: 'rgba(0,0,0,0.25)', border: '2px solid transparent' }}
    />
  );

  return (
    <div className="space-y-4">
      {/* Royal Game of Ur Board */}
      <div
        className="rounded-xl p-3 border-2"
        style={{
          background: eg
            ? 'linear-gradient(160deg, #EDE4CC 0%, #F0E8D0 50%, #EDE4CC 100%)'
            : 'linear-gradient(160deg, #140C04 0%, #1E1408 50%, #140C04 100%)',
          borderColor: eg ? '#C0A070' : '#2A1E0E',
          boxShadow: eg
            ? '0 6px 28px rgba(0,0,0,0.15), inset 0 1px 0 rgba(138,106,0,0.1)'
            : '0 6px 28px rgba(0,0,0,0.7), inset 0 1px 0 rgba(255,200,60,0.06)',
        }}
      >
        {/* Opponent's waiting pieces — above the board */}
        {!boardOnly && (
          <div
            data-cell={`ur-offboard-${topPlayer}`}
            className="flex items-center gap-1.5 flex-wrap mb-2 pb-2 border-b min-h-[32px]"
            style={{ borderColor: '#2A1E0E' }}
          >
            {offBoardPieces(topPlayer).map((piece) => (
              <div
                key={`${piece.playerNumber}-${piece.pieceIndex}`}
                style={{ width: 28, height: 28, opacity: 0.55 }}
                title={`${session.players.find((p) => p.playerNumber === topPlayer)?.displayName} – piece ${piece.pieceIndex + 1}`}
              >
                <UrPiece playerNumber={piece.playerNumber} size={28} />
              </div>
            ))}
            {offBoardPieces(topPlayer).length === 0 && (
              <span className="text-xs italic" style={{ color: '#5A4A38' }}>
                all on board
              </span>
            )}
          </div>
        )}

        <div className="space-y-1.5">
          {/* Top row: opponent's private lane */}
          <div className="grid grid-cols-8 gap-1">
            {[3, 2, 1, 0].map((pos) => renderPrivate(pos, topPlayer))}
            {emptyCell('t4')}
            {emptyCell('t5')}
            {[13, 12].map((pos) => renderPrivate(pos, topPlayer))}
          </div>

          {/* Middle row: 8 shared squares */}
          <div className="grid grid-cols-8 gap-1">
            {[0, 1, 2, 3, 4, 5, 6, 7].map((idx) => renderShared(idx))}
          </div>

          {/* Bottom row: my private lane */}
          <div className="grid grid-cols-8 gap-1">
            {[3, 2, 1, 0].map((pos) => renderPrivate(pos, bottomPlayer))}
            {emptyCell('b4')}
            {emptyCell('b5')}
            {[13, 12].map((pos) => renderPrivate(pos, bottomPlayer))}
          </div>
        </div>

        {/* My waiting pieces — below the board */}
        {!boardOnly && (
          <div
            data-cell={`ur-offboard-${bottomPlayer}`}
            className="flex items-center gap-1.5 flex-wrap mt-2 pt-2 border-t min-h-[32px]"
            style={{ borderColor: '#2A1E0E' }}
          >
            {offBoardPieces(bottomPlayer).map((piece) => {
              const canClick = isMyTurn && piece.playerNumber === playerNumber;
              const sz = 28;
              return (
                <button
                  key={`${piece.playerNumber}-${piece.pieceIndex}`}
                  onClick={() => handlePieceClick(piece)}
                  disabled={!canClick}
                  className={`transition-transform focus:outline-none ${
                    canClick ? 'active:scale-95 cursor-pointer' : 'cursor-not-allowed opacity-50'
                  }`}
                  style={pieceButtonStyle(piece, sz)}
                  title={`Enter piece ${piece.pieceIndex + 1}`}
                >
                  <UrPiece playerNumber={piece.playerNumber} size={sz} />
                </button>
              );
            })}
            {offBoardPieces(bottomPlayer).length === 0 && (
              <span className="text-xs italic" style={{ color: '#5A4A38' }}>
                all on board
              </span>
            )}
          </div>
        )}

        {/* Legend */}
        {!boardOnly && (
          <div
            className="mt-3 pt-2.5 border-t flex flex-wrap gap-x-4 gap-y-1"
            style={{ borderColor: '#2A1E0E' }}
          >
            <div className="flex items-center gap-1.5">
              <div
                className="relative w-5 h-5 rounded overflow-hidden"
                style={{ background: '#3A2400', border: '1px solid #C4860A' }}
              >
                <RosettePattern />
              </div>
              <span style={{ fontSize: '9px', color: '#908070' }}>
                Rosette: extra turn &amp; safe
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              <div
                className="w-5 h-5 rounded"
                style={{ background: '#1A1208', border: '1px solid #3A2E1C' }}
              />
              <span style={{ fontSize: '9px', color: '#908070' }}>Shared path — can capture</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default memo(UrBoard);
