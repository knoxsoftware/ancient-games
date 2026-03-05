import { socketService } from '../../../services/socket';
import { GameControlsProps } from '../../GameControls';

const PLAYER_COLORS = ['#F97316', '#8B5CF6'];

export default function BombermageControls({ session, gameState, playerId, isMyTurn }: GameControlsProps) {
  const board = gameState.board as any;
  const players: any[] = board.players ?? [];
  const myPlayer = session.players.find((p) => p.id === playerId);
  const myPN = myPlayer?.playerNumber ?? -1;
  const me = players[myPN];

  const ap: number = board.actionPointsRemaining ?? 0;
  const diceRoll: number | null = board.diceRoll;

  function handleEndTurn() {
    const socket = socketService.getSocket();
    if (!socket) return;
    socket.emit('game:move', {
      sessionCode: session.sessionCode,
      playerId,
      move: Object.assign({ playerId, pieceIndex: 0, from: 0, to: 0 }, { extra: { type: 'end-turn' } }),
    });
  }

  function handleRollDice() {
    const socket = socketService.getSocket();
    if (!socket) return;
    socket.emit('game:roll-dice', {
      sessionCode: session.sessionCode,
      playerId,
    });
  }

  if (!me) return null;

  function renderPlayerPanel(player: any, playerNumber: number, isMe: boolean) {
    if (!player) return <div className="flex-1" />;
    const color = PLAYER_COLORS[playerNumber];
    const inv = player.inventory;
    const badges: string[] = [
      inv.blastRadius > 1 ? `Blast +${inv.blastRadius - 1}` : '',
      inv.maxBombs > 1 ? `${inv.maxBombs} Bombs` : '',
      inv.kickBomb ? 'Kick' : '',
      inv.manualDetonation ? 'Det.' : '',
      inv.shield ? 'Shield' : '',
      inv.speedBoostTurnsRemaining > 0 ? `Speed(${inv.speedBoostTurnsRemaining})` : '',
    ].filter(Boolean);

    return (
      <div className={`flex flex-col gap-1 px-2 ${isMe ? 'items-start' : 'items-end'}`}>
        <div className="flex items-center gap-1.5">
          <div
            className="w-3 h-3 rounded-full border border-white/30 flex-shrink-0"
            style={{ backgroundColor: color }}
          />
          <span className={`text-xs font-semibold truncate max-w-[80px] ${isMe ? 'text-white' : 'text-stone-400'}`}>
            {isMe ? 'You' : (session.players.find(p => p.playerNumber === playerNumber)?.displayName ?? 'Opponent')}
          </span>
        </div>
        <div className={`text-xs ${isMe ? 'text-stone-300' : 'text-stone-500'}`}>
          {player.activeBombCount}/{inv.maxBombs} 💣
        </div>
        <div className={`flex flex-wrap gap-0.5 ${isMe ? '' : 'justify-end'}`}>
          {badges.map(label => (
            <span
              key={label}
              className={`text-[9px] px-1 py-0.5 rounded ${isMe ? 'bg-stone-700 text-stone-200' : 'bg-stone-800 text-stone-500'}`}
            >
              {label}
            </span>
          ))}
        </div>
      </div>
    );
  }

  function renderCenter() {
    const currentTurnName =
      session.players.find(p => p.playerNumber === board.currentTurn)?.displayName ?? 'Opponent';

    return (
      <div className="flex flex-col items-center justify-center gap-1 px-2 min-w-0">
        {diceRoll === null ? (
          isMyTurn ? (
            <button
              onClick={handleRollDice}
              className="px-3 py-1.5 rounded-lg font-bold text-sm transition-all active:scale-95"
              style={{
                background: 'linear-gradient(135deg, #f97316 0%, #c2410c 100%)',
                color: '#fff',
                border: '2px solid #f97316',
              }}
            >
              Roll Dice
            </button>
          ) : (
            <div className="text-xs text-stone-500 italic text-center">
              Waiting for<br />
              <span className="text-stone-300">{currentTurnName}</span>
            </div>
          )
        ) : (
          <>
            <div className="flex items-center gap-1.5">
              <span className="text-yellow-300 font-bold text-lg">{diceRoll}</span>
              <span className="text-stone-500 text-xs">roll</span>
              <span className="text-stone-600">|</span>
              <span className="text-green-400 font-bold text-lg">{ap}</span>
              <span className="text-stone-500 text-xs">AP</span>
            </div>
            <div className="text-[9px] text-stone-600 flex gap-2">
              <span>Move 1AP</span>
              <span>Bomb 2AP</span>
            </div>
            {isMyTurn && (
              <button
                onClick={handleEndTurn}
                className="mt-0.5 px-2 py-1 bg-stone-600 hover:bg-stone-500 text-white rounded text-xs font-medium"
              >
                End Turn
              </button>
            )}
          </>
        )}
      </div>
    );
  }

  const opponent = players[1 - myPN];

  return (
    <div className="w-full h-full flex items-center">
      <div className="w-full grid grid-cols-3 gap-1 py-2">
        {renderPlayerPanel(me, myPN, true)}
        {renderCenter()}
        {renderPlayerPanel(opponent, 1 - myPN, false)}
      </div>
    </div>
  );
}
