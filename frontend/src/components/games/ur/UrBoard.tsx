import { Session, GameState, Move, PiecePosition } from '@ancient-games/shared';
import { socketService } from '../../../services/socket';

interface UrBoardProps {
  session: Session;
  gameState: GameState;
  playerId: string;
  isMyTurn: boolean;
}

export default function UrBoard({ session, gameState, playerId, isMyTurn }: UrBoardProps) {
  const currentPlayer = session.players.find((p) => p.id === playerId);
  const playerNumber = currentPlayer?.playerNumber ?? 0;

  const ROSETTE_POSITIONS = [2, 6, 12];

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

    // Calculate move
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

  const getPiecesAtPosition = (position: number, player: number): PiecePosition[] => {
    return gameState.board.pieces.filter(
      (p) => p.position === position && p.playerNumber === player
    );
  };

  const renderSquare = (position: number, player: number, isRosette: boolean) => {
    const pieces = getPiecesAtPosition(position, player);
    const isShared = position >= 4 && position <= 11;

    return (
      <div
        key={`${player}-${position}`}
        className={`aspect-square border-2 rounded-lg flex items-center justify-center relative transition-all ${
          isRosette
            ? 'bg-amber-800 border-amber-500'
            : isShared
            ? 'bg-purple-900 border-purple-600'
            : player === 0
            ? 'bg-blue-900 border-blue-600'
            : 'bg-red-900 border-red-600'
        }`}
      >
        {isRosette && (
          <div className="absolute inset-0 flex items-center justify-center text-3xl opacity-40">
            ✧
          </div>
        )}

        {pieces.map((piece) => (
          <button
            key={`${piece.playerNumber}-${piece.pieceIndex}`}
            onClick={() => handlePieceClick(piece)}
            disabled={!isMyTurn || piece.playerNumber !== playerNumber}
            className={`w-10 h-10 rounded-full border-2 font-bold text-sm transition-transform z-10 ${
              piece.playerNumber === 0
                ? 'bg-blue-500 border-blue-300'
                : 'bg-red-500 border-red-300'
            } ${
              isMyTurn && piece.playerNumber === playerNumber
                ? 'cursor-pointer hover:scale-110 active:scale-95'
                : 'cursor-not-allowed opacity-70'
            }`}
          >
            {piece.pieceIndex + 1}
          </button>
        ))}

        <div className="absolute bottom-0.5 right-1 text-[10px] text-gray-500">{position}</div>
      </div>
    );
  };

  const renderSharedSquare = (sharedIndex: number) => {
    // Shared positions are 4-11, which map to sharedIndex 0-7
    const position = sharedIndex + 4;
    const isRosette = ROSETTE_POSITIONS.includes(position);
    const piecesP0 = getPiecesAtPosition(position, 0);
    const piecesP1 = getPiecesAtPosition(position, 1);
    const allPieces = [...piecesP0, ...piecesP1];

    return (
      <div
        key={`shared-${position}`}
        className={`aspect-square border-2 rounded-lg flex items-center justify-center relative transition-all ${
          isRosette
            ? 'bg-amber-800 border-amber-500'
            : 'bg-purple-900 border-purple-600'
        }`}
      >
        {isRosette && (
          <div className="absolute inset-0 flex items-center justify-center text-3xl opacity-40">
            ✧
          </div>
        )}

        <div className="flex gap-1">
          {allPieces.map((piece) => (
            <button
              key={`${piece.playerNumber}-${piece.pieceIndex}`}
              onClick={() => handlePieceClick(piece)}
              disabled={!isMyTurn || piece.playerNumber !== playerNumber}
              className={`w-8 h-8 rounded-full border-2 font-bold text-xs transition-transform z-10 ${
                piece.playerNumber === 0
                  ? 'bg-blue-500 border-blue-300'
                  : 'bg-red-500 border-red-300'
              } ${
                isMyTurn && piece.playerNumber === playerNumber
                  ? 'cursor-pointer hover:scale-110 active:scale-95'
                  : 'cursor-not-allowed opacity-70'
              }`}
            >
              {piece.pieceIndex + 1}
            </button>
          ))}
        </div>

        <div className="absolute bottom-0.5 right-1 text-[10px] text-gray-400">{position}</div>
      </div>
    );
  };

  const offBoardPieces = (playerNum: number) => {
    return gameState.board.pieces.filter(
      (p) => p.playerNumber === playerNum && p.position === -1
    );
  };

  const finishedPieces = (playerNum: number) => {
    return gameState.board.pieces.filter(
      (p) => p.playerNumber === playerNum && p.position === 99
    );
  };

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
                  player.playerNumber === 0 ? 'bg-blue-500' : 'bg-red-500'
                }`}
              />
            </div>
            <div className="text-sm text-gray-400">
              Finished: {finishedPieces(player.playerNumber).length}/7
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
            🎲 Roll Dice
          </button>
        ) : (
          <div className="py-4">
            <div className="text-4xl font-bold mb-2">{gameState.board.diceRoll}</div>
            <div className="text-sm text-gray-400">Select a piece to move</div>
          </div>
        )}
      </div>

      {/* Royal Game of Ur Board - Historical Layout */}
      <div className="card">
        <div className="text-center text-sm text-gray-400 mb-4">
          Royal Game of Ur - Historical Layout
        </div>

        <div className="space-y-2">
          {/* Player 1 (Red) - Top Row - Private Lane + End Lane */}
          <div className="grid grid-cols-10 gap-1 md:gap-2">
            {/* Private start lane 3-0 (reversed visually, pieces enter at 0) */}
            {[3, 2, 1, 0].map((pos) => renderSquare(pos, 1, ROSETTE_POSITIONS.includes(pos)))}
            {/* Empty spaces */}
            <div className="aspect-square"></div>
            <div className="aspect-square"></div>
            <div className="aspect-square"></div>
            <div className="aspect-square"></div>
            {/* Private end lane 12-13 */}
            {[12, 13].map((pos) => renderSquare(pos, 1, ROSETTE_POSITIONS.includes(pos)))}
          </div>

          {/* Shared Middle Row */}
          <div className="grid grid-cols-10 gap-1 md:gap-2">
            {/* Shared section 4-11 (8 squares) */}
            {[0, 1, 2, 3, 4, 5, 6, 7].map((idx) => renderSharedSquare(idx))}
            {/* Empty spaces */}
            <div className="aspect-square"></div>
            <div className="aspect-square"></div>
          </div>

          {/* Player 0 (Blue) - Bottom Row - Private Lane + End Lane */}
          <div className="grid grid-cols-10 gap-1 md:gap-2">
            {/* Private start lane 3-0 (reversed visually, pieces enter at 0) */}
            {[3, 2, 1, 0].map((pos) => renderSquare(pos, 0, ROSETTE_POSITIONS.includes(pos)))}
            {/* Empty spaces */}
            <div className="aspect-square"></div>
            <div className="aspect-square"></div>
            <div className="aspect-square"></div>
            <div className="aspect-square"></div>
            {/* Private end lane 12-13 */}
            {[12, 13].map((pos) => renderSquare(pos, 0, ROSETTE_POSITIONS.includes(pos)))}
          </div>
        </div>

        {/* Legend */}
        <div className="mt-6 pt-4 border-t border-gray-700">
          <div className="text-xs text-gray-400 space-y-1">
            <div>✧ Rosette: Landing here gives an extra turn and safety from capture</div>
            <div>🔵 Blue pieces (Player {session.players[0]?.displayName})</div>
            <div>🔴 Red pieces (Player {session.players[1]?.displayName})</div>
            <div>🟣 Purple: Shared path where pieces can capture opponents</div>
          </div>
        </div>
      </div>

      {/* Off-board pieces */}
      <div className="grid grid-cols-2 gap-4">
        {session.players.map((player) => (
          <div key={player.id} className="card">
            <div className="text-sm font-medium mb-2">
              {player.displayName} - Ready to Enter
            </div>
            <div className="flex flex-wrap gap-2">
              {offBoardPieces(player.playerNumber).map((piece) => (
                <button
                  key={`${piece.playerNumber}-${piece.pieceIndex}`}
                  onClick={() => handlePieceClick(piece)}
                  disabled={!isMyTurn || piece.playerNumber !== playerNumber}
                  className={`w-10 h-10 rounded-full border-2 font-bold text-sm ${
                    piece.playerNumber === 0
                      ? 'bg-blue-500 border-blue-300'
                      : 'bg-red-500 border-red-300'
                  } ${
                    isMyTurn && piece.playerNumber === playerNumber
                      ? 'cursor-pointer hover:scale-110'
                      : 'cursor-not-allowed opacity-50'
                  }`}
                >
                  {piece.pieceIndex + 1}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
