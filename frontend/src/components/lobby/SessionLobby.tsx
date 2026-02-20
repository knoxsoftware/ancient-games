import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Session } from '@ancient-games/shared';
import { socketService } from '../../services/socket';
import { api } from '../../services/api';

export default function SessionLobby() {
  const { sessionCode } = useParams<{ sessionCode: string }>();
  const navigate = useNavigate();
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);

  const playerId = localStorage.getItem('playerId');

  useEffect(() => {
    if (!sessionCode || !playerId) {
      navigate('/');
      return;
    }

    loadSession();
  }, [sessionCode, playerId]);

  useEffect(() => {
    if (!sessionCode || !playerId) return;

    const socket = socketService.connect();

    // Join the session room
    socket.emit('session:join', { sessionCode, playerId });

    // Listen for session updates
    socket.on('session:updated', (updatedSession) => {
      setSession(updatedSession);
    });

    socket.on('session:player-joined', (updatedSession) => {
      setSession(updatedSession);
    });

    socket.on('session:player-left', (updatedSession) => {
      setSession(updatedSession);
    });

    socket.on('game:started', (updatedSession) => {
      setSession(updatedSession);
      navigate(`/game/${sessionCode}`);
    });

    socket.on('session:error', (error) => {
      setError(error.message);
    });

    return () => {
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

  const handleReady = () => {
    if (!sessionCode || !playerId) return;

    const socket = socketService.getSocket();
    if (!socket) return;

    const currentPlayer = session?.players.find((p) => p.id === playerId);
    const newReadyState = !currentPlayer?.ready;

    socket.emit('session:ready', {
      sessionCode,
      playerId,
      ready: newReadyState,
    });
  };

  const handleStartGame = () => {
    if (!sessionCode || !playerId) return;

    const socket = socketService.getSocket();
    if (!socket) return;

    socket.emit('game:start', { sessionCode, playerId });
  };

  const handleCopyLink = () => {
    const link = `${window.location.origin}/session/${sessionCode}`;
    navigator.clipboard.writeText(link);
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

  const handleLeave = () => {
    if (!sessionCode || !playerId) return;

    const socket = socketService.getSocket();
    if (socket) {
      socket.emit('session:leave', { sessionCode, playerId });
    }

    localStorage.removeItem('playerId');
    navigate('/');
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-xl">Loading session...</div>
      </div>
    );
  }

  if (error || !session) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="card max-w-md w-full text-center">
          <div className="text-4xl mb-4">⚠️</div>
          <h2 className="text-2xl font-bold mb-4">Session Error</h2>
          <p className="text-gray-400 mb-6">{error || 'Session not found'}</p>
          <button onClick={() => navigate('/')} className="btn btn-primary">
            Back to Home
          </button>
        </div>
      </div>
    );
  }

  const isHost = session.hostId === playerId;
  const currentPlayer = session.players.find((p) => p.id === playerId);
  const allReady = session.players.every((p) => p.ready);
  const canStart = isHost && session.players.length === 2 && allReady;

  const gameNames = {
    ur: 'Royal Game of Ur',
    senet: 'Senet',
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="max-w-2xl w-full space-y-6">
        <div className="card">
          <div className="flex justify-between items-start mb-6">
            <div>
              <h1 className="text-3xl font-bold mb-2">Game Lobby</h1>
              <p className="text-gray-400">{gameNames[session.gameType]}</p>
            </div>
            <button onClick={handleLeave} className="text-gray-400 hover:text-white">
              Leave
            </button>
          </div>

          <div className="bg-gray-700/50 rounded-lg p-4 mb-6">
            <div className="text-sm text-gray-400 mb-1">Session Code</div>
            <div className="flex items-center gap-3">
              <div className="text-3xl font-mono font-bold tracking-wider">{sessionCode}</div>
              <button
                onClick={handleCopyCode}
                className="btn btn-outline text-sm py-1 px-3"
              >
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
          </div>

          <div className="flex gap-3">
            {currentPlayer && (
              <button
                onClick={handleReady}
                className={`btn flex-1 ${
                  currentPlayer.ready ? 'btn-outline' : 'btn-secondary'
                }`}
              >
                {currentPlayer.ready ? 'Not Ready' : 'Ready'}
              </button>
            )}

            {isHost && (
              <button
                onClick={handleStartGame}
                disabled={!canStart}
                className="btn btn-primary flex-1"
              >
                Start Game
              </button>
            )}
          </div>

          {isHost && !canStart && (
            <div className="text-sm text-gray-400 text-center mt-2">
              {session.players.length < 2
                ? 'Waiting for another player to join'
                : 'All players must be ready to start'}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
