import { socketService } from '../../../services/socket';
import { GameControlsProps } from '../../GameControls';
import { TetraDice } from './UrBoard';

export default function UrControls({
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

  return (
    <div className="p-2 space-y-2">
      <div
        className="rounded-xl px-3 py-2 sm:px-4 sm:py-3 border"
        style={{ background: 'rgba(5,3,0,0.7)', borderColor: '#2A1E0E' }}
      >
        <div className="flex flex-col items-center justify-center min-h-[60px] sm:min-h-[92px]">
          {diceRoll === null ? (
            isMyTurn ? (
              <button
                onClick={handleRollDice}
                disabled={gameState.finished}
                className="w-full py-3 rounded-lg font-bold transition-all active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed"
                style={{
                  background: 'linear-gradient(135deg, #C4860A 0%, #7A5000 100%)',
                  color: '#F0EDE0',
                  border: '2px solid #C4860A',
                  fontSize: '1rem',
                  letterSpacing: '0.02em',
                }}
              >
                Roll the Dice
              </button>
            ) : (
              <div className="text-center text-sm" style={{ color: '#907A60' }}>
                Waiting for <span style={{ color: '#F0EDE0' }}>{currentTurnName}</span> to roll…
              </div>
            )
          ) : (
            <div className="flex flex-col items-center gap-1">
              <TetraDice result={diceRoll} />
              <div className="text-2xl font-bold" style={{ color: '#F0EDE0' }}>
                {diceRoll}
              </div>
              <div className="text-xs" style={{ color: '#907A60' }}>
                {diceRoll === 0
                  ? 'No move — turn passes.'
                  : !isMyTurn
                    ? `Waiting for ${currentTurnName} to move…`
                    : 'Select a piece to move.'}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
