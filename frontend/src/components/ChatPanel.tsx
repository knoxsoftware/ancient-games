import { memo, useEffect, useRef, useState } from 'react';
import { Session, GameState, GameType } from '@ancient-games/shared';
import { GamePiecePreview } from './games/GamePiecePreview';
import { getScoreInfo } from '../utils/gameScoreInfo';

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
}: ChatPanelProps) {
  const [draft, setDraft] = useState('');
  const [destination, setDestination] = useState<string>('match');
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (chatDestinations && chatDestinations.length > 0) {
      setDestination(chatDestinations[0].id);
    }
  }, [chatDestinations?.length]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages.length]);

  const handleQuickReaction = (text: string) => {
    onSend(text, chatDestinations ? destination : undefined);
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
      {gameState && gameState.started && !gameState.finished && session && gameType && (() => {
        const currentTurnSeat = gameState.currentTurn; // 0 or 1
        const turnPlayer = session.players[currentTurnSeat];
        const isMyTurn = turnPlayer?.id === currentPlayerId;
        const score0 = getScoreInfo(gameType, gameState.board.pieces, 0);
        const score1 = getScoreInfo(gameType, gameState.board.pieces, 1);
        const hasScore = score0 !== null || score1 !== null;
        return (
          <div
            className="px-3 py-2 border-b flex items-center gap-2 flex-wrap"
            style={{ borderColor: '#2A1E0E', background: 'rgba(20,12,0,0.4)' }}
          >
            <GamePiecePreview gameType={gameType} playerNumber={currentTurnSeat as 0 | 1} size={18} />
            <span className="text-xs font-medium" style={{ color: isMyTurn ? '#E8C870' : '#A09070' }}>
              {isMyTurn ? 'Your turn' : `${turnPlayer?.displayName ?? 'Opponent'}'s turn`}
            </span>
            {hasScore && (
              <span className="ml-auto text-xs flex items-center gap-1.5" style={{ color: '#6A5A40' }}>
                {session.players[0] && (
                  <>
                    <GamePiecePreview gameType={gameType} playerNumber={0} size={12} />
                    <span style={{ color: '#A09070' }}>{score0 ?? '—'}</span>
                  </>
                )}
                <span style={{ color: '#3A2A1A' }}>·</span>
                {session.players[1] && (
                  <>
                    <GamePiecePreview gameType={gameType} playerNumber={1} size={12} />
                    <span style={{ color: '#A09070' }}>{score1 ?? '—'}</span>
                  </>
                )}
              </span>
            )}
          </div>
        );
      })()}

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 min-h-0 overflow-y-auto px-3 py-2 space-y-2">
        {messages.length === 0 && (
          <div className="text-xs text-center py-8" style={{ color: '#5A4A38' }}>
            No messages yet
          </div>
        )}
        {messages.map((msg, i) => {
          const isMe = msg.playerId === currentPlayerId;
          const badge = getScopeBadge(msg);
          const status = getSenderStatus(session, msg.playerId);
          return (
            <div key={i} className={`flex flex-col ${isMe ? 'items-end' : 'items-start'}`}>
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

      {/* Quick Reactions */}
      <div className="px-3 pt-2 pb-1 flex flex-wrap gap-1.5 border-t" style={{ borderColor: '#2A1E0E' }}>
        {QUICK_REACTIONS.map((reaction) => (
          <button
            key={reaction}
            type="button"
            onClick={() => handleQuickReaction(reaction)}
            className="rounded-full px-2.5 py-0.5 text-xs transition-colors"
            style={{
              background: 'rgba(42,30,14,0.5)',
              border: '1px solid rgba(42,30,14,0.9)',
              color: '#8A7A60',
              cursor: 'pointer',
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLButtonElement).style.background = 'rgba(196,160,48,0.12)';
              (e.currentTarget as HTMLButtonElement).style.color = '#C4A840';
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLButtonElement).style.background = 'rgba(42,30,14,0.5)';
              (e.currentTarget as HTMLButtonElement).style.color = '#8A7A60';
            }}
          >
            {reaction}
          </button>
        ))}
      </div>

      {/* Input */}
      <form
        onSubmit={handleSubmit}
        className="flex gap-2 px-3 py-2 border-t"
        style={{ borderColor: '#2A1E0E' }}
      >
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
