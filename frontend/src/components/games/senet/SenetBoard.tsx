import { Session, GameState, Move, PiecePosition } from '@ancient-games/shared';
import { socketService } from '../../../services/socket';

interface SenetBoardProps {
  session: Session;
  gameState: GameState;
  playerId: string;
  isMyTurn: boolean;
}

export default function SenetBoard({ session, gameState, playerId, isMyTurn }: SenetBoardProps) {
  const currentPlayer = session.players.find((p) => p.id === playerId);
  const playerNumber = currentPlayer?.playerNumber ?? 0;

  const SPECIAL_SQUARES = {
    14: 'House of Rebirth',
    25: 'House of Beauty',
    26: 'House of Water',
  };

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
    if (piece.position === 99) return;

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
  };

  const getPiecesAtPosition = (position: number): PiecePosition[] => {
    return gameState.board.pieces.filter((p) => p.position === position);
  };

  const renderSquare = (position: number) => {
    const pieces = getPiecesAtPosition(position);
    const isSpecial = position in SPECIAL_SQUARES;

    return (
      <div
        key={position}
        className={`aspect-square border-2 rounded-lg flex items-center justify-center relative transition-all ${
          isSpecial
            ? 'bg-amber-900 border-amber-500'
            : position % 2 === 0
            ? 'bg-gray-700 border-gray-600'
            : 'bg-gray-800 border-gray-700'
        }`}
      >
        {isSpecial && (
          <div className="absolute top-0 left-0 right-0 text-[8px] text-amber-400 text-center px-1 truncate">
            {SPECIAL_SQUARES[position as keyof typeof SPECIAL_SQUARES]}
          </div>
        )}

        {pieces.map((piece) => (
          <button
            key={`${piece.playerNumber}-${piece.pieceIndex}`}
            onClick={() => handlePieceClick(piece)}
            disabled={!isMyTurn || piece.playerNumber !== playerNumber}
            className={`w-8 h-8 md:w-10 md:h-10 rounded-full border-2 font-bold text-xs transition-transform ${
              piece.playerNumber === 0
                ? 'bg-blue-600 border-blue-400'
                : 'bg-red-600 border-red-400'
            } ${
              isMyTurn && piece.playerNumber === playerNumber
                ? 'cursor-pointer hover:scale-110 active:scale-95'
                : 'cursor-not-allowed opacity-70'
            }`}
          >
            {piece.pieceIndex + 1}
          </button>
        ))}

        <div className="absolute bottom-0 right-1 text-[10px] text-gray-500">{position}</div>
      </div>
    );
  };

  const finishedPieces = (playerNum: number) => {
    return gameState.board.pieces.filter(
      (p) => p.playerNumber === playerNum && p.position === 99
    );
  };

  // Create board rows
  const row0 = Array.from({ length: 10 }, (_, i) => i);
  const row1 = Array.from({ length: 10 }, (_, i) => 19 - i);
  const row2 = Array.from({ length: 10 }, (_, i) => i + 20);

  return (
    <div className="space-y-6">
      {/* Player Info */}
      <div className="grid grid-cols-2 gap-4">
        {session.players.map((player) => (
          <div
            key={player.id}
            className={`card ${
              gameState.currentTurn === player.playerNumber
                ? 'border-primary-500'
                : 'border-gray-700'
            }`}
          >
            <div className="flex items-center justify-between mb-2">
              <div className="font-bold">{player.displayName}</div>
              <div
                className={`w-4 h-4 rounded-full ${
                  player.playerNumber === 0 ? 'bg-blue-600' : 'bg-red-600'
                }`}
              />
            </div>
            <div className="text-sm text-gray-400">
              Finished: {finishedPieces(player.playerNumber).length}/5
            </div>
          </div>
        ))}
      </div>

      {/* Dice */}
      <div className="card text-center">
        {gameState.board.diceRoll === null ? (
          <button
            onClick={handleRollDice}
            disabled={!isMyTurn || gameState.finished}
            className="btn btn-primary w-full text-xl py-4"
          >
            🎲 Throw Sticks
          </button>
        ) : (
          <div className="py-4">
            <div className="text-4xl font-bold mb-2">{gameState.board.diceRoll}</div>
            <div className="text-sm text-gray-400">
              {gameState.board.diceRoll === 1 || gameState.board.diceRoll === 4 || gameState.board.diceRoll === 5
                ? 'Make your move (you get another turn!)'
                : 'Make your move'}
            </div>
          </div>
        )}
      </div>

      {/* Board - S-shaped path */}
      <div className="card">
        <div className="space-y-2">
          {/* Row 0: 0-9 (left to right) */}
          <div className="grid grid-cols-10 gap-1 md:gap-2">
            {row0.map((pos) => renderSquare(pos))}
          </div>

          {/* Row 1: 19-10 (right to left) */}
          <div className="grid grid-cols-10 gap-1 md:gap-2">
            {row1.map((pos) => renderSquare(pos))}
          </div>

          {/* Row 2: 20-29 (left to right) */}
          <div className="grid grid-cols-10 gap-1 md:gap-2">
            {row2.map((pos) => renderSquare(pos))}
          </div>
        </div>

        {/* Legend */}
        <div className="mt-4 pt-4 border-t border-gray-700">
          <div className="text-xs text-gray-400 space-y-1">
            <div>🏛️ Special Squares:</div>
            <div>• Position 14: House of Rebirth (captured pieces restart here)</div>
            <div>• Position 25: House of Beauty (need exact roll to leave)</div>
            <div>• Position 26: House of Water (returns to position 14)</div>
          </div>
        </div>
      </div>
    </div>
  );
}
