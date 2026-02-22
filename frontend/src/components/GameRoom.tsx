import { useEffect, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Session, GameState } from '@ancient-games/shared';
import { socketService } from '../services/socket';
import { api } from '../services/api';
import { initPushNotifications } from '../services/pushNotifications';
import UrBoard from './games/ur/UrBoard';
import SenetBoard from './games/senet/SenetBoard';
import MorrisBoard from './games/morris/MorrisBoard';
import WolvesAndRavensBoard from './games/wolves-and-ravens/WolvesAndRavensBoard';
import { AnimationOverlay, AnimationState } from './AnimationOverlay';
import { MoveLog, HistoryEntry } from './MoveLog';
import GameRules from './GameRules';
import ChatPanel, { ChatMessage } from './ChatPanel';

async function showNotification(title: string, body: string) {
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  if ('serviceWorker' in navigator) {
    try {
      const registration = await navigator.serviceWorker.ready;
      await registration.showNotification(title, { body, icon: '/favicon.ico' });
      return;
    } catch {
      // fall through to Notification constructor
    }
  }
  new Notification(title, { body, icon: '/favicon.ico' });
}

export default function GameRoom() {
  const { sessionCode } = useParams<{ sessionCode: string }>();
  const navigate = useNavigate();
  const [session, setSession] = useState<Session | null>(null);
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [spectateDisplayName, setSpectateDisplayName] = useState('');
  const [spectateLoading, setSpectateLoading] = useState(false);
  const [spectateError, setSpectateError] = useState('');
  const [skipNotice, setSkipNotice] = useState<{ playerName: string } | null>(null);
  const [activeTab, setActiveTab] = useState<'game' | 'rules' | 'chat'>('game');
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [unreadChat, setUnreadChat] = useState(0);
  const [chatToast, setChatToast] = useState<{ displayName: string; text: string } | null>(null);
  const chatToastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const activeTabRef = useRef<'game' | 'rules' | 'chat'>('game');
  useEffect(() => {
    activeTabRef.current = activeTab;
    if (activeTab === 'chat') {
      setUnreadChat(0);
      if (chatToastTimerRef.current) clearTimeout(chatToastTimerRef.current);
      setChatToast(null);
    }
  }, [activeTab]);

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

  const [playerId, setPlayerId] = useState<string | null>(localStorage.getItem('playerId'));

  useEffect(() => {
    if (!sessionCode) {
      navigate('/');
      return;
    }
    loadSession();
  }, [sessionCode]);

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

      // Morris and Wolves & Ravens have no path animation support
      const supportsAnimation = currentSession?.gameType === 'ur' || currentSession?.gameType === 'senet';
      if (supportsAnimation) {
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
            gameType === 'wolves-and-ravens' ? 'Wolves & Ravens' :
            'Senet';
          showNotification('Your turn!', `${opponent?.displayName ?? 'Opponent'} made a move in ${gameTitle}`);
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

    socket.on('chat:message', (msg) => {
      setChatMessages((prev) => [...prev, msg]);
      if (activeTabRef.current !== 'chat') {
        setUnreadChat((n) => n + 1);
        // Toast when the game is visible but chat tab is not active
        if (!document.hidden) {
          if (chatToastTimerRef.current) clearTimeout(chatToastTimerRef.current);
          setChatToast({ displayName: msg.displayName, text: msg.text });
          chatToastTimerRef.current = setTimeout(() => setChatToast(null), 3000);
        } else {
          // Push notification when the tab is not active
          showNotification(msg.displayName, msg.text);
        }
      }
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
      socket.off('chat:message');
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

  const handleSpectate = async () => {
    if (!spectateDisplayName.trim()) {
      setSpectateError('Please enter your name');
      return;
    }
    setSpectateLoading(true);
    setSpectateError('');
    try {
      const result = await api.spectateSession({
        sessionCode: sessionCode!,
        displayName: spectateDisplayName.trim(),
      });
      localStorage.setItem('playerId', result.spectatorId);
      setPlayerId(result.spectatorId);
      setSession(result.session);
      setGameState(result.session.gameState);
    } catch (err) {
      setSpectateError((err as Error).message);
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
    const gt = session?.gameType;
    if (gt !== 'ur' && gt !== 'senet') return; // only animated games support replay
    replayIdRef.current += 1;
    setReplayAnimation({
      move: entry.move,
      playerNumber: entry.playerNumber,
      gameType: gt,
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

  // Show spectate form when visitor has no ID or their ID isn't recognised in this session
  const knownToSession =
    playerId &&
    (session.players.some((p) => p.id === playerId) ||
      session.spectators.some((s) => s.id === playerId));

  if (!knownToSession) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="card max-w-md w-full">
          <div className="text-center mb-6">
            <div className="text-4xl mb-3">👁</div>
            <h1 className="text-2xl font-bold mb-1">Watch this game</h1>
            <p className="text-gray-400">Enter your name to spectate</p>
          </div>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-2">Your Name</label>
              <input
                type="text"
                value={spectateDisplayName}
                onChange={(e) => setSpectateDisplayName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSpectate()}
                placeholder="Enter your name"
                className="input w-full"
                maxLength={20}
                autoFocus
              />
            </div>
            {spectateError && (
              <div className="bg-red-500/20 border border-red-500 rounded-lg p-3 text-red-200 text-sm">
                {spectateError}
              </div>
            )}
            <button
              onClick={handleSpectate}
              disabled={spectateLoading}
              className="btn btn-primary w-full text-lg py-3"
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

  const currentPlayer = session.players.find((p) => p.id === playerId);
  const isSpectator =
    !currentPlayer && session.spectators.some((s) => s.id === playerId);
  const bothSeated = session.players.length === 2;
  const isMyTurn = bothSeated && !isSpectator && gameState.currentTurn === currentPlayer?.playerNumber;

  const animatingPiece = pendingAnimation
    ? { playerNumber: pendingAnimation.playerNumber, pieceIndex: pendingAnimation.move.pieceIndex }
    : null;

  return (
    <div className="min-h-screen p-4">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-2xl font-bold">
            {session.gameType === 'ur' ? 'Royal Game of Ur'
              : session.gameType === 'morris' ? "Nine Men's Morris"
              : session.gameType === 'wolves-and-ravens' ? 'Wolves & Ravens'
              : 'Senet'}
          </h1>
          <div className="flex items-center gap-2">
            {!isSpectator && (
              <button onClick={handleStandUp} className="btn btn-outline text-sm">
                Stand Up
              </button>
            )}
            {isSpectator && session.players.length < 2 && (
              <button onClick={handleTakeSeat} className="btn btn-secondary text-sm">
                Take Seat
              </button>
            )}
            <button onClick={handleLeave} className="btn btn-outline text-sm">
              Leave Game
            </button>
          </div>
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
              {isSpectator
                ? `${session.players[gameState.winner]?.displayName} wins!`
                : gameState.winner === currentPlayer?.playerNumber
                  ? 'You Win!'
                  : 'You Lose'}
            </div>
            <div className="text-lg mb-4">
              {session.players[gameState.winner]?.displayName} is the winner!
            </div>
            {!isSpectator && (
              <button
                onClick={handleRematch}
                className="btn bg-white/20 hover:bg-white/30 text-white border border-white/40 px-6 py-2"
              >
                Play Again
              </button>
            )}
          </div>
        )}

        {/* Tab bar */}
        <div
          className="flex gap-0 mb-4 border-b"
          style={{ borderColor: 'rgba(42,30,14,0.8)' }}
        >
          {(['game', 'chat', 'rules'] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className="px-5 py-2 text-sm font-medium transition-colors capitalize relative"
              style={{
                color: activeTab === tab ? '#E8C870' : '#6A5A40',
                borderBottom: activeTab === tab ? '2px solid #C4A030' : '2px solid transparent',
                marginBottom: '-1px',
                background: 'transparent',
              }}
            >
              {tab === 'game' ? 'Game' : tab === 'rules' ? 'Rules' : 'Chat'}
              {tab === 'chat' && unreadChat > 0 && (
                <span
                  className="absolute -top-1 -right-1 min-w-[18px] h-[18px] flex items-center justify-center rounded-full text-xs font-bold"
                  style={{ background: '#C4A030', color: '#1A1008', fontSize: '10px' }}
                >
                  {unreadChat > 99 ? '99+' : unreadChat}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Game Board + Move Log */}
        {activeTab === 'game' && (
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
              {session.gameType === 'wolves-and-ravens' && (
                <WolvesAndRavensBoard
                  session={session}
                  gameState={gameState}
                  playerId={playerId!}
                  isMyTurn={isMyTurn}
                />
              )}
            </div>
            <div className="mt-4 lg:mt-0 lg:w-52 lg:flex-shrink-0 space-y-3">
              <MoveLog
                entries={moveHistory}
                gameType={session.gameType as 'ur' | 'senet' | 'morris' | 'wolves-and-ravens'}
                session={session}
                onReplay={handleReplay}
                replayingId={replayingEntryId}
              />
              {session.spectators.length > 0 && (
                <div className="rounded-lg p-3 text-sm" style={{ background: 'rgba(30,20,8,0.6)', border: '1px solid rgba(80,60,30,0.4)' }}>
                  <div className="text-xs font-medium mb-2" style={{ color: '#8A7A60' }}>
                    Watching ({session.spectators.length})
                  </div>
                  {session.spectators.map((s) => (
                    <div key={s.id} className="text-gray-400 text-xs py-0.5">{s.displayName}</div>
                  ))}
                </div>
              )}
              {!bothSeated && (
                <div className="rounded-lg p-3 text-xs text-center" style={{ background: 'rgba(30,20,8,0.6)', border: '1px solid rgba(80,60,30,0.4)', color: '#A09070' }}>
                  Waiting for opponent to fill seat…
                </div>
              )}
            </div>
          </div>
        )}

        {/* Rules tab */}
        {activeTab === 'rules' && (
          <GameRules gameType={session.gameType} />
        )}

        {/* Chat tab */}
        {activeTab === 'chat' && (
          <ChatPanel
            messages={chatMessages}
            currentPlayerId={playerId!}
            onSend={(text) => {
              const socket = socketService.getSocket();
              if (socket && sessionCode) {
                socket.emit('chat:send', { sessionCode, playerId: playerId!, text });
              }
            }}
          />
        )}
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

      {/* Chat message toast — shown when a message arrives and chat tab is not active */}
      {chatToast && (
        <div
          key={chatToast.displayName + chatToast.text}
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
          <span style={{ color: '#E8C870' }}>{chatToast.displayName}:</span>{' '}
          {chatToast.text.length > 60 ? chatToast.text.slice(0, 60) + '…' : chatToast.text}
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
