import { socketService } from '../../../services/socket';
import { GameControlsProps } from '../../GameControls';

export default function StellarSiegeControls({
  session,
  gameState,
  playerId,
  isMyTurn,
}: GameControlsProps) {
  const { sessionCode } = session;
  const diceRoll = gameState.board.diceRoll;
  const currentTurnName =
    session.players.find((p) => p.playerNumber === gameState.currentTurn)?.displayName ??
    'opponent';
  const myPN = session.players.find((p) => p.id === playerId)?.playerNumber ?? 0;

  const handleRollDice = () => {
    if (!isMyTurn || diceRoll !== null) return;
    socketService.getSocket()?.emit('game:roll-dice', { sessionCode, playerId });
  };

  const boardPieces = gameState.board.pieces;
  const defenderPN = boardPieces.filter((p) => p.playerNumber === 0).length === 1 ? 0 : 1;
  const isDefender = myPN === defenderPN;

  if (!isMyTurn || gameState.finished) {
    return (
      <div className="p-3">
        <div
          className="rounded-lg p-3 text-sm text-center"
          style={{
            background: 'rgba(0,10,25,0.7)',
            border: '1px solid rgba(0,50,100,0.4)',
            color: '#2A5070',
          }}
        >
          Waiting for {currentTurnName}…
        </div>
      </div>
    );
  }

  return (
    <div className="flex gap-3 items-center justify-center p-4">
      {diceRoll === null && (
        <button
          onClick={handleRollDice}
          className="px-8 py-2 rounded-lg font-bold transition-all active:scale-95"
          style={{
            background: isDefender
              ? 'linear-gradient(135deg, #0080B0 0%, #004060 100%)'
              : 'linear-gradient(135deg, #207020 0%, #0A3010 100%)',
            color: isDefender ? '#80DFFF' : '#7FFF5A',
            border: `1.5px solid ${isDefender ? 'rgba(0,180,255,0.5)' : 'rgba(57,255,20,0.4)'}`,
          }}
        >
          {isDefender ? '🎯 Fire' : '👾 Advance'}
        </button>
      )}
    </div>
  );
}
