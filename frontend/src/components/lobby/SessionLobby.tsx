import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Session, TournamentFormat, GameState, getGameTitle, GAME_MANIFESTS } from '@ancient-games/shared';
import { socketService } from '../../services/socket';
import { api } from '../../services/api';
import { PLAYER_ID_KEY, PLAYER_NAME_KEY } from '../../services/storage';
import { initPushNotifications } from '../../services/pushNotifications';
import TournamentBracket from '../tournament/TournamentBracket';
import ChatPanel, { ChatMessage } from '../ChatPanel';
import MatchSpectatorModal from '../tournament/MatchSpectatorModal';
import FeedbackModal from '../FeedbackModal';
import { getTheme, toggleTheme, type Theme } from '../../services/theme';
import { useTheme } from '../../hooks/useTheme';

const FORMAT_OPTIONS: { value: TournamentFormat | 'single'; label: string }[] = [
  { value: 'single', label: 'Single Match' },
  { value: 'bo1', label: 'Best of 1' },
  { value: 'bo3', label: 'Best of 3' },
  { value: 'bo5', label: 'Best of 5' },
  { value: 'bo7', label: 'Best of 7' },
  { value: 'round-robin', label: 'Round Robin' },
];

export function nextPowerOf2(n: number): number {
  let p = 1;
  while (p < n) p *= 2;
  return p;
}

/**
 * Returns the base description for a format, enriched with game count
 * and bye estimates when playerCount >= 2.
 */
