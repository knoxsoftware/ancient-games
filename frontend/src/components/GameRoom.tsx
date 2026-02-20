import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Session, GameState } from '@ancient-games/shared';
import { socketService } from '../services/socket';
import { api } from '../services/api';
import UrBoard from './games/ur/UrBoard';
import SenetBoard from './games/senet/SenetBoard';

export default function GameRoom() {
  const { sessionCode } = useParams<{ sessionCode: string }>();
  const navigate = useNavigate();
  const [session, setSession] = useState<Session | null>(null);
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

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

    socket.emit('session:join', { sessionCode, playerId });

    socket.on('session:updated', (updatedSession) => {
      setSession(updatedSession);
      setGameState(updatedSession.gameState);
    });

    socket.on('game:state-updated', (updatedGameState) => {
      setGameState(updatedGameState);
    });

    socket.on('game:dice-rolled', ({ playerNumber, roll }) => {
      setMessage(`Player ${playerNumber + 1} rolled a ${roll}`);
      setTimeout(() => setMessage(''), 3000);
    });

    socket.on('game:move-made', ({ gameState: updatedGameState }) => {
      setGameState(updatedGameState);
    });

    socket.on('game:turn-changed', ({ currentTurn }) => {
      setGameState((prev) => (prev ? { ...prev, currentTurn } : null));
    });

    socket.on('game:ended', ({ winner, gameState: finalGameState }) => {
      setGameState(finalGameState);
      setMessage(`Player ${winner + 1} wins!`);
    });

    socket.on('game:error', (error) => {
      setError(error.message);
      setTimeout(() => setError(''), 3000);
    });

    return () => {
      socket.off('session:updated');
      socket.off('game:state-updated');
      socket.off('game:dice-rolled');
      socket.off('game:move-made');
      socket.off('game:turn-changed');
      socket.off('game:ended');
      socket.off('game:error');
    };
  }, [sessionCode, playerId]);

  const loadSession = async () => {
    try {
      const sessionData = await api.getSession(sessionCode!);
      setSession(sessionData);
      setGameState(sessionData.gameState);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
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
        <div className="text-xl">Loading game...</div>
      </div>
    );
  }

  if (!session || !gameState) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="card max-w-md w-full text-center">
          <div className="text-4xl mb-4">⚠️</div>
          <h2 className="text-2xl font-bold mb-4">Game Error</h2>
          <p className="text-gray-400 mb-6">{error || 'Game not found'}</p>
          <button onClick={() => navigate('/')} className="btn btn-primary">
            Back to Home
          </button>
        </div>
      </div>
    );
  }

  const currentPlayer = session.players.find((p) => p.id === playerId);
  const isMyTurn = gameState.currentTurn === currentPlayer?.playerNumber;

  return (
    <div className="min-h-screen p-4">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-2xl font-bold">
            {session.gameType === 'ur' ? 'Royal Game of Ur' : 'Senet'}
          </h1>
          <button onClick={handleLeave} className="btn btn-outline text-sm">
            Leave Game
          </button>
        </div>

        {/* Messages */}
        {message && (
          <div className="bg-primary-500/20 border border-primary-500 rounded-lg p-3 mb-4 text-center">
            {message}
          </div>
        )}

        {error && (
          <div className="bg-red-500/20 border border-red-500 rounded-lg p-3 mb-4 text-center text-red-200">
            {error}
          </div>
        )}

        {/* Turn Indicator */}
        {!gameState.finished && (
          <div className="bg-gray-800 rounded-lg p-4 mb-4 text-center">
            {isMyTurn ? (
              <div className="text-xl font-bold text-primary-400">Your Turn!</div>
            ) : (
              <div className="text-lg text-gray-400">
                Waiting for {session.players[gameState.currentTurn]?.displayName}...
              </div>
            )}
          </div>
        )}

        {/* Winner Banner */}
        {gameState.finished && gameState.winner !== null && (
          <div className="bg-gradient-to-r from-primary-500 to-secondary-500 rounded-lg p-6 mb-4 text-center">
            <div className="text-3xl font-bold mb-2">
              {gameState.winner === currentPlayer?.playerNumber ? 'You Win!' : 'You Lose'}
            </div>
            <div className="text-lg">
              {session.players[gameState.winner]?.displayName} is the winner!
            </div>
          </div>
        )}

        {/* Game Board */}
        {session.gameType === 'ur' && (
          <UrBoard
            session={session}
            gameState={gameState}
            playerId={playerId!}
            isMyTurn={isMyTurn}
          />
        )}

        {session.gameType === 'senet' && (
          <SenetBoard
            session={session}
            gameState={gameState}
            playerId={playerId!}
            isMyTurn={isMyTurn}
          />
        )}
      </div>
    </div>
  );
}
