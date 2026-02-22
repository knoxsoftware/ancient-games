import { useEffect, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Session } from '@ancient-games/shared';
import { socketService } from '../../services/socket';
import { api } from '../../services/api';
import { initPushNotifications } from '../../services/pushNotifications';

const GAME_NAMES: Record<string, string> = {
  ur: 'Royal Game of Ur',
  senet: 'Senet',
  morris: "Nine Men's Morris",
  'wolves-and-ravens': 'Wolves & Ravens',
};

export default function SessionLobby() {
  const { sessionCode } = useParams<{ sessionCode: string }>();
  const navigate = useNavigate();

  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const noticeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prevSessionRef = useRef<Session | null>(null);

  // Make playerId reactive so the socket useEffect re-fires after joining
  const [playerId, setPlayerId] = useState<string | null>(localStorage.getItem('playerId'));

  // Join-form state (shown when visitor has no playerId)
  const [displayName, setDisplayName] = useState('');
  const [joinLoading, setJoinLoading] = useState(false);
  const [joinError, setJoinError] = useState('');
  const [spectateLoading, setSpectateLoading] = useState(false);

  // Register push notifications whenever we have a playerId
  useEffect(() => {
    if (playerId) initPushNotifications(playerId);
  }, [playerId]);

  const showNotice = (msg: string) => {
    if (noticeTimerRef.current) clearTimeout(noticeTimerRef.current);
    setNotice(msg);
    noticeTimerRef.current = setTimeout(() => setNotice(null), 3000);

    // Also show a browser notification when the tab is not in focus
    if (
      'Notification' in window &&
      Notification.permission === 'granted' &&
      (document.hidden || !document.hasFocus())
    ) {
      new Notification('Ancient Games', { body: msg, icon: '/favicon.ico' });
    }
  };

  // Always fetch session so we can show game context on the join form
  useEffect(() => {
    if (!sessionCode) {
      navigate('/');
      return;
    }
    loadSession();
  }, [sessionCode]);

  // Only connect socket once we have a playerId
  useEffect(() => {
    if (!sessionCode || !playerId) return;

    const socket = socketService.connect();

    // Re-join the session room on every (re)connection so the server sends
    // a fresh session:updated with the latest lobby state.
    const rejoin = () => {
      socket.emit('session:join', { sessionCode, playerId });
    };
    socket.on('connect', rejoin);
    if (socket.connected) rejoin();

    // If the tab becomes visible again, refresh state. On Android the socket
    // often looks "connected" but has gone stale while backgrounded, so we
    // re-join whenever visible rather than only when visibly disconnected.
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
        // Detect new players
        const prevIds = new Set(prev.players.map((p) => p.id));
        for (const p of updatedSession.players) {
          if (!prevIds.has(p.id) && p.id !== playerId) {
            showNotice(`${p.displayName} has joined`);
          }
        }
        // Detect ready-status changes for other players
        for (const p of updatedSession.players) {
          if (p.id === playerId) continue;
          const prevPlayer = prev.players.find((pp) => pp.id === p.id);
          if (prevPlayer && prevPlayer.ready !== p.ready) {
            showNotice(p.ready ? `${p.displayName} is ready` : `${p.displayName} is not ready`);
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

    socket.on('session:error', (err) => setError(err.message));

    return () => {
      socket.off('connect', rejoin);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      socket.off('session:updated');
      socket.off('session:player-joined');
      socket.off('session:player-left');
      socket.off('game:started');
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
      setPlayerId(result.playerId);
      setSession(result.session);
    } catch (err) {
      setJoinError((err as Error).message);
    } finally {
      setJoinLoading(false);
    }
  };

  const handleReady = () => {
    if (!sessionCode || !playerId) return;
    const socket = socketService.getSocket();
    if (!socket) return;
    const currentPlayer = session?.players.find((p) => p.id === playerId);
    socket.emit('session:ready', { sessionCode, playerId, ready: !currentPlayer?.ready });
  };

  const handleStartGame = () => {
    if (!sessionCode || !playerId) return;
    const socket = socketService.getSocket();
    if (!socket) return;
    socket.emit('game:start', { sessionCode, playerId });
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
      setPlayerId(result.spectatorId);
      setSession(result.session);
    } catch (err) {
      setJoinError((err as Error).message);
    } finally {
      setSpectateLoading(false);
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

  const handleLeave = () => {
    if (!sessionCode || !playerId) return;
    const socket = socketService.getSocket();
    if (socket) socket.emit('session:leave', { sessionCode, playerId });
    localStorage.removeItem('playerId');
    navigate('/');
  };

  // ── Loading state ─────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-xl text-gray-400">Loading session...</div>
      </div>
    );
  }

  // ── Session not found / hard error ────────────────────────────────────────
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

  // ── Join form — visitor has no playerId, or has a stale one from a different session ──
  const knownToSession =
    playerId &&
    session &&
    (session.players.some((p) => p.id === playerId) ||
      session.spectators.some((s) => s.id === playerId));

  if (!knownToSession) {
    const isFull = session && session.players.length >= 2;
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

  // ── Normal lobby ──────────────────────────────────────────────────────────
  if (!session) return null;

  const isSpectator =
    !session.players.some((p) => p.id === playerId) &&
    session.spectators.some((s) => s.id === playerId);
  const isHost = session.hostId === playerId;
  const currentPlayer = session.players.find((p) => p.id === playerId);
  const allReady = session.players.every((p) => p.ready);
  const canStart = isHost && session.players.length === 2 && allReady;

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

          <div className="space-y-3 mb-6">
            <div className="text-sm font-medium text-gray-400">
              Players ({session.players.length}/2)
            </div>
            {session.players.map((player) => (
              <div
                key={player.id}
                className="flex items-center justify-between bg-gray-700/30 rounded-lg p-3"
              >
                <div className="flex items-center gap-3">
                  <div
                    className={`w-3 h-3 rounded-full ${
                      player.ready ? 'bg-green-500' : 'bg-gray-500'
                    }`}
                  />
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
                <div className="text-sm text-gray-400">
                  {player.ready ? 'Ready' : 'Not ready'}
                </div>
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
                    className="flex items-center gap-3 bg-gray-700/20 rounded-lg p-3 mb-1"
                  >
                    <span className="text-gray-400 text-sm">👁</span>
                    <span className="text-gray-300 text-sm">{spec.displayName}</span>
                    {spec.id === playerId && (
                      <span className="text-xs bg-gray-600/50 text-gray-400 px-2 py-0.5 rounded">
                        You
                      </span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="flex gap-3 flex-wrap">
            {!isSpectator && currentPlayer && (
              <button
                onClick={handleReady}
                className={`btn flex-1 ${
                  currentPlayer.ready ? 'btn-outline' : 'btn-secondary'
                }`}
              >
                {currentPlayer.ready ? 'Not Ready' : 'Ready'}
              </button>
            )}
            {!isSpectator && isHost && (
              <button
                onClick={handleStartGame}
                disabled={!canStart}
                className="btn btn-primary flex-1"
              >
                Start Game
              </button>
            )}
            {!isSpectator && currentPlayer && (
              <button onClick={handleStandUp} className="btn btn-outline text-sm">
                Stand Up
              </button>
            )}
            {isSpectator && session.players.length < 2 && (
              <button onClick={handleTakeSeat} className="btn btn-secondary flex-1">
                Take a Seat
              </button>
            )}
          </div>

          {!isSpectator && isHost && !canStart && (
            <div className="text-sm text-gray-400 text-center mt-2">
              {session.players.length < 2
                ? 'Waiting for another player to join'
                : 'All players must be ready to start'}
            </div>
          )}
        </div>
      </div>

      {/* Lobby notification toast */}
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
          }}
        >
          {notice}
        </div>
      )}
    </div>
  );
}
