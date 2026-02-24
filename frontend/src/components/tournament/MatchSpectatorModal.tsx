import React, { lazy, Suspense } from 'react';
import type {
  Session,
  GameState,
  GameType,
  TournamentMatch,
  TournamentParticipant,
  TournamentFormat,
} from '@ancient-games/shared';

const boardComponents: Record<GameType, React.LazyExoticComponent<React.ComponentType<any>>> = {
  ur: lazy(() => import('../games/ur/UrBoard')),
  senet: lazy(() => import('../games/senet/SenetBoard')),
  morris: lazy(() => import('../games/morris/MorrisBoard')),
  'wolves-and-ravens': lazy(() => import('../games/wolves-and-ravens/WolvesAndRavensBoard')),
  'rock-paper-scissors': lazy(() => import('../games/rock-paper-scissors/RockPaperScissorsBoard')),
  'stellar-siege': lazy(() => import('../games/stellar-siege/StellarSiegeBoard')),
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
  participants,
  format,
  gameType,
  gameState,
  session,
  onClose,
}: MatchSpectatorModalProps) {
  const p1 = participants.find((p) => p.id === match.player1Id);
  const p2 = participants.find((p) => p.id === match.player2Id);
  const BoardComponent = boardComponents[gameType];
  const seriesLabel = getSeriesLabel(format, match);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-3xl max-h-[90vh] overflow-y-auto rounded-xl border border-amber-900/30 bg-stone-900 p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          className="absolute top-3 right-3 text-amber-200/50 hover:text-amber-200 text-xl"
        >
          ✕
        </button>

        <div className="flex items-center justify-between mb-4">
          <div className="text-amber-200 font-semibold text-lg">{p1?.displayName ?? 'TBD'}</div>
          <div className="text-center">
            {format !== 'bo1' && format !== 'round-robin' && (
              <div className="text-amber-200 font-bold text-xl">
                {match.player1Wins} – {match.player2Wins}
              </div>
            )}
            {seriesLabel && <div className="text-amber-200/50 text-xs">{seriesLabel}</div>}
          </div>
          <div className="text-amber-200 font-semibold text-lg">{p2?.displayName ?? 'TBD'}</div>
        </div>

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
            />
          </Suspense>
        </div>

        {gameState.moveHistory && gameState.moveHistory.length > 0 && (
          <div className="mt-4 max-h-32 overflow-y-auto rounded border border-amber-900/20 bg-stone-800 p-3">
            <div className="text-amber-200/50 text-xs font-semibold mb-2">Move Log</div>
            <div className="space-y-1">
              {gameState.moveHistory.slice(-10).map((entry, i) => {
                const playerName =
                  entry.playerNumber === 1 ? (p1?.displayName ?? 'P1') : (p2?.displayName ?? 'P2');
                return (
                  <div key={i} className="text-xs text-amber-200/70">
                    <span className="font-medium">{playerName}</span>
                    {entry.isSkip ? ' skipped' : ` moved ${entry.move.from} → ${entry.move.to}`}
                    {entry.wasCapture && <span className="text-red-400 ml-1">capture!</span>}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
