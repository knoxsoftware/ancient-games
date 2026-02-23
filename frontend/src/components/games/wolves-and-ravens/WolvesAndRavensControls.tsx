import { socketService } from '../../../services/socket';
import { GameControlsProps } from '../../GameControls';

export default function WolvesAndRavensControls({ session, gameState, playerId, isMyTurn }: GameControlsProps) {
  const { sessionCode } = session;
  const diceRoll = gameState.board.diceRoll;
  const currentTurnName =
    session.players.find((p) => p.playerNumber === gameState.currentTurn)?.displayName ?? 'opponent';
  const myPN = session.players.find((p) => p.id === playerId)?.playerNumber ?? 0;

  const handleRollDice = () => {
    if (!isMyTurn || diceRoll !== null) return;
    socketService.getSocket()?.emit('game:roll-dice', { sessionCode, playerId });
  };

  const handleEndTurn = () => {
    socketService.getSocket()?.emit('game:skip-turn', { sessionCode, playerId });
  };

  const boardPieces = gameState.board.pieces;
  const ravenPN = boardPieces.filter(p => p.playerNumber === 0).length === 1 ? 1 : 0;

  if (!isMyTurn || gameState.finished) {
    return (
      <div className="p-3">
        <div
          className="rounded-lg p-3 text-sm text-center"
          style={{ background: 'rgba(30,20,10,0.6)', border: '1px solid rgba(80,60,30,0.4)', color: '#8A7A60' }}
        >
          Waiting for {currentTurnName}…
        </div>
      </div>
    );
  }

  return (
    <div className="flex gap-3 items-center justify-center p-4">
      {diceRoll === null ? (
        <button onClick={handleRollDice} className="btn btn-primary px-8 py-2">
          Roll Dice
        </button>
      ) : myPN === ravenPN && diceRoll > 0 ? (
        <button
          onClick={handleEndTurn}
          className="btn btn-outline text-sm px-5 py-2"
          style={{ borderColor: 'rgba(100,200,100,0.4)', color: '#90D090' }}
        >
          Done&nbsp;Moving&nbsp;({diceRoll}&nbsp;left)
        </button>
      ) : null}
    </div>
  );
}
