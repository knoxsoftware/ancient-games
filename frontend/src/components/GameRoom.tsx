import { useEffect, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Session, GameState } from '@ancient-games/shared';
import { socketService } from '../services/socket';
import { api } from '../services/api';
import { initPushNotifications } from '../services/pushNotifications';
import UrBoard from './games/ur/UrBoard';
import SenetBoard from './games/senet/SenetBoard';
import MorrisBoard from './games/morris/MorrisBoard';
import { AnimationOverlay, AnimationState } from './AnimationOverlay';
import { MoveLog, HistoryEntry } from './MoveLog';

export default function GameRoom() {
  const { sessionCode } = useParams<{ sessionCode: string }>();
  const navigate = useNavigate();
  const [session, setSession] = useState<Session | null>(null);
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [skipNotice, setSkipNotice] = useState<{ playerName: string } | null>(null);

  const gameStateRef = useRef<GameState | null>(null);
  useEffect(() => { gameStateRef.current = gameState; }, [gameState]);

  const sessionRef = useRef<Session | null>(null);
  useEffect(() => { sessionRef.current = session; }, [session]);

  const animIdRef = useRef(0);
  const [pendingAnimation, setPendingAnimation] = useState<AnimationState | null>(null);
  const [replayAnimation, setReplayAnimation] = useState<AnimationState | null>(null);
  const [moveHistory, setMoveHistory] = useState<HistoryEntry[]>([]);
  const historyIdRef = useRef(0);
  const replayIdRef = useRef(0);
  const [replayingEntryId, setReplayingEntryId] = useState<number | null>(null);

  const playerId = localStorage.getItem('playerId');

  useEffect(() => {
    if (!sessionCode || !playerId) {
      navigate('/');
      return;
    }

    loadSession();
  }, [sessionCode, playerId]);

  // Register service worker and subscribe to push notifications on mount
  useEffect(() => {
    if (playerId) {
      initPushNotifications(playerId);
    }
  }, [playerId]);

  useEffect(() => {
    if (!sessionCode || !playerId) return;

    const socket = socketService.connect();

    // Re-join the session room and pull latest state on every (re)connection.
    // The server responds with session:updated which carries the full game state,
    // so no separate REST call is needed on reconnect.
    const rejoin = () => {
      socket.emit('session:join', { sessionCode, playerId });
    };
    socket.on('connect', rejoin);
    // If the socket is already connected (e.g. navigating back to this page),
    // the 'connect' event won't fire again — call immediately.
    if (socket.connected) rejoin();

    // When the tab becomes visible again, refresh state. On Android the socket
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
      setSession(updatedSession);
      setGameState(updatedSession.gameState);
    });

    socket.on('game:state-updated', (updatedGameState) => {
      setGameState(updatedGameState);
    });

    socket.on('game:dice-rolled', ({ playerNumber, roll, canMove }) => {
      if (!canMove) {
        const currentSession = sessionRef.current;
        const skipPlayer = currentSession?.players.find((p) => p.playerNumber === playerNumber);
        const playerName = skipPlayer?.displayName ?? `Player ${playerNumber + 1}`;
        historyIdRef.current += 1;
        setMoveHistory((prev) => [
          ...prev,
          {
            id: historyIdRef.current,
            move: { playerId: skipPlayer?.id ?? '', pieceIndex: -1, from: -2, to: -2, diceRoll: roll },
            playerNumber,
            wasCapture: false,
            isSkip: true,
          },
        ]);
        setSkipNotice({ playerName });
        setTimeout(() => setSkipNotice(null), 2500);
      }
    });

    socket.on('game:move-made', ({ move, gameState: updatedGameState }) => {
      const prevState = gameStateRef.current;
      const currentSession = sessionRef.current;

      const playerNum =
        currentSession?.players.find(p => p.id === move.playerId)?.playerNumber ?? 0;

      // Captures are only possible in Ur's shared section (positions 4–11).
      // Private lane positions use the same numbers for both players but
      // occupy separate physical paths, so a position match there is not a
      // capture and must be excluded.
      const isCapturablePosition =
        currentSession?.gameType !== 'ur' || (move.to >= 4 && move.to <= 11);

      const wasCapture =
        !!prevState &&
        move.to !== 99 &&
        isCapturablePosition &&
        prevState.board.pieces.some(
          p => p.playerNumber !== playerNum && p.position === move.to
        );

      setGameState(updatedGameState);

      // Morris has no path animation support
      if (currentSession?.gameType !== 'morris') {
        animIdRef.current += 1;
        const animId = animIdRef.current;
        setPendingAnimation({
          move,
          playerNumber: playerNum,
          gameType: currentSession?.gameType as 'ur' | 'senet',
          id: animId,
        });
      }

      historyIdRef.current += 1;
      setMoveHistory(prev => [
        ...prev,
        { id: historyIdRef.current, move, playerNumber: playerNum, wasCapture },
      ]);

      // Browser notification when the tab is inactive and it's now my turn
      if (
        'Notification' in window &&
        Notification.permission === 'granted' &&
        (document.hidden || !document.hasFocus())
      ) {
        const myPlayer = currentSession?.players.find((p) => p.id === playerId);
        if (myPlayer && updatedGameState.currentTurn === myPlayer.playerNumber) {
          const opponent = currentSession?.players.find((p) => p.id !== playerId);
          const gameType = currentSession?.gameType;
          const gameTitle =
            gameType === 'ur' ? 'Royal Game of Ur' :
            gameType === 'morris' ? "Nine Men's Morris" :
            'Senet';
          new Notification('Your turn!', {
            body: `${opponent?.displayName ?? 'Opponent'} made a move in ${gameTitle}`,
            icon: '/favicon.ico',
          });
        }
      }
    });

    socket.on('game:turn-changed', ({ currentTurn }) => {
      setGameState((prev) => (prev ? { ...prev, currentTurn } : null));
    });

    socket.on('game:ended', ({ winner, gameState: finalGameState }) => {
      setGameState(finalGameState);
      setMessage(`Player ${winner + 1} wins!`);
    });

    socket.on('game:restarted', (newSession) => {
      setSession(newSession);
      setGameState(newSession.gameState);
      setMoveHistory([]);
      historyIdRef.current = 0;
      replayIdRef.current = 0;
      setPendingAnimation(null);
      setReplayAnimation(null);
      setReplayingEntryId(null);
      setMessage('');
    });

    socket.on('game:error', (error) => {
      setError(error.message);
      setTimeout(() => setError(''), 3000);
    });

    return () => {
      socket.off('connect', rejoin);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      socket.off('session:updated');
      socket.off('game:state-updated');
      socket.off('game:dice-rolled');
      socket.off('game:move-made');
      socket.off('game:turn-changed');
      socket.off('game:ended');
      socket.off('game:restarted');
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

  const handleRematch = () => {
    const socket = socketService.getSocket();
    if (!socket || !sessionCode || !playerId) return;
    socket.emit('game:rematch', { sessionCode, playerId });
  };

  const handleReplay = (entry: HistoryEntry) => {
    if (session?.gameType === 'morris') return; // Morris has no path animation
    replayIdRef.current += 1;
    setReplayAnimation({
      move: entry.move,
      playerNumber: entry.playerNumber,
      gameType: session!.gameType as 'ur' | 'senet',
      id: replayIdRef.current,
    });
    setReplayingEntryId(entry.id);
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

  const animatingPiece = pendingAnimation
    ? { playerNumber: pendingAnimation.playerNumber, pieceIndex: pendingAnimation.move.pieceIndex }
    : null;

  return (
    <div className="min-h-screen p-4">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-2xl font-bold">
            {session.gameType === 'ur' ? 'Royal Game of Ur' : session.gameType === 'morris' ? "Nine Men's Morris" : 'Senet'}
          </h1>
          <button onClick={handleLeave} className="btn btn-outline text-sm">
            Leave Game
          </button>
        </div>

        {/* Inline error (layout-impacting intentionally — user needs to see it) */}
        {error && (
          <div className="bg-red-500/20 border border-red-500 rounded-lg p-3 mb-4 text-center text-red-200">
            {error}
          </div>
        )}

        {/* Winner Banner */}
        {gameState.finished && gameState.winner !== null && (
          <div className="bg-gradient-to-r from-primary-500 to-secondary-500 rounded-lg p-6 mb-4 text-center">
            <div className="text-3xl font-bold mb-2">
              {gameState.winner === currentPlayer?.playerNumber ? 'You Win!' : 'You Lose'}
            </div>
            <div className="text-lg mb-4">
              {session.players[gameState.winner]?.displayName} is the winner!
            </div>
            <button
              onClick={handleRematch}
              className="btn bg-white/20 hover:bg-white/30 text-white border border-white/40 px-6 py-2"
            >
              Play Again
            </button>
          </div>
        )}

        {/* Game Board + Move Log */}
        <div className="lg:flex lg:gap-4 lg:items-start">
          <div className="lg:flex-1">
            {session.gameType === 'ur' && (
              <UrBoard
                session={session}
                gameState={gameState}
                playerId={playerId!}
                isMyTurn={isMyTurn}
                animatingPiece={animatingPiece}
                lastMove={moveHistory[moveHistory.length - 1]}
              />
            )}
            {session.gameType === 'senet' && (
              <SenetBoard
                session={session}
                gameState={gameState}
                playerId={playerId!}
                isMyTurn={isMyTurn}
                animatingPiece={animatingPiece}
                lastMove={moveHistory[moveHistory.length - 1]}
              />
            )}
            {session.gameType === 'morris' && (
              <MorrisBoard
                session={session}
                gameState={gameState}
                playerId={playerId!}
                isMyTurn={isMyTurn}
              />
            )}
          </div>
          <div className="mt-4 lg:mt-0 lg:w-52 lg:flex-shrink-0">
            <MoveLog
              entries={moveHistory}
              gameType={session.gameType as 'ur' | 'senet' | 'morris'}
              session={session}
              onReplay={handleReplay}
              replayingId={replayingEntryId}
            />
          </div>
        </div>
      </div>

      {/* Non-layout-shifting toast for transient messages */}
      {message && (
        <div
          key={message}
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
          {message}
        </div>
      )}

      {/* Skip-turn notice — amber/warning styling distinct from normal toast */}
      {skipNotice && (
        <div
          key={skipNotice.playerName}
          className="dice-shake fixed top-5 left-1/2 z-50 px-5 py-2.5 rounded-full text-sm font-semibold shadow-2xl pointer-events-none select-none"
          style={{
            background: 'rgba(40,22,0,0.93)',
            border: '1px solid rgba(220,140,20,0.7)',
            color: '#FFD060',
            backdropFilter: 'blur(8px)',
            WebkitBackdropFilter: 'blur(8px)',
            boxShadow: '0 4px 24px rgba(0,0,0,0.6), 0 0 0 1px rgba(220,140,20,0.2)',
          }}
        >
          No valid moves — {skipNotice.playerName}&apos;s turn passes
        </div>
      )}

      {pendingAnimation && (
        <AnimationOverlay
          animation={pendingAnimation}
          onComplete={() => setPendingAnimation(null)}
        />
      )}
      {replayAnimation && (
        <AnimationOverlay
          animation={replayAnimation}
          onComplete={() => { setReplayAnimation(null); setReplayingEntryId(null); }}
        />
      )}
    </div>
  );
}
