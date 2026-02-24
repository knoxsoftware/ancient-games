import { GameControlsProps } from '../../GameControls';

export default function MorrisControls({ session, gameState, isMyTurn }: GameControlsProps) {
  const currentTurnName =
    session.players.find((p) => p.playerNumber === gameState.currentTurn)?.displayName ??
    'opponent';

  return (
    <div className="p-3">
      <div
        className="rounded-lg p-3 text-sm text-center"
        style={{
          background: 'rgba(30,20,10,0.6)',
          border: '1px solid rgba(80,60,30,0.4)',
          color: isMyTurn ? '#F0E6C8' : '#8A7A60',
        }}
      >
        {isMyTurn ? 'Your turn — make your move on the board' : `Waiting for ${currentTurnName}…`}
      </div>
    </div>
  );
}