export function getTournamentInfo(format: TournamentFormat | 'single', playerCount: number): string {
  const baseDesc: Record<TournamentFormat | 'single', string> = {
    single: '1 game, 2 players only',
    bo1: 'Elimination, 1 game per match',
    bo3: 'Elimination, first to 2 wins',
    bo5: 'Elimination, first to 3 wins',
    bo7: 'Elimination, first to 4 wins',
    'round-robin': 'Everyone plays everyone',
  };

  const base = baseDesc[format];

  if (playerCount < 2 || format === 'single') return base;

  if (format === 'round-robin') {
    const games = (playerCount * (playerCount - 1)) / 2;
    return `${base} · ${games} game${games !== 1 ? 's' : ''}`;
  }

  // Bracket formats
  const matches = playerCount - 1;
  const byes = nextPowerOf2(playerCount) - playerCount;

  const maxPerMatch: Record<Exclude<TournamentFormat, 'round-robin'>, number> = {
    bo1: 1,
    bo3: 3,
    bo5: 5,
    bo7: 7,
  };
  const max = maxPerMatch[format as Exclude<TournamentFormat, 'round-robin'>];
  const min = Math.ceil(max / 2);

  const minGames = matches * min;
  const maxGames = matches * max;
  const gameStr =
    minGames === maxGames
      ? `${minGames} game${minGames !== 1 ? 's' : ''}`
      : `~${minGames}–${maxGames} games`;

  const byeStr = byes > 0 ? ` · ${byes} bye${byes !== 1 ? 's' : ''}` : '';

  return `${base} · ${gameStr}${byeStr}`;
}

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

  const [playerId, setPlayerId] = useState<string | null>(localStorage.getItem(PLAYER_ID_KEY));
  const [showFeedback, setShowFeedback] = useState(false);
  const uiTheme = useTheme();
  const eg = uiTheme === 'egyptian';
  const [theme, setTheme] = useState<Theme>(getTheme);

  const [displayName, setDisplayName] = useState(localStorage.getItem(PLAYER_NAME_KEY) ?? '');
  const [joinLoading, setJoinLoading] = useState(false);
  const [joinError, setJoinError] = useState('');
  const [spectateLoading, setSpectateLoading] = useState(false);
  const [matchGameStates, setMatchGameStates] = useState<Record<string, GameState>>({});
  const [matchPlayers, setMatchPlayers] = useState<Record<string, Array<{ id: string; playerNumber: number }>>>({});
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [selectedMatchId, setSelectedMatchId] = useState<string | null>(null);
  const [showChat, setShowChat] = useState(false);

  const [showBotForm, setShowBotForm] = useState(false);
  const [botDifficulty, setBotDifficulty] = useState('medium');
  const [botPersona, setBotPersona] = useState('Ancient Strategist');
  const [botOllamaEnabled, setBotOllamaEnabled] = useState(false);
  const [addingBot, setAddingBot] = useState(false);

  const [bombermageConfig, setBombermageConfig] = useState({
    gridSize: '11x11' as '9x9' | '11x11' | '13x11',
    barrierDensity: 'normal' as 'sparse' | 'normal' | 'dense',
    powerupFrequency: 'normal' as 'rare' | 'normal' | 'common',
    fuseLength: 3 as 2 | 3 | 4,
    coinDensity: 0.25,
    apMin: 5,
    apMax: 5,
    enabledPowerups: ['blast-radius', 'extra-bomb', 'kick-bomb', 'manual-detonation', 'speed-boost', 'shield'] as string[],
  });

  const currentPlayerName =
    session?.players.find((p) => p.id === playerId)?.displayName ??
    localStorage.getItem(PLAYER_NAME_KEY) ??
    undefined;

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

    socket.on('tournament:match-game-state', (data) => {
      setMatchGameStates((prev) => ({ ...prev, [data.matchId]: data.gameState }));
      if (data.players) {
        setMatchPlayers((prev) => ({ ...prev, [data.matchId]: data.players }));
      }
    });

    socket.on('chat:message', (msg) => {
      setChatMessages((prev) => [...prev, msg]);
    });

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
      socket.off('tournament:match-game-state');
      socket.off('chat:message');
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
      localStorage.setItem(PLAYER_ID_KEY, result.playerId);
      localStorage.setItem(PLAYER_NAME_KEY, displayName.trim());
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
      socket.emit('game:start', { sessionCode, playerId, gameOptions: session?.gameType === 'bombermage' ? bombermageConfig : undefined } as any);
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
      localStorage.setItem(PLAYER_ID_KEY, result.spectatorId);
      localStorage.setItem(PLAYER_NAME_KEY, displayName.trim());
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

  const handleChatSend = useCallback(
    (text: string) => {
      const socket = socketService.getSocket();
      if (!socket || !session || !playerId) return;
      socket.emit('chat:send', {
        sessionCode: session.sessionCode,
        playerId,
        text,
        scope: 'tournament',
      });
    },
    [session, playerId],
  );

  const handleMatchClick = useCallback((matchId: string) => {
    setSelectedMatchId(matchId);
  }, []);

  const handleAddBot = async () => {
    if (!playerId || !sessionCode) return;
    setAddingBot(true);
    try {
      const updated = await api.addBot(
        sessionCode,
        playerId,
        botDifficulty,
        botPersona,
        botOllamaEnabled,
      );
      setSession(updated);
      setShowBotForm(false);
    } catch (e) {
      showNotice((e as Error).message);
    } finally {
      setAddingBot(false);
    }
  };

  const handleRemoveBot = async (botId: string) => {
    if (!playerId || !sessionCode) return;
    try {
      const updated = await api.removeBot(sessionCode, playerId, botId);
      setSession(updated);
    } catch (e) {
      showNotice((e as Error).message);
    }
  };

  const handleThemeToggle = () => {
    setTheme(toggleTheme());
  };

  const handleLeave = () => {
    if (!sessionCode || !playerId) return;
    const socket = socketService.getSocket();
    if (socket) socket.emit('session:leave', { sessionCode, playerId });
    localStorage.removeItem(PLAYER_ID_KEY);
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
          <div className="flex justify-end mb-2">
            <button
              onClick={handleThemeToggle}
              className="w-8 h-8 rounded-full flex items-center justify-center text-base transition-colors"
              style={{
                background: 'rgba(196,160,48,0.12)',
                border: '1.5px solid rgba(196,160,48,0.35)',
                color: '#C4A030',
              }}
              title={theme === 'egyptian' ? 'Switch to Classic theme' : 'Switch to Egyptian theme'}
              aria-label={theme === 'egyptian' ? 'Switch to Classic theme' : 'Switch to Egyptian theme'}
            >
              {theme === 'egyptian' ? '◈' : '☽'}
            </button>
          </div>
          <div className="text-center mb-6">
            <div className="text-4xl mb-3">🎲</div>
            <h1 className="text-2xl font-bold mb-1">You've been invited!</h1>
            {session && (
              <p className="text-gray-400">
                Join a game of{' '}
                <span className="text-white font-semibold">{getGameTitle(session.gameType)}</span>
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
  const requiredPlayers = GAME_MANIFESTS[session.gameType]?.playerCount ?? 2;
  const canStart =
    isHost && (format === 'single' ? session.players.length === requiredPlayers : session.players.length >= 2);

  // ── Tournament bracket view (tournament already started) ───────────────────
  if (session.tournamentState) {
    const selectedMatch = selectedMatchId
      ? session.tournamentState.rounds.flat().find((m) => m.matchId === selectedMatchId)
      : null;
    const selectedGameState = selectedMatchId ? matchGameStates[selectedMatchId] : null;

    return (
      <div className="min-h-screen flex flex-col">
        {/* Main content area */}
        <div className="flex flex-1 overflow-hidden">
          {/* Bracket area */}
          <div className="flex-1 min-w-0 overflow-auto p-4">
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h1 className="text-2xl font-bold">Tournament</h1>
                  <p className="text-gray-400 text-sm">{getGameTitle(session.gameType)}</p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={handleThemeToggle}
                    className="w-8 h-8 rounded-full flex items-center justify-center text-base transition-colors"
                    style={{
                      background: 'rgba(196,160,48,0.12)',
                      border: '1.5px solid rgba(196,160,48,0.35)',
                      color: '#C4A030',
                    }}
                    title={theme === 'egyptian' ? 'Switch to Classic theme' : 'Switch to Egyptian theme'}
                    aria-label={theme === 'egyptian' ? 'Switch to Classic theme' : 'Switch to Egyptian theme'}
                  >
                    {theme === 'egyptian' ? '◈' : '☽'}
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
                  <button onClick={handleLeave} className="text-gray-400 hover:text-white text-sm">
                    Leave
                  </button>
                </div>
              </div>

              <TournamentBracket
                tournament={session.tournamentState}
                participants={session.tournamentState.participants}
                currentPlayerId={playerId!}
                matchGameStates={matchGameStates}
                matchPlayers={matchPlayers}
                gameType={session.gameType}
                session={session}
                onMatchClick={handleMatchClick}
              />
            </div>
          </div>

          {/* Chat sidebar — desktop */}
          <div className="hidden lg:flex flex-col w-80 border-l border-amber-900/20">
            <ChatPanel
              messages={chatMessages}
              currentPlayerId={playerId!}
              onSend={handleChatSend}
              session={session}
            />
          </div>
        </div>

        {/* Chat FAB — mobile/tablet */}
        <div className="lg:hidden fixed bottom-4 right-4 z-40">
          <button
            onClick={() => setShowChat(!showChat)}
            className="w-12 h-12 rounded-full bg-amber-700 text-white shadow-lg flex items-center justify-center text-xl"
          >
            💬
          </button>
        </div>

        {/* Chat overlay — mobile/tablet */}
        {showChat && (
          <div className="lg:hidden fixed inset-0 z-50 flex flex-col bg-stone-900">
            <div className="flex items-center justify-between p-3 border-b border-amber-900/20">
              <span className="text-amber-200 font-semibold">Tournament Chat</span>
              <button onClick={() => setShowChat(false)} className="text-amber-200/50 text-xl">
                ✕
              </button>
            </div>
            <div className="flex-1 overflow-hidden">
              <ChatPanel
                messages={chatMessages}
                currentPlayerId={playerId!}
                onSend={handleChatSend}
                session={session}
              />
            </div>
          </div>
        )}

        {/* Spectator modal */}
        {selectedMatch && selectedGameState && (
          <MatchSpectatorModal
            match={selectedMatch}
            participants={session.tournamentState.participants}
            format={session.tournamentState.format}
            gameType={session.gameType}
            gameState={selectedGameState}
            matchPlayers={matchPlayers[selectedMatchId!] ?? []}
            session={session}
            onClose={() => setSelectedMatchId(null)}
          />
        )}

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
              <p className="text-gray-400">{getGameTitle(session.gameType)}</p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={handleThemeToggle}
                className="w-8 h-8 rounded-full flex items-center justify-center text-base transition-colors"
                style={{
                  background: 'rgba(196,160,48,0.12)',
                  border: '1.5px solid rgba(196,160,48,0.35)',
                  color: '#C4A030',
                }}
                title={theme === 'egyptian' ? 'Switch to Classic theme' : 'Switch to Egyptian theme'}
                aria-label={theme === 'egyptian' ? 'Switch to Classic theme' : 'Switch to Egyptian theme'}
              >
                {theme === 'egyptian' ? '◈' : '☽'}
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
              <button onClick={handleLeave} className="text-gray-400 hover:text-white">
                Leave
              </button>
            </div>
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
                  {(player as any).isBot && (
                    <span className="text-xs bg-stone-700 text-stone-400 px-1.5 py-0.5 rounded ml-1">
                      🤖 Bot
                    </span>
                  )}
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
                  (player as any).isBot ? (
                    <button
                      onClick={() => handleRemoveBot(player.id)}
                      className="text-xs text-red-400 hover:text-red-300 px-2 py-1 rounded hover:bg-red-900/30 transition-colors"
                      title="Remove bot"
                    >
                      Remove
                    </button>
                  ) : (
                    <button
                      onClick={() => handleHostStandUp(player.id)}
                      className="text-xs text-gray-400 hover:text-white px-2 py-1 rounded hover:bg-gray-600/50 transition-colors"
                      title="Move to spectators"
                    >
                      Stand
                    </button>
                  )
                )}
              </div>
            ))}

            {session.players.length < requiredPlayers && !showBotForm && (
              <div className="bg-gray-700/30 rounded-lg p-3 text-center text-gray-400">
                Waiting for another player...
              </div>
            )}

            {isHost && format === 'single' && session.players.length < requiredPlayers && (session.gameType == "ur" || session.gameType == "ur-roguelike" || session.gameType == "morris" ) && (
              <div className="mt-3">
                {!showBotForm ? (
                  <button
                    onClick={() => setShowBotForm(true)}
                    className="text-sm text-stone-400 hover:text-stone-200 border border-stone-600 hover:border-stone-400 rounded px-3 py-1.5 transition-colors w-full"
                  >
                    + Add Bot Player
                  </button>
                ) : (
                  <div className="border border-stone-600 rounded-lg p-3 space-y-2">
                    <p className="text-sm font-medium text-stone-300">Bot Settings</p>
                    <div className="flex gap-2">
                      <select
                        value={botDifficulty}
                        onChange={(e) => setBotDifficulty(e.target.value)}
                        className="flex-1 bg-stone-800 border border-stone-600 rounded px-2 py-1 text-sm text-stone-200"
                      >
                        {['easy', 'medium', 'hard', 'harder', 'hardest'].map((d) => (
                          <option key={d} value={d}>
                            {d.charAt(0).toUpperCase() + d.slice(1)}
                          </option>
                        ))}
                      </select>
                      <input
                        value={botPersona}
                        onChange={(e) => setBotPersona(e.target.value)}
                        placeholder="Bot name"
                        className="flex-1 bg-stone-800 border border-stone-600 rounded px-2 py-1 text-sm text-stone-200"
                      />
                    </div>
                    <label className="flex items-center gap-2 text-sm text-stone-400">
                      <input
                        type="checkbox"
                        checked={botOllamaEnabled}
                        onChange={(e) => setBotOllamaEnabled(e.target.checked)}
                        className="rounded"
                      />
                      Enable AI commentary (requires local Ollama)
                    </label>
                    <div className="flex gap-2">
                      <button
                        onClick={handleAddBot}
                        disabled={addingBot}
                        className="bg-amber-700 hover:bg-amber-600 text-white text-sm rounded px-3 py-1 disabled:opacity-50"
                      >
                        {addingBot ? 'Adding...' : 'Add Bot'}
                      </button>
                      <button
                        onClick={() => setShowBotForm(false)}
                        className="text-stone-400 hover:text-stone-200 text-sm px-3 py-1"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
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
                    {isHost && session.players.length < (format === 'single' ? requiredPlayers : 8) && (
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
                      background: format === opt.value
                        ? (eg ? 'rgba(138,106,0,0.12)' : 'rgba(196,160,48,0.12)')
                        : (eg ? 'rgba(240,232,208,0.6)' : 'rgba(8,5,0,0.5)'),
                      borderColor: format === opt.value
                        ? (eg ? 'rgba(138,106,0,0.6)' : 'rgba(196,160,48,0.5)')
                        : (eg ? 'rgba(192,160,112,0.5)' : 'rgba(42,30,14,0.8)'),
                      color: format === opt.value
                        ? (eg ? '#6E5200' : '#E8C870')
                        : (eg ? '#7A6040' : '#8A7A60'),
                    }}
                  >
                    <div className="text-sm font-semibold">{opt.label}</div>
                    <div className="text-xs mt-0.5 opacity-70">
                      {getTournamentInfo(opt.value, session.players.length)}
                    </div>
                  </button>
                ))}
              </div>
              {format === 'single' && session.players.length > requiredPlayers && (
                <div className="text-xs mt-2" style={{ color: eg ? '#8A6A00' : '#E8A030' }}>
                  Single Match requires exactly {requiredPlayers} players seated.
                </div>
              )}
            </div>
          )}

          {/* Format display for non-hosts */}
          {!isHost && (
            <div className="mb-6 text-sm" style={{ color: eg ? '#7A6040' : '#6A5A40' }}>
              Format: {FORMAT_OPTIONS.find((o) => o.value === format)?.label ?? 'Single Match'}
              {' '}—{' '}
              <span className="opacity-70">{getTournamentInfo(format, session.players.length)}</span>
              {' '}— waiting for host to start
            </div>
          )}

          {/* Bombermage settings — host only */}
          {session?.gameType === 'bombermage' && isHost && (
            <div className="flex flex-col gap-2 mt-3 mb-4 p-3 bg-stone-800 rounded text-sm">
              <div className="font-semibold text-stone-300">Bombermage Settings</div>
              <label className="flex items-center gap-2">
                <span className="text-stone-400 w-32">Grid size</span>
                <select
                  value={bombermageConfig.gridSize}
                  onChange={(e) => setBombermageConfig((c) => ({ ...c, gridSize: e.target.value as any }))}
                  className="bg-stone-700 text-white rounded px-2 py-1"
                >
                  <option value="9x9">9×9</option>
                  <option value="11x11">11×11 (default)</option>
                  <option value="13x11">13×11</option>
                </select>
              </label>
              <label className="flex items-center gap-2">
                <span className="text-stone-400 w-32">Barrier density</span>
                <select
                  value={bombermageConfig.barrierDensity}
                  onChange={(e) => setBombermageConfig((c) => ({ ...c, barrierDensity: e.target.value as any }))}
                  className="bg-stone-700 text-white rounded px-2 py-1"
                >
                  <option value="sparse">Sparse</option>
                  <option value="normal">Normal</option>
                  <option value="dense">Dense</option>
                </select>
              </label>
              <label className="flex items-center gap-2">
                <span className="text-stone-400 w-32">Powerup drops</span>
                <select
                  value={bombermageConfig.powerupFrequency}
                  onChange={(e) => setBombermageConfig((c) => ({ ...c, powerupFrequency: e.target.value as any }))}
                  className="bg-stone-700 text-white rounded px-2 py-1"
                >
                  <option value="rare">Rare</option>
                  <option value="normal">Normal</option>
                  <option value="common">Common</option>
                </select>
              </label>
              <label className="flex items-center gap-2">
                <span className="text-stone-400 w-32">Fuse length</span>
                <select
                  value={bombermageConfig.fuseLength}
                  onChange={(e) => setBombermageConfig((c) => ({ ...c, fuseLength: Number(e.target.value) as any }))}
                  className="bg-stone-700 text-white rounded px-2 py-1"
                >
                  <option value={2}>2 turns (fast)</option>
                  <option value={3}>3 turns (default)</option>
                  <option value={4}>4 turns (slow)</option>
                </select>
              </label>
              <label className="flex items-center gap-2">
                <span className="text-stone-400 w-32">Coin density</span>
                <select
                  value={bombermageConfig.coinDensity}
                  onChange={(e) => setBombermageConfig((c) => ({ ...c, coinDensity: parseFloat(e.target.value) }))}
                  className="bg-stone-700 text-white rounded px-2 py-1"
                >
                  <option value={0}>None (0%)</option>
                  <option value={0.1}>Rare (10%)</option>
                  <option value={0.25}>Normal (25%)</option>
                  <option value={0.4}>Common (40%)</option>
                </select>
              </label>
              <label className="flex items-center gap-2">
                <span className="text-stone-400 w-32">AP min</span>
                <select
                  value={bombermageConfig.apMin}
                  onChange={(e) => setBombermageConfig((c) => ({ ...c, apMin: Number(e.target.value) }))}
                  className="bg-stone-700 text-white rounded px-2 py-1"
                >
                  {[1,2,3,4,5,6].map(n => <option key={n} value={n}>{n}</option>)}
                </select>
              </label>
              <label className="flex items-center gap-2">
                <span className="text-stone-400 w-32">AP max</span>
                <select
                  value={bombermageConfig.apMax}
                  onChange={(e) => setBombermageConfig((c) => ({ ...c, apMax: Number(e.target.value) }))}
                  className="bg-stone-700 text-white rounded px-2 py-1"
                >
                  {[1,2,3,4,5,6].map(n => <option key={n} value={n}>{n}</option>)}
                </select>
              </label>
              <div>
                <div className="text-stone-400 mb-1">Enabled powerups</div>
                <div className="flex flex-wrap gap-2">
                  {(['blast-radius', 'extra-bomb', 'kick-bomb', 'manual-detonation', 'speed-boost', 'shield'] as const).map((pu) => (
                    <label key={pu} className="flex items-center gap-1 text-xs cursor-pointer">
                      <input
                        type="checkbox"
                        checked={bombermageConfig.enabledPowerups.includes(pu)}
                        onChange={(e) =>
                          setBombermageConfig((c) => ({
                            ...c,
                            enabledPowerups: e.target.checked
                              ? [...c.enabledPowerups, pu]
                              : c.enabledPowerups.filter((p) => p !== pu),
                          }))
                        }
                      />
                      <span className="text-stone-300">{pu}</span>
                    </label>
                  ))}
                </div>
              </div>
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
            {isSpectator && session.players.length < (format === 'single' ? requiredPlayers : 8) && (
              <button onClick={handleTakeSeat} className="btn btn-secondary flex-1">
                Take a Seat
              </button>
            )}
          </div>

          {!isSpectator && isHost && !canStart && (
            <div className="text-sm text-gray-400 text-center mt-2">
              {session.players.length < requiredPlayers
                ? `Waiting for ${requiredPlayers - session.players.length} more player(s)...`
                : format === 'single' && session.players.length > requiredPlayers
                  ? `Single Match requires exactly ${requiredPlayers} players`
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

      {showFeedback && session && (
        <FeedbackModal
          gameType={session.gameType}
          sessionCode={sessionCode}
          playerName={currentPlayerName}
          onClose={() => setShowFeedback(false)}
        />
      )}
    </div>
  );
}
