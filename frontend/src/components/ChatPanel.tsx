import { memo, useEffect, useRef, useState } from 'react';
import { Session, GameState, GameType, GAME_MANIFESTS } from '@ancient-games/shared';
import { GamePiecePreview } from './games/GamePiecePreview';
import { getScoreInfo } from '../utils/gameScoreInfo';
import { HistoryEntry, describeMove } from './MoveLog';

export interface ChatMessage {
  id: string;
  playerId: string;
  displayName: string;
  text: string;
  timestamp: number;
  isSpectator?: boolean;
  chatScope?: 'tournament' | 'match' | 'dm';
  toPlayerId?: string;
}

export interface ChatDestination {
  id: string; // 'tournament' | 'match' | playerId
  label: string;
}

const QUICK_REACTIONS = [
  'Nice move!',
  'Oops!',
  'Ouch!',
  'Good game',
  'Lucky!',
  'Interesting…',
];

interface ChatPanelProps {
  messages: ChatMessage[];
  onSend: (text: string, destinationId?: string) => void;
  currentPlayerId: string;
  chatDestinations?: ChatDestination[];
  session?: Session;
  gameState?: GameState | null;
  gameType?: GameType;
  moveHistory?: HistoryEntry[];
  onReplay?: (entry: HistoryEntry) => void;
  replayingId?: number | null;
  isSpectator?: boolean;
  bootablePlayerIds?: Set<string>;
  onBootPlayer?: (targetPlayerId: string) => void;
  onTakeSeat?: () => void;
}

function getSenderStatus(session: Session | undefined, playerId: string): 'active' | 'away' | null {
  if (!session) return null;
  const p = session.players.find((p) => p.id === playerId);
  if (p) return p.status ?? 'active';
  const s = session.spectators.find((s) => s.id === playerId);
  if (s) return s.status ?? 'active';
  return null;
}

