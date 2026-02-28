import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Session } from '@ancient-games/shared';
import { GAME_MANIFESTS } from '@ancient-games/shared';
import { api } from '../services/api';
import { sessionHistory, SessionHistoryEntry } from '../services/sessionHistory';
import { PLAYER_ID_KEY } from '../services/storage';

interface LiveSession {
  entry: SessionHistoryEntry;
  session: Session;
}

function formatBadge(lobbyFormat?: string): string {
  if (!lobbyFormat || lobbyFormat === 'single') return 'Single Game';
  if (lobbyFormat === 'round-robin') return 'Round Robin';
  if (lobbyFormat === 'bo1') return 'Best of 1';
  if (lobbyFormat === 'bo3') return 'Best of 3';
  if (lobbyFormat === 'bo5') return 'Best of 5';
  if (lobbyFormat === 'bo7') return 'Best of 7';
  return lobbyFormat;
}

export default function ActiveGames() {
  const navigate = useNavigate();
  const [liveSessions, setLiveSessions] = useState<LiveSession[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const playerId = localStorage.getItem(PLAYER_ID_KEY);
    const entries = sessionHistory.getSessions();
    if (entries.length === 0) {
      setLoaded(true);
      return;
    }

    Promise.all(
      entries.map(async (entry) => {
        try {
          const session = await api.getSession(entry.sessionCode);
          if (session.status === 'finished') {
            sessionHistory.removeSession(entry.sessionCode);
            return null;
          }
          const isPresent =
            playerId &&
            (session.players.some((p) => p.id === playerId) ||
              session.spectators.some((s) => s.id === playerId));
          if (!isPresent) {
            sessionHistory.removeSession(entry.sessionCode);
            return null;
          }
          return { entry, session } as LiveSession;
        } catch {
          sessionHistory.removeSession(entry.sessionCode);
          return null;
        }
      }),
    ).then((results) => {
      setLiveSessions(results.filter((r): r is LiveSession => r !== null));
      setLoaded(true);
    });
  }, []);

  if (!loaded || liveSessions.length === 0) return null;

  const playerId = localStorage.getItem(PLAYER_ID_KEY);

  return (
    <div className="mb-6">
      <h2 className="text-lg font-semibold text-gray-300 mb-3">Your Active Games</h2>
      <div className="space-y-3">
        {liveSessions.map(({ entry, session }) => {
          const manifest = GAME_MANIFESTS[session.gameType];
          const isPlaying = session.status === 'playing';
          const destination = isPlaying
            ? `/game/${session.sessionCode}`
            : `/session/${session.sessionCode}`;

          return (
            <div
              key={session.sessionCode}
              className="card flex items-center justify-between gap-4 py-3 px-4"
            >
              <div className="flex items-center gap-3 min-w-0">
                <span className="text-2xl flex-shrink-0">{manifest?.emoji ?? '🎲'}</span>
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold">{manifest?.title ?? session.gameType}</span>
                    <span className="text-xs px-2 py-0.5 rounded-full bg-gray-700 text-gray-300">
                      {formatBadge(entry.lobbyFormat)}
                    </span>
                    <span
                      className={`text-xs px-2 py-0.5 rounded-full ${
                        isPlaying
                          ? 'bg-green-500/20 text-green-300'
                          : 'bg-yellow-500/20 text-yellow-300'
                      }`}
                    >
                      {isPlaying ? 'In Progress' : 'Waiting'}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                    {session.players.map((p) => (
                      <span
                        key={p.id}
                        className={`text-xs px-2 py-0.5 rounded-full border ${
                          p.id === playerId
                            ? 'border-primary-500 text-primary-300 bg-primary-500/10'
                            : 'border-gray-600 text-gray-400'
                        }`}
                      >
                        {p.displayName}
                      </span>
                    ))}
                    {session.spectators.length > 0 && (
                      <span className="text-xs text-gray-500">
                        +{session.spectators.length} watching
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-gray-600 mt-0.5 font-mono">
                    {session.sessionCode}
                  </div>
                </div>
              </div>
              <button
                onClick={() => navigate(destination)}
                className="btn btn-primary flex-shrink-0 text-sm py-1.5 px-4"
              >
                Rejoin
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
