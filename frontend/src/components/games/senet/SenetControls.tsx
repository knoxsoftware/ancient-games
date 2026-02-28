import { socketService } from '../../../services/socket';
import { GameControlsProps } from '../../GameControls';
import { ThrowingSticks } from './SenetBoard';

export default function SenetControls({
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

  const handleRollDice = () => {
    if (!isMyTurn || diceRoll !== null) return;
    socketService.getSocket()?.emit('game:roll-dice', { sessionCode, playerId });
  };

  const extraTurn = [1, 4, 5].includes(diceRoll ?? -1);

  return (
    <div className="flex flex-col items-center justify-center px-4 py-2 gap-1">
      {diceRoll === null ? (
        isMyTurn ? (
          <button
            onClick={handleRollDice}
            disabled={gameState.finished}
            className="w-full py-2 rounded-lg font-bold transition-all active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed"
            style={{
              background: 'linear-gradient(135deg, #C4860A 0%, #7A5000 100%)',
              color: '#F5EDD5',
              border: '2px solid #C4860A',
              fontSize: '1rem',
              letterSpacing: '0.02em',
            }}
          >
            Throw the Sticks
          </button>
        ) : (
          <div className="text-center text-sm" style={{ color: '#A09070' }}>
            Waiting for <span style={{ color: '#F5EDD5' }}>{currentTurnName}</span> to throw…
          </div>
        )
      ) : (
        <>
          <div className="flex items-center gap-2">
            <ThrowingSticks result={diceRoll} />
            <div className="text-2xl font-bold" style={{ color: '#F5EDD5' }}>
              {diceRoll}
            </div>
          </div>
          <div className="text-xs" style={{ color: '#A09070' }}>
            {extraTurn
              ? 'Extra turn — select a piece.'
              : !isMyTurn
                ? `Waiting for ${currentTurnName} to move…`
                : 'Select a piece to move.'}
          </div>
        </>
      )}
    </div>
  );
}
