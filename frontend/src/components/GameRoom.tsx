import { useEffect, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Session, GameState, HistoricalMove } from '@ancient-games/shared';
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
import GameControls from './GameControls';
import ChatPanel, { ChatMessage, ChatDestination } from './ChatPanel';
import TournamentBracket from './tournament/TournamentBracket';

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
  const [hubSession, setHubSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [spectateDisplayName, setSpectateDisplayName] = useState('');
  const [spectateLoading, setSpectateLoading] = useState(false);
  const [spectateError, setSpectateError] = useState('');
  const [skipNotice, setSkipNotice] = useState<{ playerName: string } | null>(null);
  const [activeTab, setActiveTab] = useState<'game' | 'chat' | 'room' | 'history' | 'bracket'>('game');
  const [showRules, setShowRules] = useState(false);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [unreadChat, setUnreadChat] = useState(0);
  const [chatToast, setChatToast] = useState<{ displayName: string; text: string } | null>(null);
  const chatToastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const activeTabRef = useRef<'game' | 'chat' | 'room' | 'history' | 'bracket'>('game');
  const [copiedSpectatorLink, setCopiedSpectatorLink] = useState(false);
  const [tournamentToast, setTournamentToast] = useState<string | null>(null);
  const tournamentToastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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

  const showTournamentToast = (msg: string) => {
    if (tournamentToastTimerRef.current) clearTimeout(tournamentToastTimerRef.current);
    setTournamentToast(msg);
    tournamentToastTimerRef.current = setTimeout(() => setTournamentToast(null), 4000);
  };

  useEffect(() => {
    if (!sessionCode) {
      navigate('/');
      return;
    }
    loadSession();
  }, [sessionCode]);

  useEffect(() => {
    if (playerId) {
      initPushNotifications(playerId);
    }
  }, [playerId]);

  // Load hub session when we know there is one
  useEffect(() => {
    if (session?.tournamentHubCode) {
      api.getSession(session.tournamentHubCode).then(setHubSession).catch(() => {});
    }
  }, [session?.tournamentHubCode]);

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
      setChatMessages((prev) => [...prev, msg as ChatMessage]);
      if (activeTabRef.current !== 'chat') {
        setUnreadChat((n) => n + 1);
        if (!document.hidden) {
          if (chatToastTimerRef.current) clearTimeout(chatToastTimerRef.current);
          setChatToast({ displayName: msg.displayName, text: msg.text });
          chatToastTimerRef.current = setTimeout(() => setChatToast(null), 3000);
        } else {
          showNotification(msg.displayName, msg.text);
        }
      }
    });

    socket.on('game:history', (moves) => {
      const entries: HistoryEntry[] = moves.map((hm, i) => ({
        id: i + 1,
        move: hm.move,
        playerNumber: hm.playerNumber,
        wasCapture: hm.wasCapture,
        isSkip: hm.isSkip,
      }));
      historyIdRef.current = moves.length;
      setMoveHistory(entries);
    });

    socket.on('chat:history', (messages) => {
      setChatMessages(messages as ChatMessage[]);
    });

    socket.on('tournament:updated', (updatedHubSession) => {
      setHubSession(updatedHubSession);
    });

    socket.on('tournament:match-ready', ({ matchSessionCode, opponentName, roundLabel }) => {
      showTournamentToast(`Next match ready vs ${opponentName} — ${roundLabel}!`);
      setTimeout(() => navigate(`/game/${matchSessionCode}`), 3000);
    });

    socket.on('tournament:eliminated', ({ tournamentCode }) => {
      showTournamentToast('You have been eliminated. Returning to bracket...');
      setTimeout(() => navigate(`/session/${tournamentCode}`), 3000);
    });

    socket.on('tournament:finished', ({ winnerName }) => {
      showTournamentToast(`Tournament over! ${winnerName} wins!`);
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
      socket.off('game:history');
      socket.off('chat:history');
      socket.off('tournament:updated');
      socket.off('tournament:match-ready');
      socket.off('tournament:eliminated');
      socket.off('tournament:finished');
    };
  }, [sessionCode, playerId]);

  const loadSession = async () => {
    try {
      const sessionData = await api.getSession(sessionCode!);
      setSession(sessionData);
      setGameState(sessionData.gameState);

      if (sessionData.chatHistory && sessionData.chatHistory.length > 0) {
        setChatMessages(sessionData.chatHistory as ChatMessage[]);
      }

      if (sessionData.gameState.moveHistory && sessionData.gameState.moveHistory.length > 0) {
        const entries: HistoryEntry[] = sessionData.gameState.moveHistory.map((hm: HistoricalMove, i: number) => ({
          id: i + 1,
          move: hm.move,
          playerNumber: hm.playerNumber,
          wasCapture: hm.wasCapture,
          isSkip: hm.isSkip,
        }));
        historyIdRef.current = sessionData.gameState.moveHistory.length;
        setMoveHistory(entries);
      }
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
    if (socket) socket.emit('session:leave', { sessionCode, playerId });
    localStorage.removeItem('playerId');
    navigate('/');
  };

  const handleRematch = () => {
    const socket = socketService.getSocket();
    if (!socket || !sessionCode || !playerId) return;
    socket.emit('game:rematch', { sessionCode, playerId });
  };

  const handleReturnToBracket = () => {
    if (session?.tournamentHubCode) {
      navigate(`/session/${session.tournamentHubCode}`);
    }
  };

  const handleReplay = (entry: HistoryEntry) => {
    const gt = session?.gameType;
    if (gt !== 'ur' && gt !== 'senet') return;
    replayIdRef.current += 1;
    setReplayAnimation({
      move: entry.move,
      playerNumber: entry.playerNumber,
      gameType: gt,
      id: replayIdRef.current,
    });
    setReplayingEntryId(entry.id);
  };

  // Build chat destinations for tournament matches
  const chatDestinations: ChatDestination[] | undefined = session?.tournamentHubCode
    ? (() => {
        const participants = hubSession?.tournamentState?.participants ?? [];
        const opponent = session.players.find(p => p.id !== playerId);
        const dests: ChatDestination[] = [
          { id: 'tournament', label: 'Tournament (all)' },
          { id: 'match', label: `Match vs ${opponent?.displayName ?? 'Opponent'}` },
          ...participants
            .filter(p => p.id !== playerId)
            .sort((a, b) => a.displayName.localeCompare(b.displayName))
            .map(p => ({ id: p.id, label: `DM: ${p.displayName}` })),
        ];
        return dests;
      })()
    : undefined;

  const handleChatSend = (text: string, destinationId?: string) => {
    const socket = socketService.getSocket();
    if (!socket || !sessionCode || !playerId) return;
    if (!destinationId || destinationId === 'match') {
      socket.emit('chat:send', { sessionCode, playerId, text });
    } else if (destinationId === 'tournament') {
      socket.emit('chat:send', { sessionCode, playerId, text, scope: 'tournament' });
    } else {
      socket.emit('chat:send', { sessionCode, playerId, text, scope: { toPlayerId: destinationId } });
    }
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
  const isSpectator = !currentPlayer && session.spectators.some((s) => s.id === playerId);
  const bothSeated = session.players.length === 2;
  const isMyTurn = bothSeated && !isSpectator && gameState.currentTurn === currentPlayer?.playerNumber;
  const isTournamentMatch = !!session.tournamentHubCode;

  const animatingPiece = pendingAnimation
    ? { playerNumber: pendingAnimation.playerNumber, pieceIndex: pendingAnimation.move.pieceIndex }
    : null;

  type TabName = 'game' | 'chat' | 'room' | 'history' | 'bracket';
  const tabs: TabName[] = ['game', 'chat', 'room', 'history', ...(isTournamentMatch ? ['bracket' as TabName] : [])];

  return (
    <div className="min-h-screen p-4">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-2xl font-bold">
            {session.gameType === 'ur' ? 'Royal Game of Ur'
              : session.gameType === 'morris' ? "Nine Men's Morris"
              : session.gameType === 'wolves-and-ravens' ? 'Wolves & Ravens'
              : 'Senet'}
          </h1>
          <button
            onClick={() => setShowRules(true)}
            className="w-8 h-8 rounded-full flex items-center justify-center font-bold text-base transition-colors"
            style={{
              background: 'rgba(196,160,48,0.12)',
              border: '1.5px solid rgba(196,160,48,0.35)',
              color: '#C4A030',
            }}
            title="Rules"
          >
            ?
          </button>
        </div>

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
              <div className="flex gap-3 justify-center flex-wrap">
                {isTournamentMatch ? (
                  <button
                    onClick={handleReturnToBracket}
                    className="btn bg-white/20 hover:bg-white/30 text-white border border-white/40 px-6 py-2"
                  >
                    Return to Bracket
                  </button>
                ) : (
                  <button
                    onClick={handleRematch}
                    className="btn bg-white/20 hover:bg-white/30 text-white border border-white/40 px-6 py-2"
                  >
                    Play Again
                  </button>
                )}
              </div>
            )}
          </div>
        )}

        {/* Tab bar */}
        <div className="flex gap-0 border-b" style={{ borderColor: 'rgba(42,30,14,0.8)' }}>
          {tabs.map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className="px-4 py-2 text-sm font-medium transition-colors capitalize relative"
              style={{
                color: activeTab === tab ? '#E8C870' : '#6A5A40',
                borderBottom: activeTab === tab ? '2px solid #C4A030' : '2px solid transparent',
                marginBottom: '-1px',
                background: 'transparent',
              }}
            >
              {tab === 'bracket' ? 'Bracket' : tab.charAt(0).toUpperCase() + tab.slice(1)}
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

        {/* Tab content */}
        <div className="h-64 overflow-y-auto mb-4">
          {activeTab === 'game' && (
            <div>
              <div className="grid grid-cols-2 gap-2 p-2">
                {([0, 1] as const).map((seatIndex) => {
                  const player = session.players.find((p) => p.playerNumber === seatIndex);
                  const isActive = player !== undefined && gameState.currentTurn === seatIndex;
                  const isMe = player?.id === playerId;
                  const boardPieces = gameState.board.pieces;

                  const scoreInfo = (() => {
                    if (!player) return null;
                    if (session.gameType === 'ur') {
                      const escaped = boardPieces.filter(p => p.playerNumber === seatIndex && p.position === 99).length;
                      const waiting = boardPieces.filter(p => p.playerNumber === seatIndex && p.position === -1).length;
                      return `${escaped}/7 escaped · ${waiting} waiting`;
                    }
                    if (session.gameType === 'senet') {
                      const escaped = boardPieces.filter(p => p.playerNumber === seatIndex && p.position === 99).length;
                      const onBoard = boardPieces.filter(p => p.playerNumber === seatIndex && p.position >= 0 && p.position < 99).length;
                      return `${escaped}/5 escaped · ${onBoard} on board`;
                    }
                    if (session.gameType === 'morris') {
                      const unplaced = boardPieces.filter(p => p.playerNumber === seatIndex && p.position === -1).length;
                      const captured = boardPieces.filter(p => p.playerNumber === seatIndex && p.position === 99).length;
                      const onBoard = 9 - unplaced - captured;
                      return unplaced > 0
                        ? `${onBoard} on board · ${unplaced} to place`
                        : `${onBoard} on board · ${captured} lost`;
                    }
                    if (session.gameType === 'wolves-and-ravens') {
                      const wolfPN = boardPieces.filter(p => p.playerNumber === 0).length === 1 ? 0 : 1;
                      const ravenPN = 1 - wolfPN;
                      if (seatIndex === wolfPN) {
                        const caught = boardPieces.filter(p => p.playerNumber === ravenPN && p.position === 99).length;
                        return `Wolf · ${caught} ravens caught`;
                      } else {
                        const alive = boardPieces.filter(p => p.playerNumber === ravenPN && p.position !== 99).length;
                        return `Ravens · ${alive} alive`;
                      }
                    }
                    return null;
                  })();

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
                            <span className="text-sm font-semibold truncate" style={{ color: '#E8D8B0' }}>
                              {player.displayName}
                            </span>
                            {isActive && (
                              <span
                                className="ml-auto flex-shrink-0 text-xs px-1.5 py-0.5 rounded font-bold"
                                style={{ background: 'rgba(196,160,48,0.25)', color: '#E8C870' }}
                              >
                                Turn
                              </span>
                            )}
                            {isMe && !isActive && (
                              <span className="ml-auto flex-shrink-0 text-xs" style={{ color: '#6A5A40' }}>you</span>
                            )}
                          </div>
                          {scoreInfo && (
                            <div className="text-xs mt-0.5" style={{ color: '#8A7A60' }}>
                              {scoreInfo}
                            </div>
                          )}
                        </div>
                      ) : (
                        <div className="flex items-center justify-between">
                          <span className="text-xs" style={{ color: '#5A4A38' }}>
                            {seatIndex === 0 ? 'Player 1' : 'Player 2'}
                          </span>
                          {isSpectator ? (
                            <button onClick={handleTakeSeat} className="btn btn-secondary text-xs py-0.5 px-2">
                              Take Seat
                            </button>
                          ) : (
                            <span className="text-xs" style={{ color: '#3A2A1A' }}>Empty</span>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {bothSeated ? (
                <GameControls
                  session={session}
                  gameState={gameState}
                  playerId={playerId!}
                  isMyTurn={isMyTurn}
                  lastMove={moveHistory[moveHistory.length - 1]}
                />
              ) : (
                <div className="px-2 py-1 text-center text-xs" style={{ color: '#5A4A38' }}>
                  Waiting for both players to take their seats…
                </div>
              )}
            </div>
          )}

          {activeTab === 'chat' && (
            <ChatPanel
              messages={chatMessages}
              currentPlayerId={playerId!}
              chatDestinations={chatDestinations}
              onSend={handleChatSend}
            />
          )}

          {activeTab === 'room' && (
            <div className="p-3 space-y-4">
              <div>
                <div className="text-xs font-medium mb-2" style={{ color: '#8A7A60' }}>Players</div>
                {session.players.length === 0 ? (
                  <div className="text-xs" style={{ color: '#5A4A38' }}>No players seated</div>
                ) : (
                  <div className="space-y-1">
                    {session.players.map((p) => (
                      <div key={p.id} className="flex items-center gap-2">
                        <span className="text-sm" style={{ color: '#D4C8A8' }}>{p.displayName}</span>
                        {p.id === playerId && (
                          <span className="text-xs" style={{ color: '#6A5A40' }}>you</span>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {session.spectators.length > 0 && (
                <div>
                  <div className="text-xs font-medium mb-2" style={{ color: '#8A7A60' }}>
                    Watching ({session.spectators.length})
                  </div>
                  <div className="space-y-1">
                    {session.spectators.map((s) => (
                      <div key={s.id} className="flex items-center gap-2">
                        <span className="text-xs" style={{ color: '#A09070' }}>{s.displayName}</span>
                        {s.id === playerId && (
                          <span className="text-xs" style={{ color: '#6A5A40' }}>you</span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Spectator invite link */}
              <div>
                <div className="text-xs font-medium mb-1" style={{ color: '#8A7A60' }}>Invite spectators</div>
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(`${window.location.origin}/game/${sessionCode}`);
                    setCopiedSpectatorLink(true);
                    setTimeout(() => setCopiedSpectatorLink(false), 2000);
                  }}
                  className="text-sm transition-colors"
                  style={{ color: copiedSpectatorLink ? '#90C870' : '#6A9A60' }}
                >
                  {copiedSpectatorLink ? '✓ Copied spectator link' : 'Copy spectator link'}
                </button>
              </div>

              <div className="flex flex-col gap-2 pt-1">
                {!isSpectator && (
                  <button onClick={handleStandUp} className="btn btn-outline text-sm">
                    Stand Up
                  </button>
                )}
                {isTournamentMatch && (
                  <button onClick={handleReturnToBracket} className="btn btn-outline text-sm">
                    View Bracket
                  </button>
                )}
                <button onClick={handleLeave} className="btn btn-outline text-sm">
                  Leave Room
                </button>
              </div>
            </div>
          )}

          {activeTab === 'history' && (
            <div className="pt-3">
              <MoveLog
                entries={moveHistory}
                gameType={session.gameType as 'ur' | 'senet' | 'morris' | 'wolves-and-ravens'}
                session={session}
                onReplay={handleReplay}
                replayingId={replayingEntryId}
              />
            </div>
          )}

          {activeTab === 'bracket' && isTournamentMatch && (
            <div className="p-3">
              {hubSession?.tournamentState ? (
                <TournamentBracket
                  tournament={hubSession.tournamentState}
                  participants={hubSession.tournamentState.participants}
                  currentPlayerId={playerId!}
                  onWatchMatch={(code) => navigate(`/game/${code}`)}
                />
              ) : (
                <div className="text-xs text-center py-8" style={{ color: '#5A4A38' }}>
                  Loading bracket…
                </div>
              )}
            </div>
          )}
        </div>

        {/* Board */}
        <div>
          {session.gameType === 'ur' && (
            <UrBoard
              session={session}
              gameState={gameState}
              playerId={playerId!}
              isMyTurn={isMyTurn}
              animatingPiece={animatingPiece}
            />
          )}
          {session.gameType === 'senet' && (
            <SenetBoard
              session={session}
              gameState={gameState}
              playerId={playerId!}
              isMyTurn={isMyTurn}
              animatingPiece={animatingPiece}
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
      </div>

      {/* Toasts */}
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
            transform: 'translateX(-50%)',
          }}
        >
          {message}
        </div>
      )}

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
            transform: 'translateX(-50%)',
          }}
        >
          <span style={{ color: '#E8C870' }}>{chatToast.displayName}:</span>{' '}
          {chatToast.text.length > 60 ? chatToast.text.slice(0, 60) + '…' : chatToast.text}
        </div>
      )}

      {tournamentToast && (
        <div
          key={tournamentToast}
          className="toast-animate fixed top-5 left-1/2 z-50 px-5 py-2.5 rounded-full text-sm font-semibold shadow-2xl pointer-events-none select-none"
          style={{
            background: 'rgba(10,20,10,0.95)',
            border: '1px solid rgba(100,180,100,0.5)',
            color: '#C0E8C0',
            backdropFilter: 'blur(8px)',
            WebkitBackdropFilter: 'blur(8px)',
            boxShadow: '0 4px 24px rgba(0,0,0,0.6)',
            transform: 'translateX(-50%)',
          }}
        >
          {tournamentToast}
        </div>
      )}

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
            transform: 'translateX(-50%)',
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

      {showRules && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(4px)' }}
          onClick={() => setShowRules(false)}
        >
          <div
            className="relative w-full max-w-2xl max-h-[80vh] overflow-y-auto rounded-xl p-6"
            style={{ background: '#1A1008', border: '1px solid rgba(196,160,48,0.3)' }}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => setShowRules(false)}
              className="absolute top-4 right-4 w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold transition-colors"
              style={{ background: 'rgba(80,60,30,0.5)', color: '#E8C870', border: '1px solid rgba(196,160,48,0.25)' }}
              title="Close"
            >
              ✕
            </button>
            <GameRules gameType={session.gameType} />
          </div>
        </div>
      )}
    </div>
  );
}
