import { socketService } from '../../../services/socket';
import { GameControlsProps } from '../../GameControls';

export default function BombermageControls({ session, gameState, playerId, isMyTurn }: GameControlsProps) {
  const board = gameState.board as any;
  const players: any[] = board.players ?? [];
  const myPlayer = session.players.find((p) => p.id === playerId);
  const myPN = myPlayer?.playerNumber ?? -1;
  const me = players[myPN];
  const opponent = players[1 - myPN];

  const ap: number = board.actionPointsRemaining ?? 0;
  const diceRoll: number | null = board.diceRoll;

  function handleEndTurn() {
    const socket = socketService.getSocket();
    socket.emit('game:move', {
      sessionCode: session.sessionCode,
      playerId,
      move: { playerId, pieceIndex: 0, from: 0, to: 0, extra: { type: 'end-turn' } },
    });
  }

  if (!me) return null;

  const inv = me.inventory;
  const activeInventory = [
    inv.blastRadius > 1 && `Blast +${inv.blastRadius - 1}`,
    inv.maxBombs > 1 && `${inv.maxBombs} Bombs`,
    inv.kickBomb && 'Kick Bomb',
    inv.manualDetonation && 'Manual Det.',
    inv.shield && 'Shield',
    inv.speedBoostTurnsRemaining > 0 && `Speed (${inv.speedBoostTurnsRemaining})`,
  ].filter(Boolean) as string[];

  return (
    <div className="flex flex-col gap-3 p-3 text-sm">
      <div className="flex items-center gap-2">
        <span className="text-stone-400">Roll:</span>
        <span className="text-yellow-300 font-bold text-lg">{diceRoll ?? '—'}</span>
        <span className="text-stone-400 ml-3">AP remaining:</span>
        <span className="text-green-400 font-bold text-lg">{diceRoll !== null ? ap : '—'}</span>
      </div>

      <div className="text-xs text-stone-500 flex gap-3">
        <span>Move: 1 AP</span>
        <span>Bomb: 2 AP</span>
        <span>Kick: 1 AP</span>
      </div>

      <div>
        <div className="text-stone-400 text-xs mb-1">Your powerups</div>
        {activeInventory.length === 0 ? (
          <span className="text-stone-600 text-xs">None</span>
        ) : (
          <div className="flex flex-wrap gap-1">
            {activeInventory.map((label) => (
              <span key={label} className="bg-stone-700 text-stone-200 px-2 py-0.5 rounded text-xs">
                {label}
              </span>
            ))}
          </div>
        )}
      </div>

      {opponent && (
        <div>
          <div className="text-stone-400 text-xs mb-1">Opponent powerups</div>
          <div className="flex flex-wrap gap-1">
            {opponent.inventory.blastRadius > 1 && (
              <span className="bg-stone-700 text-stone-400 px-2 py-0.5 rounded text-xs">Blast +{opponent.inventory.blastRadius - 1}</span>
            )}
            {opponent.inventory.maxBombs > 1 && (
              <span className="bg-stone-700 text-stone-400 px-2 py-0.5 rounded text-xs">{opponent.inventory.maxBombs} Bombs</span>
            )}
            {opponent.inventory.kickBomb && (
              <span className="bg-stone-700 text-stone-400 px-2 py-0.5 rounded text-xs">Kick Bomb</span>
            )}
            {opponent.inventory.shield && (
              <span className="bg-stone-700 text-stone-400 px-2 py-0.5 rounded text-xs">Shield</span>
            )}
          </div>
        </div>
      )}

      <div className="text-xs text-stone-400">
        Bombs: {me.activeBombCount}/{me.inventory.maxBombs} placed
      </div>

      {isMyTurn && diceRoll !== null && (
        <button
          onClick={handleEndTurn}
          className="mt-1 px-3 py-1.5 bg-stone-600 hover:bg-stone-500 text-white rounded text-sm font-medium"
        >
          End Turn
        </button>
      )}

      {!isMyTurn && (
        <div className="text-stone-500 text-xs italic">Opponent's turn...</div>
      )}
    </div>
  );
}