function ChatPanel({
  messages,
  onSend,
  currentPlayerId,
  chatDestinations,
  session,
  gameState,
  gameType,
  moveHistory,
  onReplay,
  replayingId,
  isSpectator,
  bootablePlayerIds,
  onBootPlayer,
  onTakeSeat,
}: ChatPanelProps) {
  const [draft, setDraft] = useState('');
  const [destination, setDestination] = useState<string>('match');
  const [showReactions, setShowReactions] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const reactionsRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (chatDestinations && chatDestinations.length > 0) {
      setDestination(chatDestinations[0].id);
    }
  }, [chatDestinations?.length]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages.length, moveHistory?.length]);

  useEffect(() => {
    if (!showReactions) return;
    const handler = (e: MouseEvent) => {
      if (reactionsRef.current && !reactionsRef.current.contains(e.target as Node)) {
        setShowReactions(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showReactions]);

  const handleQuickReaction = (text: string) => {
    onSend(text, chatDestinations ? destination : undefined);
    setShowReactions(false);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = draft.trim();
    if (!trimmed) return;
    onSend(trimmed, chatDestinations ? destination : undefined);
    setDraft('');
  };

  const formatTime = (ts: number) => {
    const d = new Date(ts);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  function getScopeBadge(msg: ChatMessage): string | null {
    if (msg.chatScope === 'tournament') return '[Tournament]';
    if (msg.chatScope === 'dm') return '[DM]';
    return null;
  }

  // Build a merged, sorted feed of chat messages and move history entries.
  type FeedItem =
    | { kind: 'chat'; msg: ChatMessage; key: string; ts: number }
    | { kind: 'move'; entry: HistoryEntry; key: string; ts: number };

  const chatItems: FeedItem[] = messages.map((msg, i) => ({
    kind: 'chat' as const,
    msg,
    key: `chat-${i}`,
    ts: msg.timestamp,
  }));

  // Live entries have a real timestamp; entries loaded from server history don't,
  // so we fall back to their sequential id (which keeps them in order but sorts
  // before any real timestamps, i.e. they cluster at the top as history).
  const moveItems: FeedItem[] =
    moveHistory && gameType && session
      ? moveHistory.map((entry) => ({
          kind: 'move' as const,
          entry,
          key: `move-${entry.id}`,
          ts: entry.timestamp ?? entry.id,
        }))
      : [];

  const feed = [...chatItems, ...moveItems].sort((a, b) => a.ts - b.ts);

  return (
    <div
      className="rounded-xl border flex flex-col"
      style={{
        background: 'rgba(8,5,0,0.6)',
        borderColor: '#2A1E0E',
        height: '100%',
      }}
    >
      {/* Game Status Bar */}
      {session && gameType && (
        <div
          className="px-3 py-2 border-b flex items-center gap-2"
          style={{ borderColor: '#2A1E0E', background: 'rgba(20,12,0,0.4)' }}
        >
          {([0, 1] as const).map((seatIndex) => {
            const player = session.players.find((p) => p.playerNumber === seatIndex);
            const isActive = gameState?.started && !gameState.finished && gameState.currentTurn === seatIndex;
            const isMe = player?.id === currentPlayerId;
            const isActiveMe = isActive && isMe;
            const isActiveOther = isActive && !isMe;
            const score = gameState?.started && !gameState.finished && gameState.board.pieces
              ? getScoreInfo(gameType, gameState.board.pieces, seatIndex)
              : null;
            const isBootable = player && bootablePlayerIds?.has(player.id) && !isMe && !isSpectator;
            const canTakeSeat = !player && isSpectator;
            return (
              <div
                key={seatIndex}
                className={`flex items-center gap-1.5 px-2 py-1 rounded-md border text-xs font-medium flex-1 min-w-0${isActiveMe ? ' my-turn-pulse' : ''}`}
                style={{
                  background: isActiveMe
                    ? 'rgba(34,197,94,0.06)'
                    : isActiveOther
                      ? 'rgba(196,160,48,0.08)'
                      : 'rgba(8,5,0,0.4)',
                  borderColor: isActiveOther
                    ? 'rgba(196,160,48,0.45)'
                    : isActiveMe
                      ? undefined
                      : 'rgba(42,30,14,0.6)',
                }}
              >
                <GamePiecePreview gameType={gameType} playerNumber={seatIndex} size={14} />
                {player ? (
                  <>
                    {/* Presence dot */}
                    <span
                      className="flex-shrink-0 w-1.5 h-1.5 rounded-full"
                      style={{ background: player.status === 'away' ? '#F59E0B' : '#22C55E' }}
                      title={player.status === 'away' ? 'Away' : 'Active'}
                    />
                    <span className="truncate" style={{ color: isActiveMe ? '#A8D8A0' : isActiveOther ? '#C8A850' : '#6A5A40' }}>
                      {player.displayName}
                      {isMe && (
                        <span style={{ color: isActiveMe ? '#6A9A60' : '#4A3A28' }}> (you)</span>
                      )}
                    </span>
                    {score !== null && (
                      <span className="ml-auto flex-shrink-0" style={{ color: isActiveMe ? '#6A9A60' : isActiveOther ? '#9A7A30' : '#4A3A28' }}>
                        {score}
                      </span>
                    )}
                    {isBootable && (
                      <button
                        onClick={() => onBootPlayer?.(player.id)}
                        className="ml-auto flex-shrink-0 px-1.5 py-0.5 rounded text-xs transition-colors"
                        style={{
                          background: 'rgba(239,68,68,0.15)',
                          border: '1px solid rgba(239,68,68,0.4)',
                          color: '#FCA5A5',
                        }}
                      >
                        Boot
                      </button>
                    )}
                  </>
                ) : canTakeSeat ? (
                  <button
                    onClick={onTakeSeat}
                    className="flex-1 text-left transition-colors truncate"
                    style={{ color: '#6A9A60' }}
                  >
                    Take Seat
                  </button>
                ) : (
                  <span className="truncate" style={{ color: '#3A2A1A' }}>Empty</span>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Spectators row */}
      {session && session.spectators.length > 0 && (
        <div
          className="px-3 py-1.5 border-b flex items-center gap-2 overflow-hidden"
          style={{ borderColor: '#2A1E0E', background: 'rgba(20,12,0,0.3)' }}
        >
          <span className="flex-shrink-0 text-sm">👁</span>
          <div className="flex items-center gap-1.5 overflow-hidden flex-nowrap min-w-0">
            {session.spectators.map((s) => (
              <span
                key={s.id}
                className="flex-shrink-0 px-1.5 py-0.5 rounded text-xs truncate max-w-[100px]"
                style={{
                  background: 'rgba(42,30,14,0.5)',
                  border: '1px solid rgba(42,30,14,0.8)',
                  color: s.id === currentPlayerId ? '#A09070' : '#6A5A40',
                }}
                title={s.displayName}
              >
                {s.displayName}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Merged feed: move history + chat, sorted by timestamp */}
      <div ref={scrollRef} className="flex-1 min-h-0 overflow-y-auto px-3 py-2 space-y-1">
        {feed.length === 0 && (
          <div className="text-xs text-center py-8" style={{ color: '#5A4A38' }}>
            No messages yet
          </div>
        )}
        {feed.map((item) => {
          if (item.kind === 'move') {
            const { entry } = item;
            const isReplaying = entry.id === replayingId;
            const playerColor = GAME_MANIFESTS[gameType!].playerColors[entry.playerNumber];
            return (
              <button
                key={item.key}
                onClick={() => onReplay?.(entry)}
                className="w-full text-left flex items-center gap-2 px-2 py-1 rounded transition-colors"
                style={{
                  background: isReplaying ? 'rgba(196,168,107,0.12)' : 'transparent',
                  fontSize: '11px',
                  color: isReplaying ? '#F0E6C8' : '#6A5A40',
                }}
                title="Replay this move"
              >
                <span className="flex-shrink-0 w-1.5 h-1.5 rounded-full" style={{ background: playerColor }} />
                <span className="flex-1 truncate font-mono">{describeMove(entry, session!)}</span>
                <span style={{ color: '#3A2A1A', fontSize: '10px' }}>&#8634;</span>
              </button>
            );
          }

          const { msg } = item;
          const isMe = msg.playerId === currentPlayerId;
          const badge = getScopeBadge(msg);
          const status = getSenderStatus(session, msg.playerId);
          return (
            <div key={item.key} className={`flex flex-col ${isMe ? 'items-end' : 'items-start'}`}>
              <div className="flex items-baseline gap-2 mb-0.5 flex-wrap">
                {status && (
                  <span
                    className="flex-shrink-0 w-1.5 h-1.5 rounded-full self-center"
                    style={{ background: status === 'away' ? '#F59E0B' : '#22C55E' }}
                    title={status === 'away' ? 'Away' : 'Active'}
                  />
                )}
                <span
                  className="text-xs font-semibold"
                  style={{ color: isMe ? '#E8C870' : '#A09070' }}
                >
                  {msg.displayName}
                </span>
                {msg.isSpectator && (
                  <span className="text-xs" style={{ color: '#5A4A38', fontSize: '10px' }}>
                    spectating
                  </span>
                )}
                {badge && (
                  <span
                    className="text-xs px-1 rounded"
                    style={{
                      fontSize: '10px',
                      background:
                        msg.chatScope === 'tournament'
                          ? 'rgba(196,160,48,0.15)'
                          : 'rgba(80,60,120,0.25)',
                      color: msg.chatScope === 'tournament' ? '#C8A840' : '#A080D0',
                      border: `1px solid ${
                        msg.chatScope === 'tournament'
                          ? 'rgba(196,160,48,0.3)'
                          : 'rgba(120,80,180,0.3)'
                      }`,
                    }}
                  >
                    {badge}
                  </span>
                )}
                <span className="text-xs" style={{ color: '#5A4A38', fontSize: '10px' }}>
                  {formatTime(msg.timestamp)}
                </span>
              </div>
              <div
                className="rounded-lg px-3 py-1.5 text-sm max-w-[85%] break-words"
                style={{
                  background:
                    msg.chatScope === 'dm'
                      ? 'rgba(80,60,120,0.2)'
                      : isMe
                        ? 'rgba(196,160,48,0.15)'
                        : 'rgba(42,30,14,0.6)',
                  border: `1px solid ${
                    msg.chatScope === 'dm'
                      ? 'rgba(120,80,180,0.3)'
                      : isMe
                        ? 'rgba(196,160,48,0.3)'
                        : 'rgba(42,30,14,0.8)'
                  }`,
                  color: '#D4C8A8',
                }}
              >
                {msg.text}
              </div>
            </div>
          );
        })}
      </div>

      {/* Destination selector */}
      {chatDestinations && chatDestinations.length > 1 && (
        <div className="px-3 pt-2 pb-1 border-t" style={{ borderColor: '#2A1E0E' }}>
          <select
            value={destination}
            onChange={(e) => setDestination(e.target.value)}
            className="w-full rounded-lg px-2 py-1 text-xs outline-none"
            style={{
              background: 'rgba(42,30,14,0.5)',
              border: '1px solid rgba(42,30,14,0.8)',
              color: '#A09070',
            }}
          >
            {chatDestinations.map((d) => (
              <option key={d.id} value={d.id}>
                {d.label}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Input */}
      <form
        onSubmit={handleSubmit}
        ref={reactionsRef}
        className="relative flex gap-2 px-3 py-2 border-t"
        style={{ borderColor: '#2A1E0E' }}
      >
        {/* Quick reactions popover */}
        {showReactions && (
          <div
            className="absolute bottom-full left-3 mb-1 rounded-xl p-2 flex flex-col gap-1 z-10"
            style={{
              background: 'rgba(18,12,4,0.97)',
              border: '1px solid #3A2810',
              boxShadow: '0 -4px 16px rgba(0,0,0,0.5)',
              minWidth: '10rem',
            }}
          >
            {QUICK_REACTIONS.map((reaction) => (
              <button
                key={reaction}
                type="button"
                onClick={() => handleQuickReaction(reaction)}
                className="text-left rounded-lg px-3 py-1.5 text-sm transition-colors"
                style={{ color: '#C4B890' }}
                onMouseEnter={(e) => {
                  (e.currentTarget as HTMLButtonElement).style.background = 'rgba(196,160,48,0.12)';
                  (e.currentTarget as HTMLButtonElement).style.color = '#E8C870';
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLButtonElement).style.background = '';
                  (e.currentTarget as HTMLButtonElement).style.color = '#C4B890';
                }}
              >
                {reaction}
              </button>
            ))}
          </div>
        )}
        {/* Reactions toggle button */}
        <button
          type="button"
          aria-label="Quick reactions"
          onClick={() => setShowReactions((v) => !v)}
          className="flex-shrink-0 flex items-center justify-center w-8 h-8 rounded-lg transition-colors"
          style={{
            background: showReactions ? 'rgba(196,160,48,0.18)' : 'rgba(42,30,14,0.5)',
            border: `1px solid ${showReactions ? 'rgba(196,160,48,0.5)' : 'rgba(42,30,14,0.8)'}`,
            color: showReactions ? '#E8C870' : '#6A5A40',
          }}
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <circle cx="8" cy="8" r="6.5" stroke="currentColor" strokeWidth="1.3"/>
            <circle cx="5.5" cy="6.5" r="0.9" fill="currentColor"/>
            <circle cx="10.5" cy="6.5" r="0.9" fill="currentColor"/>
            <path d="M5 9.5c.5 1.5 5.5 1.5 6 0" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
          </svg>
        </button>
        <input
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Type a message…"
          maxLength={500}
          className="flex-1 rounded-lg px-3 py-1.5 text-sm outline-none"
          style={{
            background: 'rgba(42,30,14,0.5)',
            border: '1px solid rgba(42,30,14,0.8)',
            color: '#D4C8A8',
          }}
        />
        <button
          type="submit"
          disabled={!draft.trim()}
          className="rounded-lg px-3 py-1.5 text-sm font-medium transition-colors"
          style={{
            background: draft.trim() ? 'rgba(196,160,48,0.25)' : 'rgba(42,30,14,0.4)',
            border: '1px solid rgba(196,160,48,0.3)',
            color: draft.trim() ? '#E8C870' : '#5A4A38',
            cursor: draft.trim() ? 'pointer' : 'default',
          }}
        >
          Send
        </button>
      </form>
    </div>
  );
}

export default memo(ChatPanel);
