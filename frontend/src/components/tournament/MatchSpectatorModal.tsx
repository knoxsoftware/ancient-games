import React, { lazy, Suspense } from 'react';
import type {
  Session,
  GameState,
  GameType,
  TournamentMatch,
  TournamentParticipant,
  TournamentFormat,
} from '@ancient-games/shared';
import { getScoreInfo } from '../../utils/gameScoreInfo';

const boardComponents: Record<GameType, React.LazyExoticComponent<React.ComponentType<any>>> = {
  ur: lazy(() => import('../games/ur/UrBoard')),
  senet: lazy(() => import('../games/senet/SenetBoard')),
  morris: lazy(() => import('../games/morris/MorrisBoard')),
  'wolves-and-ravens': lazy(() => import('../games/wolves-and-ravens/WolvesAndRavensBoard')),
  'rock-paper-scissors': lazy(() => import('../games/rock-paper-scissors/RockPaperScissorsBoard')),
  'stellar-siege': lazy(() => import('../games/stellar-siege/StellarSiegeBoard')),
  'fox-and-geese': lazy(() => import('../games/fox-and-geese/FoxAndGeeseBoard')),
};

interface MatchSpectatorModalProps {
  match: TournamentMatch;
  participants: TournamentParticipant[];
  format: TournamentFormat;
  gameType: GameType;
  gameState: GameState;
  session: Session;
  onClose: () => void;
}

function getSeriesLabel(format: TournamentFormat, match: TournamentMatch): string {
  if (format === 'round-robin' || format === 'bo1') return '';
  const total = match.player1Wins + match.player2Wins;
  const maxWins = format === 'bo3' ? 2 : format === 'bo5' ? 3 : 4;
  return `Game ${total + 1} of ${format.toUpperCase()} (First to ${maxWins})`;
}

export default function MatchSpectatorModal({
  match,
  participants: _participants,
  format,
  gameType,
  gameState,
  session,
  onClose,
}: MatchSpectatorModalProps) {
  const BoardComponent = boardComponents[gameType];
  const seriesLabel = getSeriesLabel(format, match);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-3xl max-h-[90vh] overflow-y-auto rounded-xl border border-amber-900/30 bg-stone-900 p-4"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          className="absolute top-3 right-3 text-amber-200/50 hover:text-amber-200 text-xl"
        >
          ✕
        </button>

        {/* Series label */}
        {seriesLabel && (
          <div className="text-center text-xs mb-3" style={{ color: '#6A5A40' }}>
            {seriesLabel}
          </div>
        )}

        {/* Player info panels */}
        <div className="grid grid-cols-2 gap-2 mb-4">
          {([0, 1] as const).map((seatIndex) => {
            const player = session.players.find((p) => p.playerNumber === seatIndex);
            const isActive = player !== undefined && gameState.currentTurn === seatIndex;
            const scoreInfo = player
              ? getScoreInfo(gameType, gameState.board.pieces, seatIndex)
              : null;

            return (
              <div
                key={seatIndex}
                className="rounded-lg p-2.5 border transition-all"
                style={{
                  background: isActive ? 'rgba(196,160,48,0.08)' : 'rgba(8,5,0,0.5)',
                  borderColor: isActive ? 'rgba(196,160,48,0.45)' : 'rgba(42,30,14,0.8)',
                }}
              >
                {player ? (
                  <div>
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span
                        className="flex-shrink-0 w-2 h-2 rounded-full"
                        style={{
                          background: player.status === 'away' ? '#F59E0B' : '#22C55E',
                        }}
                        title={player.status === 'away' ? 'Away' : 'Active'}
                      />
                      <span
                        className="text-sm font-semibold truncate"
                        style={{ color: '#E8D8B0' }}
                      >
                        {player.displayName}
                      </span>
                      <div className="ml-auto flex items-center gap-1.5 flex-shrink-0">
                        {isActive && (
                          <span
                            className="text-xs px-1.5 py-0.5 rounded font-bold"
                            style={{ background: 'rgba(196,160,48,0.25)', color: '#E8C870' }}
                          >
                            Turn
                          </span>
                        )}
                        {format !== 'bo1' && format !== 'round-robin' && (
                          <span
                            className="text-xs font-bold"
                            style={{ color: '#8A7A60' }}
                          >
                            {seatIndex === 0 ? match.player1Wins : match.player2Wins}W
                          </span>
                        )}
                      </div>
                    </div>
                    {scoreInfo && (
                      <div className="text-xs mt-0.5" style={{ color: '#8A7A60' }}>
                        {scoreInfo}
                      </div>
                    )}
                  </div>
                ) : (
                  <span className="text-xs" style={{ color: '#5A4A38' }}>
                    {seatIndex === 0 ? 'Player 1' : 'Player 2'}
                  </span>
                )}
              </div>
            );
          })}
        </div>

        {/* Board */}
        <div className="flex justify-center">
          <Suspense
            fallback={
              <div className="flex items-center justify-center py-16 text-sm text-amber-200/50">
                Loading…
              </div>
            }
          >
            <BoardComponent
              session={session}
              gameState={gameState}
              playerId=""
              isMyTurn={false}
              animatingPiece={null}
              boardOnly={true}
            />
          </Suspense>
        </div>
      </div>
    </div>
  );
}
