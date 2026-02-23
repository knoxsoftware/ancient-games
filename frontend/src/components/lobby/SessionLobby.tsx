import { useEffect, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Session, TournamentFormat } from '@ancient-games/shared';
import { socketService } from '../../services/socket';
import { api } from '../../services/api';
import { initPushNotifications } from '../../services/pushNotifications';
import TournamentBracket from '../tournament/TournamentBracket';

const GAME_NAMES: Record<string, string> = {
  ur: 'Royal Game of Ur',
  senet: 'Senet',
  morris: "Nine Men's Morris",
  'wolves-and-ravens': 'Wolves & Ravens',
  'rock-paper-scissors': 'Rock Paper Scissors',
  'stellar-siege': 'Stellar Siege',
};

const FORMAT_OPTIONS: { value: TournamentFormat | 'single'; label: string; desc: string }[] = [
  { value: 'single', label: 'Single Match', desc: '1 game, 2 players only' },
  { value: 'bo1', label: 'Best of 1', desc: 'Elimination, 1 game per match' },
  { value: 'bo3', label: 'Best of 3', desc: 'Elimination, first to 2 wins' },
  { value: 'bo5', label: 'Best of 5', desc: 'Elimination, first to 3 wins' },
  { value: 'bo7', label: 'Best of 7', desc: 'Elimination, first to 4 wins' },
  { value: 'round-robin', label: 'Round Robin', desc: 'Everyone plays everyone' },
];

