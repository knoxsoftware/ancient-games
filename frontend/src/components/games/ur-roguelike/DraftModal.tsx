import { Session, GameState } from '@ancient-games/shared';
import { socketService } from '../../../services/socket';
import { POWER_UP_DISPLAY } from './roguelikeConstants';

interface DraftModalProps {
  session: Session;
  gameState: GameState;
  playerId: string;
}

export default function DraftModal({ session, gameState, playerId }: DraftModalProps) {
  const board = gameState.board;
  const player = session.players.find((p) => p.id === playerId);
  if (!player) return null;

  const myOffer = board.draftOffers?.find((o) => o.player === player?.playerNumber);
  const iWaiting = !myOffer;

  const pick = (powerId: string) => {
    socketService.getSocket()?.emit('game:draft-pick', {
      sessionCode: session.sessionCode,
      playerId,
      powerId,
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70">
      <div
        className="rounded-xl p-6 max-w-sm w-full mx-4"
        style={{ background: '#1A1510', border: '1px solid #4A3A20' }}
      >
        <h2 className="text-lg font-bold mb-1" style={{ color: '#E8C870' }}>
          ⚗️ Choose Your Power
        </h2>
        <p className="text-sm mb-4" style={{ color: '#7A6A50' }}>
          Pick one ability for this run. Your opponent is choosing simultaneously.
        </p>

        {iWaiting ? (
          <div className="text-center py-6" style={{ color: '#7A6A50' }}>
            You have chosen. Waiting for opponent…
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {myOffer.options.map((id) => {
              const info = POWER_UP_DISPLAY[id];
              if (!info) return null;
              return (
                <button
                  key={id}
                  onClick={() => pick(id)}
                  className="rounded-lg p-3 text-left transition-colors"
                  style={{ background: '#2A1E10', border: '1px solid #5A4020' }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = '#3A2A14')}
                  onMouseLeave={(e) => (e.currentTarget.style.background = '#2A1E10')}
                >
                  <div className="font-semibold text-sm" style={{ color: '#E8C870' }}>
                    {info.emoji} {info.name}
                  </div>
                  <div className="text-xs mt-0.5" style={{ color: '#9A8A6A' }}>
                    {info.description}
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
