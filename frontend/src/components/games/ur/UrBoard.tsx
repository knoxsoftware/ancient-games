import { useState } from 'react';
import { Session, GameState, Move, PiecePosition } from '@ancient-games/shared';
import { socketService } from '../../../services/socket';

interface UrBoardProps {
  session: Session;
  gameState: GameState;
  playerId: string;
  isMyTurn: boolean;
  animatingPiece?: { playerNumber: number; pieceIndex: number } | null;
}

const ROSETTE_POSITIONS = [2, 6, 13];

// Thin disk piece viewed from slightly above — 5 pips (center + 4 cardinal)
// Player 0: white disk, blue pips  |  Player 1: black disk, brown pips
export function UrPiece({ playerNumber, size = 28 }: { playerNumber: number; size?: number }) {
  const isWhite = playerNumber === 0;
  const face   = isWhite ? '#F2EEE4' : '#1C1C1C';
  const edge   = isWhite ? '#C0BAA8' : '#080808';
  const pip    = isWhite ? '#2F6BAD' : '#7A4A22';   // blue vs brown
  // pip positions: center (20,20) + cardinal at radius 9
  return (
    <svg
      viewBox="0 0 40 40"
      width={size}
      height={size}
      style={{ filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.7))' }}
    >
      {/* Thin edge — offset ellipse beneath face gives depth */}
      <ellipse cx="20" cy="23" rx="16.5" ry="3.5" fill={edge} />

      {/* Disk face */}
      <circle cx="20" cy="20" r="17" fill={face} stroke="white" strokeWidth="1.8" />

      {/* Subtle highlight arc (top-left) to sell the round disk shape */}
      <ellipse cx="15" cy="14" rx="7" ry="4.5" fill="rgba(255,255,255,0.22)" />

      {/* 5 pips */}
      <circle cx="20" cy="20" r="2.6" fill={pip} />  {/* center */}
      <circle cx="20" cy="11" r="2.6" fill={pip} />  {/* top */}
      <circle cx="29" cy="20" r="2.6" fill={pip} />  {/* right */}
      <circle cx="20" cy="29" r="2.6" fill={pip} />  {/* bottom */}
      <circle cx="11" cy="20" r="2.6" fill={pip} />  {/* left */}
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
      <circle cx={cx} cy={cy} r={innerR} fill="rgba(255,215,80,0.85)" stroke="rgba(200,150,0,0.8)" strokeWidth="0.8" />
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
function TetraDice({ result }: { result: number }) {
  return (
    <div className="flex gap-2 justify-center items-center py-1">
      {Array.from({ length: 4 }, (_, i) => {
        const scored = i < result;
        return (
          <svg key={i} viewBox="0 0 32 30" width={30} height={28} style={{ filter: 'drop-shadow(0 1px 3px rgba(0,0,0,0.6))' }}>
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

export default function UrBoard({ session, gameState, playerId, isMyTurn, animatingPiece }: UrBoardProps) {
  const currentPlayer = session.players.find((p) => p.id === playerId);
  const playerNumber = currentPlayer?.playerNumber ?? 0;

  const [hoveredPiece, setHoveredPiece] = useState<PiecePosition | null>(null);

  // Landing position + owning player for the currently hovered piece
  const hoveredLanding = (() => {
    if (!hoveredPiece || !isMyTurn || hoveredPiece.playerNumber !== playerNumber) return null;
    if (gameState.board.diceRoll === null) return null;
    const from = hoveredPiece.position;
    const roll = gameState.board.diceRoll;
    if (from !== -1 && from + roll >= 14) return null; // exits board
    const to = from === -1 ? roll - 1 : from + roll;
    return { pos: to, player: hoveredPiece.playerNumber };
  })();

  const handleRollDice = () => {
    if (!isMyTurn || gameState.board.diceRoll !== null) return;
    const socket = socketService.getSocket();
    if (socket) {
      socket.emit('game:roll-dice', { sessionCode: session.sessionCode, playerId });
    }
  };

  const handlePieceClick = (piece: PiecePosition) => {
    if (!isMyTurn || gameState.board.diceRoll === null) return;
    if (piece.playerNumber !== playerNumber) return;

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
  };

  const getPiecesAt = (position: number, player: number): PiecePosition[] =>
    gameState.board.pieces.filter((p) => p.position === position && p.playerNumber === player);

  const offBoardPieces = (playerNum: number) =>
    gameState.board.pieces.filter((p) => p.playerNumber === playerNum && p.position === -1);

  const finishedPieces = (playerNum: number) =>
    gameState.board.pieces.filter((p) => p.playerNumber === playerNum && p.position === 99);

  // Shared highlight styling helper
  const landingStyle = (isLanding: boolean, baseBg: string, baseBorder: string) => ({
    background: isLanding ? (baseBg === '#3A2400' ? '#4A3010' : '#2A2010') : baseBg,
    border: `2px solid ${isLanding ? '#FFD060' : baseBorder}`,
    boxShadow: isLanding
      ? '0 0 0 2px #FFD060, 0 0 10px rgba(255,208,60,0.5), inset 0 1px 0 rgba(255,255,255,0.1)'
      : 'inset 0 1px 0 rgba(255,255,255,0.06), inset 0 -1px 0 rgba(0,0,0,0.25)',
    zIndex: isLanding ? 1 : undefined as number | undefined,
    transition: 'background 0.1s, box-shadow 0.1s, border-color 0.1s',
  });

  // Private-lane square for one player
  const renderPrivate = (position: number, player: number) => {
    const isRosette = ROSETTE_POSITIONS.includes(position);
    const pieces = getPiecesAt(position, player);
    // A private square is a landing target only for the matching player's pieces
    const isLanding =
      hoveredLanding !== null &&
      hoveredLanding.pos === position &&
      hoveredLanding.player === player &&
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
            const sz = 22;
            const isAnimating =
              !!animatingPiece &&
              piece.playerNumber === animatingPiece.playerNumber &&
              piece.pieceIndex === animatingPiece.pieceIndex;
            return (
              <button
                key={`${piece.playerNumber}-${piece.pieceIndex}`}
                onClick={() => handlePieceClick(piece)}
                onMouseEnter={() => canClick && gameState.board.diceRoll !== null && setHoveredPiece(piece)}
                onMouseLeave={() => setHoveredPiece(null)}
                disabled={!canClick}
                className={`transition-transform focus:outline-none ${
                  canClick ? 'hover:scale-110 active:scale-95 cursor-pointer' : 'cursor-not-allowed opacity-80'
                }`}
                style={{ width: sz, height: sz, opacity: isAnimating ? 0 : undefined }}
                title={`${session.players.find((p) => p.playerNumber === piece.playerNumber)?.displayName} – piece ${piece.pieceIndex + 1}`}
              >
                {<UrPiece playerNumber={piece.playerNumber} size={sz} />}
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
      hoveredLanding !== null &&
      hoveredLanding.pos === position &&
      position >= 4 && position <= 11;

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
            const sz = allPieces.length > 1 ? 16 : 22;
            const isAnimating =
              !!animatingPiece &&
              piece.playerNumber === animatingPiece.playerNumber &&
              piece.pieceIndex === animatingPiece.pieceIndex;
            return (
              <button
                key={`${piece.playerNumber}-${piece.pieceIndex}`}
                onClick={() => handlePieceClick(piece)}
                onMouseEnter={() => canClick && gameState.board.diceRoll !== null && setHoveredPiece(piece)}
                onMouseLeave={() => setHoveredPiece(null)}
                disabled={!canClick}
                className={`transition-transform focus:outline-none ${
                  canClick ? 'hover:scale-110 active:scale-95 cursor-pointer' : 'cursor-not-allowed opacity-80'
                }`}
                style={{ width: sz, height: sz, opacity: isAnimating ? 0 : undefined }}
                title={`${session.players.find((p) => p.playerNumber === piece.playerNumber)?.displayName} – piece ${piece.pieceIndex + 1}`}
              >
                {<UrPiece playerNumber={piece.playerNumber} size={sz} />}
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
      {/* Player Info */}
      <div className="grid grid-cols-2 gap-3">
        {session.players.map((player) => {
          const isActive = gameState.currentTurn === player.playerNumber;
          return (
            <div
              key={player.id}
              className="rounded-xl p-3 border-2 transition-all"
              style={{
                background: isActive
                  ? player.playerNumber === 0
                    ? 'rgba(14,34,60,0.6)'
                    : 'rgba(60,14,14,0.6)'
                  : 'rgba(8,5,0,0.6)',
                borderColor: isActive
                  ? player.playerNumber === 0
                    ? '#2A5A9A'
                    : '#9A2A2A'
                  : '#2A1E0E',
              }}
            >
              <div className="flex items-center gap-2 mb-1.5">
                <div style={{ width: 20, height: 20, flexShrink: 0 }}>
                  {<UrPiece playerNumber={player.playerNumber} size={20} />}
                </div>
                <div className="font-semibold text-sm truncate">{player.displayName}</div>
                {isActive && (
                  <div
                    className="ml-auto text-xs px-2 py-0.5 rounded font-bold"
                    style={{
                      background: player.playerNumber === 0 ? '#1E4A80' : '#801E1E',
                      color: '#F0EDE0',
                    }}
                  >
                    Turn
                  </div>
                )}
              </div>
              <div className="text-xs" style={{ color: '#907A60' }}>
                {finishedPieces(player.playerNumber).length} / 7 pieces escaped
              </div>
            </div>
          );
        })}
      </div>

      {/* Dice — Tetrahedral */}
      <div
        className="rounded-xl px-4 py-3 border"
        style={{ background: 'rgba(5,3,0,0.7)', borderColor: '#2A1E0E' }}
      >
        {gameState.board.diceRoll === null ? (
          <button
            onClick={handleRollDice}
            disabled={!isMyTurn || gameState.finished}
            className="w-full py-3 rounded-lg font-bold transition-all active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed"
            style={{
              background:
                isMyTurn && !gameState.finished
                  ? 'linear-gradient(135deg, #C4860A 0%, #7A5000 100%)'
                  : '#1E1408',
              color: '#F0EDE0',
              border: '2px solid #C4860A',
              fontSize: '1rem',
              letterSpacing: '0.02em',
            }}
          >
            Roll the Dice
          </button>
        ) : (
          <div className="flex flex-col items-center gap-1">
            <TetraDice result={gameState.board.diceRoll} />
            <div className="text-2xl font-bold" style={{ color: '#F0EDE0' }}>
              {gameState.board.diceRoll}
            </div>
            <div className="text-xs" style={{ color: '#907A60' }}>
              {gameState.board.diceRoll === 0
                ? 'No move — turn passes.'
                : 'Select a piece to move.'}
            </div>
          </div>
        )}
      </div>

      {/* Royal Game of Ur Board */}
      <div
        className="rounded-xl p-3 border-2"
        style={{
          background: 'linear-gradient(160deg, #140C04 0%, #1E1408 50%, #140C04 100%)',
          borderColor: '#2A1E0E',
          boxShadow: '0 6px 28px rgba(0,0,0,0.7), inset 0 1px 0 rgba(255,200,60,0.06)',
        }}
      >
        <div className="space-y-1.5">
          {/* Top row: P1 start [3,2,1,0] · gap · end [13, 12★] (rosette is last before exit) */}
          <div className="grid grid-cols-8 gap-1">
            {[3, 2, 1, 0].map((pos) => renderPrivate(pos, 1))}
            {emptyCell('t4')}
            {emptyCell('t5')}
            {[13, 12].map((pos) => renderPrivate(pos, 1))}
          </div>

          {/* Middle row: 8 shared squares — aligns directly under/above end lanes */}
          <div className="grid grid-cols-8 gap-1">
            {[0, 1, 2, 3, 4, 5, 6, 7].map((idx) => renderShared(idx))}
          </div>

          {/* Bottom row: P0 start [3,2,1,0] · gap · end [13, 12★] */}
          <div className="grid grid-cols-8 gap-1">
            {[3, 2, 1, 0].map((pos) => renderPrivate(pos, 0))}
            {emptyCell('b4')}
            {emptyCell('b5')}
            {[13, 12].map((pos) => renderPrivate(pos, 0))}
          </div>
        </div>

        {/* Legend */}
        <div className="mt-3 pt-2.5 border-t flex flex-wrap gap-x-4 gap-y-1" style={{ borderColor: '#2A1E0E' }}>
          <div className="flex items-center gap-1.5">
            <div className="relative w-5 h-5 rounded overflow-hidden" style={{ background: '#3A2400', border: '1px solid #C4860A' }}>
              <RosettePattern />
            </div>
            <span style={{ fontSize: '9px', color: '#908070' }}>Rosette: extra turn &amp; safe</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-5 h-5 rounded" style={{ background: '#1A1208', border: '1px solid #3A2E1C' }} />
            <span style={{ fontSize: '9px', color: '#908070' }}>Shared path — can capture</span>
          </div>
        </div>
      </div>

      {/* Off-board pieces waiting to enter */}
      <div className="grid grid-cols-2 gap-3">
        {session.players.map((player) => {
          const waiting = offBoardPieces(player.playerNumber);
          return (
            <div
              key={player.id}
              data-cell={`ur-offboard-${player.playerNumber}`}
              className="rounded-xl p-3 border"
              style={{
                background: 'rgba(8,5,0,0.5)',
                borderColor: player.playerNumber === 0 ? '#1E3A5A' : '#5A1E1E',
              }}
            >
              <div className="text-xs font-medium mb-2" style={{ color: '#907A60' }}>
                {player.displayName} — waiting ({waiting.length})
              </div>
              <div className="flex flex-wrap gap-1.5">
                {waiting.map((piece) => {
                  const canClick = isMyTurn && piece.playerNumber === playerNumber;
                  const sz = 22;
                  const isAnimating =
                    !!animatingPiece &&
                    piece.playerNumber === animatingPiece.playerNumber &&
                    piece.pieceIndex === animatingPiece.pieceIndex;
                  return (
                    <button
                      key={`${piece.playerNumber}-${piece.pieceIndex}`}
                      onClick={() => handlePieceClick(piece)}
                      onMouseEnter={() => canClick && gameState.board.diceRoll !== null && setHoveredPiece(piece)}
                      onMouseLeave={() => setHoveredPiece(null)}
                      disabled={!canClick}
                      className={`transition-transform focus:outline-none ${
                        canClick ? 'hover:scale-110 active:scale-95 cursor-pointer' : 'cursor-not-allowed opacity-50'
                      }`}
                      style={{ width: sz, height: sz, opacity: isAnimating ? 0 : undefined }}
                      title={`Enter piece ${piece.pieceIndex + 1}`}
                    >
                      {<UrPiece playerNumber={piece.playerNumber} size={sz} />}
                    </button>
                  );
                })}
                {waiting.length === 0 && (
                  <span className="text-xs italic" style={{ color: '#5A4A38' }}>
                    all on board
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