export default function SessionLobby() {
  const { sessionCode } = useParams<{ sessionCode: string }>();
  const navigate = useNavigate();

  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [format, setFormat] = useState<TournamentFormat | 'single'>('single');

  // Sync local format state from session (keeps all clients in sync)
  useEffect(() => {
    if (session?.lobbyFormat) setFormat(session.lobbyFormat);
  }, [session?.lobbyFormat]);

  const noticeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prevSessionRef = useRef<Session | null>(null);

  const [playerId, setPlayerId] = useState<string | null>(localStorage.getItem('playerId'));

  const [displayName, setDisplayName] = useState(localStorage.getItem('playerName') ?? '');
  const [joinLoading, setJoinLoading] = useState(false);
  const [joinError, setJoinError] = useState('');
  const [spectateLoading, setSpectateLoading] = useState(false);

  useEffect(() => {
    if (playerId) initPushNotifications(playerId);
  }, [playerId]);

  const showNotice = (msg: string) => {
    if (noticeTimerRef.current) clearTimeout(noticeTimerRef.current);
    setNotice(msg);
    noticeTimerRef.current = setTimeout(() => setNotice(null), 3500);

    if (
      'Notification' in window &&
      Notification.permission === 'granted' &&
      (document.hidden || !document.hasFocus())
    ) {
      new Notification('Ancient Games', { body: msg, icon: '/favicon.ico' });
    }
  };

  useEffect(() => {
    if (!sessionCode) {
      navigate('/');
      return;
    }
    loadSession();
  }, [sessionCode]);

  useEffect(() => {
    if (!sessionCode || !playerId) return;

    const socket = socketService.connect();

    const rejoin = () => {
      socket.emit('session:join', { sessionCode, playerId });
    };
    socket.on('connect', rejoin);
    if (socket.connected) rejoin();

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        if (socket.connected) {
          rejoin();
        } else {
          socket.connect();
        }
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    socket.on('session:updated', (updatedSession) => {
      const prev = prevSessionRef.current;
      if (prev) {
        const prevIds = new Set(prev.players.map((p) => p.id));
        for (const p of updatedSession.players) {
          if (!prevIds.has(p.id) && p.id !== playerId) {
            showNotice(`${p.displayName} has joined`);
          }
        }
      }
      prevSessionRef.current = updatedSession;
      setSession(updatedSession);
    });

    socket.on('session:player-joined', (updatedSession) => {
      prevSessionRef.current = updatedSession;
      setSession(updatedSession);
    });

    socket.on('session:player-left', (updatedSession) => {
      const prev = prevSessionRef.current;
      if (prev) {
        const newIds = new Set(updatedSession.players.map((p) => p.id));
        for (const p of prev.players) {
          if (!newIds.has(p.id) && p.id !== playerId) {
            showNotice(`${p.displayName} has left`);
          }
        }
      }
      prevSessionRef.current = updatedSession;
      setSession(updatedSession);
    });

    socket.on('game:started', (updatedSession) => {
      setSession(updatedSession);
      navigate(`/game/${sessionCode}`);
    });

    socket.on('tournament:updated', (updatedSession) => {
      prevSessionRef.current = updatedSession;
      setSession(updatedSession);
    });

    socket.on('tournament:match-ready', ({ matchSessionCode, opponentName, roundLabel }) => {
      showNotice(`Match ready vs ${opponentName} — ${roundLabel}!`);
      setTimeout(() => navigate(`/game/${matchSessionCode}`), 2000);
    });

    socket.on('session:error', (err) => setError(err.message));

    return () => {
      socket.off('connect', rejoin);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      socket.off('session:updated');
      socket.off('session:player-joined');
      socket.off('session:player-left');
      socket.off('game:started');
      socket.off('tournament:updated');
      socket.off('tournament:match-ready');
      socket.off('session:error');
    };
  }, [sessionCode, playerId]);

  const loadSession = async () => {
    try {
      const sessionData = await api.getSession(sessionCode!);
      setSession(sessionData);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const handleJoin = async () => {
    if (!displayName.trim()) {
      setJoinError('Please enter your name');
      return;
    }
    setJoinLoading(true);
    setJoinError('');
    try {
      const result = await api.joinSession({
        sessionCode: sessionCode!,
        displayName: displayName.trim(),
      });
      localStorage.setItem('playerId', result.playerId);
      localStorage.setItem('playerName', displayName.trim());
      setPlayerId(result.playerId);
      setSession(result.session);
    } catch (err) {
      setJoinError((err as Error).message);
    } finally {
      setJoinLoading(false);
    }
  };

  const handleStartGame = () => {
    if (!sessionCode || !playerId) return;
    const socket = socketService.getSocket();
    if (!socket) return;
    if (format === 'single') {
      socket.emit('game:start', { sessionCode, playerId });
    } else {
      socket.emit('game:start', { sessionCode, playerId, tournamentFormat: format });
    }
  };

  const handleCopyLink = () => {
    navigator.clipboard.writeText(`${window.location.origin}/session/${sessionCode}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleCopyCode = () => {
    if (sessionCode) {
      navigator.clipboard.writeText(sessionCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleSpectate = async () => {
    if (!displayName.trim()) {
      setJoinError('Please enter your name');
      return;
    }
    setSpectateLoading(true);
    setJoinError('');
    try {
      const result = await api.spectateSession({
        sessionCode: sessionCode!,
        displayName: displayName.trim(),
      });
      localStorage.setItem('playerId', result.spectatorId);
      localStorage.setItem('playerName', displayName.trim());
      setPlayerId(result.spectatorId);
      setSession(result.session);
    } catch (err) {
      setJoinError((err as Error).message);
    } finally {
      setSpectateLoading(false);
    }
  };

  const handleFormatChange = (newFormat: TournamentFormat | 'single') => {
    setFormat(newFormat);
    const socket = socketService.getSocket();
    if (socket && sessionCode && playerId) {
      socket.emit('session:set-format', { sessionCode, playerId, format: newFormat });
    }
  };

  const handleStandUp = () => {
    if (!sessionCode || !playerId) return;
    const socket = socketService.getSocket();
    if (!socket) return;
    socket.emit('session:stand-up', { sessionCode, playerId });
  };

  const handleTakeSeat = () => {
    if (!sessionCode || !playerId) return;
    const socket = socketService.getSocket();
    if (!socket) return;
    socket.emit('session:take-seat', { sessionCode, playerId });
  };

  const handleHostStandUp = (targetPlayerId: string) => {
    if (!sessionCode || !playerId) return;
    const socket = socketService.getSocket();
    if (!socket) return;
    socket.emit('session:host-stand-up', { sessionCode, playerId, targetPlayerId });
  };

  const handleHostTakeSeat = (targetPlayerId: string) => {
    if (!sessionCode || !playerId) return;
    const socket = socketService.getSocket();
    if (!socket) return;
    socket.emit('session:host-take-seat', { sessionCode, playerId, targetPlayerId });
  };

  const handleLeave = () => {
    if (!sessionCode || !playerId) return;
    const socket = socketService.getSocket();
    if (socket) socket.emit('session:leave', { sessionCode, playerId });
    localStorage.removeItem('playerId');
    navigate('/');
  };

  // ── Loading state ──────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-xl text-gray-400">Loading session...</div>
      </div>
    );
  }

  if (error && !session) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="card max-w-md w-full text-center">
          <div className="text-4xl mb-4">⚠️</div>
          <h2 className="text-2xl font-bold mb-4">Session Error</h2>
          <p className="text-gray-400 mb-6">{error}</p>
          <button onClick={() => navigate('/')} className="btn btn-primary">
            Back to Home
          </button>
        </div>
      </div>
    );
  }

  const knownToSession =
    playerId &&
    session &&
    (session.players.some((p) => p.id === playerId) ||
      session.spectators.some((s) => s.id === playerId));

  // ── Join form ──────────────────────────────────────────────────────────────
  if (!knownToSession) {
    const isFull = session && session.players.length >= 8;
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="card max-w-md w-full">
          <div className="text-center mb-6">
            <div className="text-4xl mb-3">🎲</div>
            <h1 className="text-2xl font-bold mb-1">You've been invited!</h1>
            {session && (
              <p className="text-gray-400">
                Join a game of{' '}
                <span className="text-white font-semibold">
                  {GAME_NAMES[session.gameType] ?? session.gameType}
                </span>
              </p>
            )}
          </div>

          {session && session.players.length > 0 && (
            <div className="bg-gray-700/40 rounded-lg p-3 mb-5 text-sm text-gray-300">
              <span className="text-gray-500 mr-2">Currently in lobby:</span>
              {session.players.map((p) => p.displayName).join(', ')}
            </div>
          )}

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-2">Your Name</label>
              <input
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && (isFull ? handleSpectate() : handleJoin())}
                placeholder="Enter your name"
                className="input w-full"
                maxLength={20}
                autoFocus
              />
            </div>

            {joinError && (
              <div className="bg-red-500/20 border border-red-500 rounded-lg p-3 text-red-200 text-sm">
                {joinError}
              </div>
            )}

            {!isFull && (
              <button
                onClick={handleJoin}
                disabled={joinLoading}
                className="btn btn-primary w-full text-lg py-3"
              >
                {joinLoading ? 'Joining...' : 'Join Game'}
              </button>
            )}

            <button
              onClick={handleSpectate}
              disabled={spectateLoading}
              className="btn btn-outline w-full"
            >
              {spectateLoading ? 'Joining...' : 'Watch Game'}
            </button>

            <button
              onClick={() => navigate('/')}
              className="text-sm text-gray-400 hover:text-white w-full text-center"
            >
              Back to Home
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!session) return null;

  const isSpectator =
    !session.players.some((p) => p.id === playerId) &&
    session.spectators.some((s) => s.id === playerId);
  const isHost = session.hostId === playerId;
  const currentPlayer = session.players.find((p) => p.id === playerId);
  const canStart = isHost && (format === 'single' ? session.players.length === 2 : session.players.length >= 2);

  // ── Tournament bracket view (tournament already started) ───────────────────
  if (session.tournamentState) {
    return (
      <div className="min-h-screen p-4">
        <div className="max-w-4xl mx-auto space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold">Tournament</h1>
              <p className="text-gray-400 text-sm">{GAME_NAMES[session.gameType] ?? session.gameType}</p>
            </div>
            <button onClick={handleLeave} className="text-gray-400 hover:text-white text-sm">
              Leave
            </button>
          </div>

          <TournamentBracket
            tournament={session.tournamentState}
            participants={session.tournamentState.participants}
            currentPlayerId={playerId!}
            onWatchMatch={(matchCode) => navigate(`/game/${matchCode}`)}
          />
        </div>

        {notice && (
          <div
            key={notice}
            className="toast-animate fixed top-5 left-1/2 z-50 px-5 py-2.5 rounded-full text-sm font-semibold shadow-2xl pointer-events-none select-none"
            style={{
              background: 'rgba(20,12,0,0.92)',
              border: '1px solid rgba(196,168,107,0.5)',
              color: '#F0E6C8',
              backdropFilter: 'blur(8px)',
              WebkitBackdropFilter: 'blur(8px)',
              boxShadow: '0 4px 24px rgba(0,0,0,0.6)',
              transform: 'translateX(-50%)',
            }}
          >
            {notice}
          </div>
        )}
      </div>
    );
  }

  // ── Normal lobby ───────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="max-w-2xl w-full space-y-6">
        <div className="card">
          <div className="flex justify-between items-start mb-6">
            <div>
              <h1 className="text-3xl font-bold mb-2">Game Lobby</h1>
              <p className="text-gray-400">{GAME_NAMES[session.gameType] ?? session.gameType}</p>
            </div>
            <button onClick={handleLeave} className="text-gray-400 hover:text-white">
              Leave
            </button>
          </div>

          {/* Session code */}
          <div className="bg-gray-700/50 rounded-lg p-4 mb-6">
            <div className="text-sm text-gray-400 mb-1">Session Code</div>
            <div className="flex items-center gap-3">
              <div className="text-3xl font-mono font-bold tracking-wider">{sessionCode}</div>
              <button onClick={handleCopyCode} className="btn btn-outline text-sm py-1 px-3">
                {copied ? '✓ Copied' : 'Copy'}
              </button>
            </div>
            <button
              onClick={handleCopyLink}
              className="text-sm text-primary-400 hover:text-primary-300 mt-2"
            >
              Copy invite link
            </button>
          </div>

          {/* Players list */}
          <div className="space-y-3 mb-6">
            <div className="text-sm font-medium text-gray-400">
              Players ({session.players.length})
            </div>
            {session.players.map((player) => (
              <div
                key={player.id}
                className="flex items-center justify-between bg-gray-700/30 rounded-lg p-3"
              >
                <div className="flex items-center gap-3">
                  <div className="w-3 h-3 rounded-full bg-green-500" />
                  <span className="font-medium">{player.displayName}</span>
                  {player.id === session.hostId && (
                    <span className="text-xs bg-primary-500/20 text-primary-400 px-2 py-1 rounded">
                      Host
                    </span>
                  )}
                  {player.id === playerId && (
                    <span className="text-xs bg-secondary-500/20 text-secondary-400 px-2 py-1 rounded">
                      You
                    </span>
                  )}
                </div>
                {isHost && player.id !== playerId && (
                  <button
                    onClick={() => handleHostStandUp(player.id)}
                    className="text-xs text-gray-400 hover:text-white px-2 py-1 rounded hover:bg-gray-600/50 transition-colors"
                    title="Move to spectators"
                  >
                    Stand
                  </button>
                )}
              </div>
            ))}

            {session.players.length < 2 && (
              <div className="bg-gray-700/30 rounded-lg p-3 text-center text-gray-400">
                Waiting for another player...
              </div>
            )}

            {session.spectators.length > 0 && (
              <div className="mt-4">
                <div className="text-sm font-medium text-gray-400 mb-2">
                  Spectators ({session.spectators.length})
                </div>
                {session.spectators.map((spec) => (
                  <div
                    key={spec.id}
                    className="flex items-center justify-between bg-gray-700/20 rounded-lg p-3 mb-1"
                  >
                    <div className="flex items-center gap-3">
                      <span className="text-gray-400 text-sm">👁</span>
                      <span className="text-gray-300 text-sm">{spec.displayName}</span>
                      {spec.id === playerId && (
                        <span className="text-xs bg-gray-600/50 text-gray-400 px-2 py-0.5 rounded">
                          You
                        </span>
                      )}
                    </div>
                    {isHost && session.players.length < (format === 'single' ? 2 : 8) && (
                      <button
                        onClick={() => handleHostTakeSeat(spec.id)}
                        className="text-xs text-gray-400 hover:text-white px-2 py-1 rounded hover:bg-gray-600/50 transition-colors"
                        title="Move to players"
                      >
                        Seat
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Format selector — host only */}
          {isHost && (
            <div className="mb-6">
              <div className="text-sm font-medium text-gray-400 mb-2">Format</div>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {FORMAT_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    onClick={() => handleFormatChange(opt.value)}
                    className="rounded-lg p-2.5 text-left transition-all border"
                    style={{
                      background: format === opt.value ? 'rgba(196,160,48,0.12)' : 'rgba(8,5,0,0.5)',
                      borderColor: format === opt.value ? 'rgba(196,160,48,0.5)' : 'rgba(42,30,14,0.8)',
                      color: format === opt.value ? '#E8C870' : '#8A7A60',
                    }}
                  >
                    <div className="text-sm font-semibold">{opt.label}</div>
                    <div className="text-xs mt-0.5 opacity-70">{opt.desc}</div>
                  </button>
                ))}
              </div>
              {format === 'single' && session.players.length > 2 && (
                <div className="text-xs mt-2" style={{ color: '#E8A030' }}>
                  Single Match requires exactly 2 players seated.
                </div>
              )}
            </div>
          )}

          {/* Format display for non-hosts */}
          {!isHost && (
            <div className="mb-6 text-sm" style={{ color: '#6A5A40' }}>
              Format: {FORMAT_OPTIONS.find((o) => o.value === format)?.label ?? 'Single Match'} — waiting for host to start
            </div>
          )}

          {/* Action buttons */}
          <div className="flex gap-3 flex-wrap">
            {!isSpectator && isHost && (
              <button
                onClick={handleStartGame}
                disabled={!canStart}
                className="btn btn-primary flex-1"
              >
                {format === 'single' ? 'Start Game' : 'Start Tournament'}
              </button>
            )}
            {!isSpectator && currentPlayer && (
              <button onClick={handleStandUp} className="btn btn-outline text-sm">
                Stand Up
              </button>
            )}
            {isSpectator && session.players.length < (format === 'single' ? 2 : 8) && (
              <button onClick={handleTakeSeat} className="btn btn-secondary flex-1">
                Take a Seat
              </button>
            )}
          </div>

          {!isSpectator && isHost && !canStart && (
            <div className="text-sm text-gray-400 text-center mt-2">
              {session.players.length < 2
                ? 'Waiting for another player to join'
                : format === 'single' && session.players.length > 2
                  ? 'Single Match requires exactly 2 players'
                  : ''}
            </div>
          )}
        </div>
      </div>

      {notice && (
        <div
          key={notice}
          className="toast-animate fixed top-5 left-1/2 z-50 px-5 py-2.5 rounded-full text-sm font-semibold shadow-2xl pointer-events-none select-none"
          style={{
            background: 'rgba(20,12,0,0.92)',
            border: '1px solid rgba(196,168,107,0.5)',
            color: '#F0E6C8',
            backdropFilter: 'blur(8px)',
            WebkitBackdropFilter: 'blur(8px)',
            boxShadow: '0 4px 24px rgba(0,0,0,0.6), 0 0 0 1px rgba(196,168,107,0.15)',
            transform: 'translateX(-50%)',
          }}
        >
          {notice}
        </div>
      )}
    </div>
  );
}
