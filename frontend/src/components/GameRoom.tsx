import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Session,
  GameState,
  GameType,
  HistoricalMove,
  getGameTitle,
  GAME_MANIFESTS,
} from '@ancient-games/shared';
import { socketService } from '../services/socket';
import { api } from '../services/api';
import { PLAYER_ID_KEY, PLAYER_NAME_KEY } from '../services/storage';
import { initPushNotifications, isPushSubscribed } from '../services/pushNotifications';
import { getScoreInfo } from '../utils/gameScoreInfo';
import FeedbackModal from './FeedbackModal';

const boardComponents: Record<GameType, React.LazyExoticComponent<React.ComponentType<any>>> = {
  ur: lazy(() => import('./games/ur/UrBoard')),
  senet: lazy(() => import('./games/senet/SenetBoard')),
  morris: lazy(() => import('./games/morris/MorrisBoard')),
  'wolves-and-ravens': lazy(() => import('./games/wolves-and-ravens/WolvesAndRavensBoard')),
  'rock-paper-scissors': lazy(() => import('./games/rock-paper-scissors/RockPaperScissorsBoard')),
  'stellar-siege': lazy(() => import('./games/stellar-siege/StellarSiegeBoard')),
  'fox-and-geese': lazy(() => import('./games/fox-and-geese/FoxAndGeeseBoard')),
};
import { AnimationOverlay, AnimationState } from './AnimationOverlay';
import {
  renderPiece as urRenderPiece,
  getExitSelector as urGetExitSelector,
} from './games/ur/urAnimationHelpers';
import {
  renderPiece as senetRenderPiece,
  getExitSelector as senetGetExitSelector,
} from './games/senet/senetAnimationHelpers';
import { MoveLog, HistoryEntry } from './MoveLog';
import GameRules from './GameRules';
import GameControls from './GameControls';
import ChatPanel, { ChatMessage, ChatDestination } from './ChatPanel';
import TournamentBracket from './tournament/TournamentBracket';
import MatchSpectatorModal from './tournament/MatchSpectatorModal';
import GameEndModal from './GameEndModal';
import { GamePiecePreview } from './games/GamePiecePreview';

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
  const [spectateDisplayName, setSpectateDisplayName] = useState(
    localStorage.getItem(PLAYER_NAME_KEY) ?? '',
  );
  const [spectateLoading, setSpectateLoading] = useState(false);
  const [spectateError, setSpectateError] = useState('');
  const [skipNotice, setSkipNotice] = useState<{ playerName: string } | null>(null);
  const [activeTab, setActiveTab] = useState<'game' | 'chat' | 'room' | 'history' | 'bracket'>(
    'game',
  );
  const [showRules, setShowRules] = useState(false);
  const [showFeedback, setShowFeedback] = useState(false);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [unreadChat, setUnreadChat] = useState(0);
  const [chatToast, setChatToast] = useState<{ displayName: string; text: string } | null>(null);
  const chatToastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const activeTabRef = useRef<'game' | 'chat' | 'room' | 'history' | 'bracket'>('game');
  const [copiedSpectatorLink, setCopiedSpectatorLink] = useState(false);
  const [showGameEndModal, setShowGameEndModal] = useState(false);
  const [tournamentToast, setTournamentToast] = useState<string | null>(null);
  const tournamentToastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [matchGameStates, setMatchGameStates] = useState<Record<string, GameState>>({});
  const [selectedMatchId, setSelectedMatchId] = useState<string | null>(null);

  // Synchronous ref updates — always reflects latest value without needing an effect
  activeTabRef.current = activeTab;
  const gameStateRef = useRef<GameState | null>(null);
  gameStateRef.current = gameState;
  const sessionRef = useRef<Session | null>(null);
  sessionRef.current = session;

  const animIdRef = useRef(0);
  const [pendingAnimation, setPendingAnimation] = useState<AnimationState | null>(null);
  const [replayAnimation, setReplayAnimation] = useState<AnimationState | null>(null);

  // Track which away players have been gone 30+ seconds (eligible to be booted)
  const [bootablePlayerIds, setBootablePlayerIds] = useState<Set<string>>(new Set());
  const bootTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const [moveHistory, setMoveHistory] = useState<HistoryEntry[]>([]);
  const historyIdRef = useRef(0);
  const replayIdRef = useRef(0);
  const [replayingEntryId, setReplayingEntryId] = useState<number | null>(null);

  const [playerId, setPlayerId] = useState<string | null>(localStorage.getItem(PLAYER_ID_KEY));
  // True while waiting for server to respond to session:join (prevents premature name prompt
  // when a hub participant navigates to a match session — the server may auto-add them).
  const [joiningSession, setJoiningSession] = useState(() => !!localStorage.getItem(PLAYER_ID_KEY));

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
      api
        .getSession(session.tournamentHubCode)
        .then(setHubSession)
        .catch(() => {});
    }
  }, [session?.tournamentHubCode]);

  useEffect(() => {
    if (!sessionCode || !playerId) return;

    const socket = socketService.connect();

    const rejoin = () => {
      setJoiningSession(true);
      socket.emit('session:join', { sessionCode, playerId });
    };
    socket.on('connect', rejoin);
    if (socket.connected) rejoin();

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        if (socket.connected && sessionCode && playerId) {
          socket.emit('player:away', { sessionCode, playerId });
        }
      } else {
        if (socket.connected && sessionCode && playerId) {
          socket.emit('player:active', { sessionCode, playerId });
          rejoin();
        } else {
          socket.connect();
        }
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    socket.on('session:updated', (updatedSession) => {
      if (updatedSession.sessionCode === sessionRef.current?.tournamentHubCode) {
        setHubSession(updatedSession);
      } else if (updatedSession.sessionCode === sessionCode) {
        setJoiningSession(false);
        setSession(updatedSession);
      }
      // Don't update gameState here — game state comes from game:state-updated,
      // game:move-made, etc. to avoid overwriting newer state when a spectator joins.
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
            move: {
              playerId: skipPlayer?.id ?? '',
              pieceIndex: -1,
              from: -2,
              to: -2,
              diceRoll: roll,
            },
            playerNumber,
            wasCapture: false,
            isSkip: true,
          },
        ]);
        setSkipNotice({ playerName });
        setTimeout(() => setSkipNotice(null), 2500);
      }
    });

    socket.on('game:move-made', ({ move, gameState: updatedGameState, wasCapture }) => {
      const currentSession = sessionRef.current;

      const playerNum =
        currentSession?.players.find((p) => p.id === move.playerId)?.playerNumber ?? 0;

      setGameState(updatedGameState);

      const gt = currentSession?.gameType ?? 'ur';
      if (GAME_MANIFESTS[gt].supportsAnimation) {
        animIdRef.current += 1;
        const animHelpers =
          gt === 'ur'
            ? { renderPiece: urRenderPiece, getExitSelector: urGetExitSelector }
            : { renderPiece: senetRenderPiece, getExitSelector: senetGetExitSelector };
        setPendingAnimation({
          move,
          playerNumber: playerNum,
          gameType: gt,
          id: animIdRef.current,
          ...animHelpers,
        });
      }

      historyIdRef.current += 1;
      setMoveHistory((prev) => [
        ...prev,
        { id: historyIdRef.current, move, playerNumber: playerNum, wasCapture },
      ]);

      if (
        !isPushSubscribed() &&
        'Notification' in window &&
        Notification.permission === 'granted' &&
        (document.hidden || !document.hasFocus())
      ) {
        const myPlayer = currentSession?.players.find((p) => p.id === playerId);
        if (myPlayer && updatedGameState.currentTurn === myPlayer.playerNumber) {
          const opponent = currentSession?.players.find((p) => p.id !== playerId);
          const gameType = currentSession?.gameType;
          const gameTitle = getGameTitle(gameType!);
          showNotification(
            'Your turn!',
            `${opponent?.displayName ?? 'Opponent'} made a move in ${gameTitle}`,
          );
        }
      }
    });

    socket.on('game:turn-changed', ({ currentTurn }) => {
      setGameState((prev) => (prev ? { ...prev, currentTurn } : null));
    });

    socket.on('game:ended', ({ gameState: finalGameState }) => {
      setGameState(finalGameState);
      setShowGameEndModal(true);
    });

    socket.on('game:started', (updatedSession) => {
      if (updatedSession.sessionCode !== sessionCode) return;
      setSession(updatedSession);
      setGameState(updatedSession.gameState);
      setMoveHistory([]);
      historyIdRef.current = 0;
    });

    socket.on('game:restarted', (newSession) => {
      if (newSession.sessionCode !== sessionCode) return;
      setSession(newSession);
      setGameState(newSession.gameState);
      setMoveHistory([]);
      historyIdRef.current = 0;
      replayIdRef.current = 0;
      setPendingAnimation(null);
      setReplayAnimation(null);
      setReplayingEntryId(null);
      setShowGameEndModal(false);
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

    socket.on('tournament:match-game-state', (data) => {
      setMatchGameStates((prev) => ({ ...prev, [data.matchId]: data.gameState }));
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
      socket.off('game:started');
      socket.off('game:restarted');
      socket.off('game:error');
      socket.off('chat:message');
      socket.off('game:history');
      socket.off('chat:history');
      socket.off('tournament:updated');
      socket.off('tournament:match-game-state');
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
        const entries: HistoryEntry[] = sessionData.gameState.moveHistory.map(
          (hm: HistoricalMove, i: number) => ({
            id: i + 1,
            move: hm.move,
            playerNumber: hm.playerNumber,
            wasCapture: hm.wasCapture,
            isSkip: hm.isSkip,
          }),
        );
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
      localStorage.setItem(PLAYER_ID_KEY, result.spectatorId);
      localStorage.setItem(PLAYER_NAME_KEY, spectateDisplayName.trim());
      setPlayerId(result.spectatorId);
      setSession(result.session);
      setGameState(result.session.gameState);
    } catch (err) {
      setSpectateError((err as Error).message);
    } finally {
      setSpectateLoading(false);
    }
  };

  // When a player goes away, start a 30s timer before showing the boot button
  useEffect(() => {
    if (!session) return;
    const timers = bootTimersRef.current;

    for (const player of session.players) {
      if (player.status === 'away' && player.awayAt && !timers.has(player.id)) {
        const elapsed = Date.now() - player.awayAt;
        const remaining = Math.max(0, 30_000 - elapsed);
        const timer = setTimeout(() => {
          timers.delete(player.id);
          setBootablePlayerIds((prev) => new Set(prev).add(player.id));
        }, remaining);
        timers.set(player.id, timer);
      } else if (player.status === 'active') {
        const timer = timers.get(player.id);
        if (timer) {
          clearTimeout(timer);
          timers.delete(player.id);
        }
        setBootablePlayerIds((prev) => {
          if (!prev.has(player.id)) return prev;
          const next = new Set(prev);
          next.delete(player.id);
          return next;
        });
      }
    }
  }, [session?.players]);

  const handleBootPlayer = (targetPlayerId: string) => {
    if (!sessionCode || !playerId) return;
    const socket = socketService.getSocket();
    if (!socket) return;
    socket.emit('session:boot-player', { sessionCode, playerId, targetPlayerId });
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
    const isSeatedPlayer = session?.players.some((p) => p.id === playerId) ?? false;
    if (socket) {
      if (isSeatedPlayer) {
        // Stand up to free the seat — another player can then take it.
        // Keep playerId in localStorage so the player can rejoin as a spectator.
        socket.emit('session:stand-up', { sessionCode, playerId });
      } else {
        // Already a spectator: fully remove and clear identity.
        socket.emit('session:leave', { sessionCode, playerId });
        localStorage.removeItem(PLAYER_ID_KEY);
      }
    } else if (!isSeatedPlayer) {
      localStorage.removeItem(PLAYER_ID_KEY);
    }
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
    if (!gt || !GAME_MANIFESTS[gt].supportsAnimation) return;
    replayIdRef.current += 1;
    const animHelpers =
      gt === 'ur'
        ? { renderPiece: urRenderPiece, getExitSelector: urGetExitSelector }
        : { renderPiece: senetRenderPiece, getExitSelector: senetGetExitSelector };
    setReplayAnimation({
      move: entry.move,
      playerNumber: entry.playerNumber,
      gameType: gt,
      id: replayIdRef.current,
      ...animHelpers,
    });
    setReplayingEntryId(entry.id);
  };

  // Build chat destinations for tournament matches
  const chatDestinations: ChatDestination[] | undefined = session?.tournamentHubCode
    ? (() => {
        const opponent = session.players.find((p) => p.id !== playerId);
        const hubPeople = [...(hubSession?.players ?? []), ...(hubSession?.spectators ?? [])]
          .filter((p) => p.id !== playerId)
          .sort((a, b) => a.displayName.localeCompare(b.displayName));
        const dests: ChatDestination[] = [
          { id: 'tournament', label: 'Tournament (all)' },
          { id: 'match', label: `Match vs ${opponent?.displayName ?? 'Opponent'}` },
          ...hubPeople.map((p) => ({ id: p.id, label: `DM: ${p.displayName}` })),
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
      socket.emit('chat:send', {
        sessionCode,
        playerId,
        text,
        scope: { toPlayerId: destinationId },
      });
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
    // If we have an identity but haven't heard back from the server yet, the server
    // may be auto-adding us (e.g. hub participant joining a tournament match). Wait.
    if (playerId && joiningSession) {
      return (
        <div className="min-h-screen flex items-center justify-center">
          <div className="text-xl">Joining game...</div>
        </div>
      );
    }

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
  const isMyTurn =
    !isSpectator && gameState.currentTurn === currentPlayer?.playerNumber;
  const isTournamentMatch = !!session.tournamentHubCode;

  const animatingPiece = pendingAnimation
    ? { playerNumber: pendingAnimation.playerNumber, pieceIndex: pendingAnimation.move.pieceIndex }
    : null;

  type TabName = 'game' | 'chat' | 'room' | 'history' | 'bracket';
  const tabs: TabName[] = [
    'game',
    'chat',
    'room',
    'history',
    ...(isTournamentMatch ? ['bracket' as TabName] : []),
  ];

  return (
    <div className="h-screen overflow-hidden p-4">
      <div className="max-w-6xl mx-auto flex flex-col h-full overflow-hidden min-h-0">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-2xl font-bold">{getGameTitle(session.gameType)}</h1>
          <div className="flex items-center gap-2">
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
            <button
              onClick={() => setShowFeedback(true)}
              className="w-8 h-8 rounded-full flex items-center justify-center text-base transition-colors"
              style={{
                background: 'rgba(196,160,48,0.12)',
                border: '1.5px solid rgba(196,160,48,0.35)',
                color: '#C4A030',
              }}
              title="Feedback"
            >
              ✉
            </button>
          </div>
        </div>

        {error && (
          <div className="bg-red-500/20 border border-red-500 rounded-lg p-3 mb-4 text-center text-red-200">
            {error}
          </div>
        )}

        {/* Persistent game action strip — always visible regardless of active tab */}
        {bothSeated || currentPlayer ? (
          <GameControls
            session={session}
            gameState={gameState}
            playerId={playerId!}
            isMyTurn={isMyTurn}
            lastMove={moveHistory[moveHistory.length - 1]}
          />
        ) : (
          <div className="px-2 py-2 text-center text-xs" style={{ color: '#5A4A38' }}>
            Waiting for both players to take their seats…
          </div>
        )}

        {/* Board */}
        <Suspense
          fallback={
            <div
              className="flex items-center justify-center py-16 text-sm"
              style={{ color: 'rgba(196,168,107,0.5)' }}
            >
              Loading…
            </div>
          }
        >
          <div className="flex-shrink-0">
            {(() => {
              const BoardComponent = boardComponents[session.gameType];
              return (
                <BoardComponent
                  session={session}
                  gameState={gameState}
                  playerId={playerId!}
                  isMyTurn={isMyTurn}
                  animatingPiece={animatingPiece}
                />
              );
            })()}
          </div>
        </Suspense>
        {/* Tab bar */}
        <div className="flex gap-0 border-b" style={{ borderColor: 'rgba(42,30,14,0.8)' }}>
          {tabs.map((tab) => (
            <button
              key={tab}
              onClick={() => {
                setActiveTab(tab);
                if (tab === 'chat') {
                  setUnreadChat(0);
                  if (chatToastTimerRef.current) clearTimeout(chatToastTimerRef.current);
                  setChatToast(null);
                }
              }}
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
        <div className="flex-1 min-h-48 overflow-y-auto pb-4">
          {activeTab === 'game' && (
            <div className="tab-content-enter">
              <div className="grid grid-cols-2 gap-2 p-2">
                {([0, 1] as const).map((seatIndex) => {
                  const player = session.players.find((p) => p.playerNumber === seatIndex);
                  const isActive = player !== undefined && gameState.currentTurn === seatIndex;
                  const isMe = player?.id === playerId;
                  const boardPieces = gameState.board.pieces;

                  const scoreInfo = player
                    ? getScoreInfo(session.gameType, boardPieces, seatIndex)
                    : null;

                  return (
                    <div
                      key={seatIndex}
                      className={`rounded-lg p-2.5 border${isActive && isMe ? ' my-turn-pulse' : ' transition-all'}`}
                      style={{
                        background: isActive && isMe
                          ? 'rgba(34,197,94,0.06)'
                          : isActive
                            ? 'rgba(196,160,48,0.08)'
                            : 'rgba(8,5,0,0.5)',
                        borderColor: isActive && !isMe
                          ? 'rgba(196,160,48,0.45)'
                          : !isActive
                            ? 'rgba(42,30,14,0.8)'
                            : undefined,
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
                            <div className="flex-shrink-0">
                              <GamePiecePreview
                                gameType={session.gameType}
                                playerNumber={seatIndex as 0 | 1}
                                size={20}
                              />
                            </div>
                            <span
                              className="text-sm font-semibold truncate"
                              style={{ color: '#E8D8B0' }}
                            >
                              {player.displayName}
                              {isMe && (
                                <span
                                  className="ml-1 text-xs font-normal"
                                  style={{ color: '#6A5A40' }}
                                >
                                  (you)
                                </span>
                              )}
                            </span>
                            {isActive && (
                              <span
                                className="ml-auto flex-shrink-0 text-xs px-1.5 py-0.5 rounded font-bold"
                                style={{ background: 'rgba(196,160,48,0.25)', color: '#E8C870' }}
                              >
                                Turn
                              </span>
                            )}
                          </div>
                          {scoreInfo && (
                            <div className="text-xs mt-0.5" style={{ color: '#8A7A60' }}>
                              {scoreInfo}
                            </div>
                          )}
                          {!isMe && !isSpectator && bootablePlayerIds.has(player.id) && (
                            <button
                              onClick={() => handleBootPlayer(player.id)}
                              className="mt-1.5 w-full text-xs px-2 py-1 rounded transition-colors"
                              style={{
                                background: 'rgba(239,68,68,0.15)',
                                border: '1px solid rgba(239,68,68,0.4)',
                                color: '#FCA5A5',
                              }}
                            >
                              Boot (disconnected)
                            </button>
                          )}
                        </div>
                      ) : (
                        <div className="flex items-center justify-between">
                          <span className="text-xs" style={{ color: '#5A4A38' }}>
                            {seatIndex === 0 ? 'Player 1' : 'Player 2'}
                          </span>
                          {isSpectator ? (
                            <button
                              onClick={handleTakeSeat}
                              className="btn btn-secondary text-xs py-0.5 px-2"
                            >
                              Take Seat
                            </button>
                          ) : (
                            <span className="text-xs" style={{ color: '#3A2A1A' }}>
                              Empty
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

            </div>
          )}

          {activeTab === 'chat' && (
            <div className="tab-content-enter h-full">
              <ChatPanel
                messages={chatMessages}
                currentPlayerId={playerId!}
                chatDestinations={chatDestinations}
                onSend={handleChatSend}
                session={session}
              />
            </div>
          )}

          {activeTab === 'room' && (
            <div className="tab-content-enter p-3 space-y-4">
              <div>
                <div className="text-xs font-medium mb-2" style={{ color: '#8A7A60' }}>
                  Players
                </div>
                {session.players.length === 0 ? (
                  <div className="text-xs" style={{ color: '#5A4A38' }}>
                    No players seated
                  </div>
                ) : (
                  <div className="space-y-1">
                    {session.players.map((p) => (
                      <div key={p.id} className="flex items-center gap-2">
                        <span
                          className="flex-shrink-0 w-2 h-2 rounded-full"
                          style={{ background: p.status === 'away' ? '#F59E0B' : '#22C55E' }}
                          title={p.status === 'away' ? 'Away' : 'Active'}
                        />
                        <span className="text-sm" style={{ color: '#D4C8A8' }}>
                          {p.displayName}
                        </span>
                        {p.id === playerId && (
                          <span className="text-xs" style={{ color: '#6A5A40' }}>
                            you
                          </span>
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
                        <span
                          className="flex-shrink-0 w-2 h-2 rounded-full"
                          style={{ background: s.status === 'away' ? '#F59E0B' : '#22C55E' }}
                          title={s.status === 'away' ? 'Away' : 'Active'}
                        />
                        <span className="text-xs" style={{ color: '#A09070' }}>
                          {s.displayName}
                        </span>
                        {s.id === playerId && (
                          <span className="text-xs" style={{ color: '#6A5A40' }}>
                            you
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Spectator invite link */}
              <div>
                <div className="text-xs font-medium mb-1" style={{ color: '#8A7A60' }}>
                  Invite spectators
                </div>
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
            <div className="tab-content-enter pt-3">
              <MoveLog
                entries={moveHistory}
                gameType={session.gameType}
                session={session}
                onReplay={handleReplay}
                replayingId={replayingEntryId}
              />
            </div>
          )}

          {activeTab === 'bracket' && isTournamentMatch && (
            <div className="tab-content-enter p-3">
              {hubSession?.tournamentState ? (
                <TournamentBracket
                  tournament={hubSession.tournamentState}
                  participants={hubSession.tournamentState.participants}
                  currentPlayerId={playerId!}
                  matchGameStates={matchGameStates}
                  gameType={hubSession.gameType}
                  session={hubSession}
                  onMatchClick={(matchId) => setSelectedMatchId(matchId)}
                />
              ) : (
                <div className="text-xs text-center py-8" style={{ color: '#5A4A38' }}>
                  Loading bracket…
                </div>
              )}
            </div>
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
          onComplete={() => {
            setReplayAnimation(null);
            setReplayingEntryId(null);
          }}
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
              style={{
                background: 'rgba(80,60,30,0.5)',
                color: '#E8C870',
                border: '1px solid rgba(196,160,48,0.25)',
              }}
              title="Close"
            >
              ✕
            </button>
            <GameRules gameType={session.gameType} />
          </div>
        </div>
      )}

      {showFeedback && (
        <FeedbackModal
          gameType={session.gameType}
          sessionCode={sessionCode}
          playerName={
            session.players.find((p) => p.id === playerId)?.displayName ??
            session.spectators.find((s) => s.id === playerId)?.displayName
          }
          onClose={() => setShowFeedback(false)}
        />
      )}

      {selectedMatchId && (() => {
        const match = hubSession?.tournamentState?.rounds
          .flat()
          .find((m) => m.matchId === selectedMatchId);
        const matchGameState = matchGameStates[selectedMatchId];
        if (!match || !matchGameState || !hubSession) return null;
        return (
          <MatchSpectatorModal
            match={match}
            participants={hubSession.tournamentState!.participants}
            format={hubSession.tournamentState!.format}
            gameType={hubSession.gameType}
            gameState={matchGameState}
            session={hubSession}
            onClose={() => setSelectedMatchId(null)}
          />
        );
      })()}

      {showGameEndModal && gameState.finished && gameState.winner !== null && (
        <GameEndModal
          session={session}
          gameState={gameState}
          currentPlayer={currentPlayer}
          isSpectator={isSpectator}
          hubSession={hubSession}
          onPlayAgain={() => {
            setShowGameEndModal(false);
            handleRematch();
          }}
          onReturnToBracket={handleReturnToBracket}
          onLeave={() => navigate('/')}
        />
      )}
    </div>
  );
}
