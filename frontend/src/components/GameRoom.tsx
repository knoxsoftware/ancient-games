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
import { HistoryEntry } from './MoveLog';
import GameRules from './GameRules';
import GameControls from './GameControls';
import ChatPanel, { ChatMessage, ChatDestination } from './ChatPanel';
import TournamentBracket from './tournament/TournamentBracket';
import MatchSpectatorModal from './tournament/MatchSpectatorModal';
import GameEndModal from './GameEndModal';

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
  const [skipNotice, setSkipNotice] = useState<{ playerName: string; roll: number } | null>(null);
  const [showRules, setShowRules] = useState(false);
  const [showFeedback, setShowFeedback] = useState(false);
  const [showBracket, setShowBracket] = useState(false);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatToast, setChatToast] = useState<{ displayName: string; text: string } | null>(null);
  const chatToastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
const [showGameEndModal, setShowGameEndModal] = useState(false);
  const [tournamentToast, setTournamentToast] = useState<string | null>(null);
  const tournamentToastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [matchGameStates, setMatchGameStates] = useState<Record<string, GameState>>({});
  const [selectedMatchId, setSelectedMatchId] = useState<string | null>(null);

  // Synchronous ref updates — always reflects latest value without needing an effect
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
            timestamp: Date.now(),
          },
        ]);
        setSkipNotice({ playerName, roll });
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
        { id: historyIdRef.current, move, playerNumber: playerNum, wasCapture, timestamp: Date.now() },
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
      if (!document.hidden) {
        if (chatToastTimerRef.current) clearTimeout(chatToastTimerRef.current);
        setChatToast({ displayName: msg.displayName, text: msg.text });
        chatToastTimerRef.current = setTimeout(() => setChatToast(null), 3000);
        showNotification(msg.displayName, msg.text);
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

  const handleTakeSeat = () => {
    if (!sessionCode || !playerId) return;
    const socket = socketService.getSocket();
    if (!socket) return;
    socket.emit('session:take-seat', { sessionCode, playerId });
  };

  const handleStandUp = () => {
    if (!sessionCode || !playerId) return;
    const socket = socketService.getSocket();
    if (!socket) return;
    socket.emit('session:stand-up', { sessionCode, playerId });
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


  return (
    <div className="h-screen overflow-hidden p-4">
      <div className="max-w-6xl mx-auto flex flex-col h-full overflow-hidden min-h-0">
        {/* Header */}
        <div className="flex items-center justify-between mb-4 gap-2">
          <h1 className="text-2xl font-bold flex-shrink-0">{getGameTitle(session.gameType)}</h1>
          <div className="flex items-center gap-1.5 flex-wrap justify-end">
            {/* Rules */}
            <button
              onClick={() => setShowRules(true)}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium transition-colors"
              style={{
                background: 'rgba(196,160,48,0.12)',
                border: '1.5px solid rgba(196,160,48,0.35)',
                color: '#C4A030',
              }}
            >
              <svg width="13" height="13" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                <circle cx="8" cy="8" r="7" stroke="currentColor" strokeWidth="1.5"/>
                <path d="M8 11V8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                <circle cx="8" cy="5.5" r="0.75" fill="currentColor"/>
              </svg>
              Rules
            </button>
            {/* Feedback */}
            <button
              onClick={() => setShowFeedback(true)}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium transition-colors"
              style={{
                background: 'rgba(196,160,48,0.12)',
                border: '1.5px solid rgba(196,160,48,0.35)',
                color: '#C4A030',
              }}
            >
              <svg width="13" height="13" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                <rect x="1.5" y="3.5" width="13" height="9" rx="1.5" stroke="currentColor" strokeWidth="1.5"/>
                <path d="M1.5 5L8 9.5L14.5 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
              </svg>
              Feedback
            </button>
            {/* Bracket — tournament matches only */}
            {isTournamentMatch && (
              <button
                onClick={() => setShowBracket(true)}
                className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium transition-colors"
                style={{
                  background: 'rgba(196,160,48,0.12)',
                  border: '1.5px solid rgba(196,160,48,0.35)',
                  color: '#C4A030',
                }}
              >
                <svg width="13" height="13" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                  <rect x="1" y="2" width="4" height="3" rx="0.75" stroke="currentColor" strokeWidth="1.3"/>
                  <rect x="1" y="11" width="4" height="3" rx="0.75" stroke="currentColor" strokeWidth="1.3"/>
                  <rect x="11" y="6.5" width="4" height="3" rx="0.75" stroke="currentColor" strokeWidth="1.3"/>
                  <path d="M5 3.5H8V8H5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
                  <path d="M5 12.5H8V8" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
                  <path d="M8 8H11" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
                </svg>
                Bracket
              </button>
            )}
            {/* Stand Up — seated players only */}
            {!isSpectator && (
              <button
                onClick={handleStandUp}
                className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium transition-colors"
                style={{
                  background: 'rgba(196,160,48,0.12)',
                  border: '1.5px solid rgba(196,160,48,0.35)',
                  color: '#C4A030',
                }}
              >
                <svg width="13" height="13" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                  <circle cx="8" cy="3" r="1.5" stroke="currentColor" strokeWidth="1.3"/>
                  <path d="M8 5.5V10M5 8l3-2.5L11 8" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
                  <path d="M6 13l2-3 2 3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
                Stand Up
              </button>
            )}
            {/* Leave */}
            <button
              onClick={handleLeave}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium transition-colors"
              style={{
                background: 'rgba(196,160,48,0.12)',
                border: '1.5px solid rgba(196,160,48,0.35)',
                color: '#C4A030',
              }}
            >
              <svg width="13" height="13" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                <path d="M6 3H3a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                <path d="M10 11l3-3-3-3M13 8H6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              Leave
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
        {/* Chat panel — always visible */}
        <div className="flex-1 min-h-48 overflow-y-auto pb-4">
          <ChatPanel
            messages={chatMessages}
            currentPlayerId={playerId!}
            chatDestinations={chatDestinations}
            onSend={handleChatSend}
            session={session}
            gameState={gameState}
            gameType={session.gameType}
            moveHistory={moveHistory}
            onReplay={handleReplay}
            replayingId={replayingEntryId}
            isSpectator={isSpectator}
            bootablePlayerIds={bootablePlayerIds}
            onBootPlayer={handleBootPlayer}
            onTakeSeat={handleTakeSeat}
          />
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
	{skipNotice.playerName} rolled a {skipNotice.roll} — No valid moves. Pass.
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

      {showBracket && isTournamentMatch && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(4px)' }}
          onClick={() => setShowBracket(false)}
        >
          <div
            className="relative w-full max-w-3xl max-h-[85vh] overflow-y-auto rounded-xl p-6"
            style={{ background: '#1A1008', border: '1px solid rgba(196,160,48,0.3)' }}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => setShowBracket(false)}
              className="absolute top-4 right-4 w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold transition-colors"
              style={{
                background: 'rgba(80,60,30,0.5)',
                color: '#E8C870',
                border: '1px solid rgba(196,160,48,0.25)',
              }}
            >
              ✕
            </button>
            {hubSession?.tournamentState ? (
              <TournamentBracket
                tournament={hubSession.tournamentState}
                participants={hubSession.tournamentState.participants}
                currentPlayerId={playerId!}
                matchGameStates={matchGameStates}
                gameType={hubSession.gameType}
                session={hubSession}
                onMatchClick={(matchId) => { setSelectedMatchId(matchId); setShowBracket(false); }}
              />
            ) : (
              <div className="text-xs text-center py-8" style={{ color: '#5A4A38' }}>
                Loading bracket…
              </div>
            )}
          </div>
        </div>
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
