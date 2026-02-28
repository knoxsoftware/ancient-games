import { GameControlsProps } from '../../GameControls';

export default function MorrisControls({ session, gameState, isMyTurn }: GameControlsProps) {
  const currentTurnName =
    session.players.find((p) => p.playerNumber === gameState.currentTurn)?.displayName ??
    'opponent';

  return (
    <div
      className="flex items-center justify-center px-4 py-2 text-sm text-center"
      style={{ color: isMyTurn ? '#F0E6C8' : '#8A7A60' }}
    >
      {isMyTurn ? 'Your turn — make your move on the board' : `Waiting for ${currentTurnName}…`}
    </div>
  );
}
