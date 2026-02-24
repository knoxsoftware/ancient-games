import { memo, useEffect, useRef, useState } from 'react';
import { Session } from '@ancient-games/shared';
import { useTheme } from '../contexts/ThemeContext';

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

interface ChatPanelProps {
  messages: ChatMessage[];
  onSend: (text: string, destinationId?: string) => void;
  currentPlayerId: string;
  chatDestinations?: ChatDestination[];
  session?: Session;
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
}: ChatPanelProps) {
  const [draft, setDraft] = useState('');
  const [destination, setDestination] = useState<string>('match');
  const scrollRef = useRef<HTMLDivElement>(null);
  const { theme } = useTheme();
  const isYahoo = theme === 'yahoo';

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
        background: isYahoo ? '#ffffff' : 'rgba(8,5,0,0.6)',
        borderColor: isYahoo ? '#cccccc' : '#2A1E0E',
        height: '100%',
        borderRadius: isYahoo ? '0' : undefined,
      }}
    >
      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-3 py-2 space-y-2">
        {messages.length === 0 && (
          <div className="text-xs text-center py-8" style={{ color: isYahoo ? '#999999' : '#5A4A38' }}>
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
                  style={{ color: isMe ? (isYahoo ? '#400090' : '#E8C870') : (isYahoo ? '#666666' : '#A09070') }}
                >
                  {msg.displayName}
                </span>
                {msg.isSpectator && (
                  <span className="text-xs" style={{ color: isYahoo ? '#999999' : '#5A4A38', fontSize: '10px' }}>
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
                <span className="text-xs" style={{ color: isYahoo ? '#999999' : '#5A4A38', fontSize: '10px' }}>
                  {formatTime(msg.timestamp)}
                </span>
              </div>
              <div
                className="rounded-lg px-3 py-1.5 text-sm max-w-[85%] break-words"
                style={{
                  background: msg.chatScope === 'dm'
                    ? (isYahoo ? '#f0eeff' : 'rgba(80,60,120,0.2)')
                    : isMe
                      ? (isYahoo ? '#ffffcc' : 'rgba(196,160,48,0.15)')
                      : (isYahoo ? '#f0f0ee' : 'rgba(42,30,14,0.6)'),
                  border: `1px solid ${
                    msg.chatScope === 'dm'
                      ? (isYahoo ? '#c0a0ff' : 'rgba(120,80,180,0.3)')
                      : isMe
                        ? (isYahoo ? '#cccc99' : 'rgba(196,160,48,0.3)')
                        : (isYahoo ? '#cccccc' : 'rgba(42,30,14,0.8)')
                  }`,
                  color: isYahoo ? '#000000' : '#D4C8A8',
                  borderRadius: isYahoo ? '0' : undefined,
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
        <div className="px-3 pt-2 pb-1 border-t" style={{ borderColor: isYahoo ? '#cccccc' : '#2A1E0E' }}>
          <select
            value={destination}
            onChange={(e) => setDestination(e.target.value)}
            className="w-full rounded-lg px-2 py-1 text-xs outline-none"
            style={{
              background: isYahoo ? '#ffffff' : 'rgba(42,30,14,0.5)',
              border: isYahoo ? '1px solid #999999' : '1px solid rgba(42,30,14,0.8)',
              color: isYahoo ? '#000000' : '#A09070',
              borderRadius: isYahoo ? '0' : undefined,
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
        className="flex gap-2 px-3 py-2 border-t"
        style={{ borderColor: isYahoo ? '#cccccc' : '#2A1E0E' }}
      >
        <input
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Type a message…"
          maxLength={500}
          className="flex-1 rounded-lg px-3 py-1.5 text-sm outline-none"
          style={{
            background: isYahoo ? '#ffffff' : 'rgba(42,30,14,0.5)',
            border: isYahoo ? '1px solid #999999' : '1px solid rgba(42,30,14,0.8)',
            color: isYahoo ? '#000000' : '#D4C8A8',
            borderRadius: isYahoo ? '0' : undefined,
          }}
        />
        <button
          type="submit"
          disabled={!draft.trim()}
          className="rounded-lg px-3 py-1.5 text-sm font-medium transition-colors"
          style={{
            background: draft.trim()
              ? (isYahoo ? '#400090' : 'rgba(196,160,48,0.25)')
              : (isYahoo ? '#dddddd' : 'rgba(42,30,14,0.4)'),
            border: isYahoo ? '1px solid #999999' : '1px solid rgba(196,160,48,0.3)',
            color: draft.trim()
              ? (isYahoo ? '#ffffff' : '#E8C870')
              : (isYahoo ? '#999999' : '#5A4A38'),
            cursor: draft.trim() ? 'pointer' : 'default',
            borderRadius: isYahoo ? '0' : undefined,
          }}
        >
          Send
        </button>
      </form>
    </div>
  );
}

export default memo(ChatPanel);
