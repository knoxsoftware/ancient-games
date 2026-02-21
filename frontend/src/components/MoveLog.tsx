import { useEffect, useRef } from 'react';
import { Move, Session } from '@ancient-games/shared';

export interface HistoryEntry {
  id: number;
  move: Move;
  playerNumber: number;
  wasCapture: boolean;
  isSkip?: boolean;
}

interface MoveLogProps {
  entries: HistoryEntry[];
  gameType: 'ur' | 'senet';
  session: Session;
  onReplay: (entry: HistoryEntry) => void;
  replayingId: number | null;
}

function describeMove(
  entry: HistoryEntry,
  session: Session
): string {
  const { move, playerNumber, wasCapture, isSkip } = entry;
  const name = session.players.find(p => p.playerNumber === playerNumber)?.displayName ?? `P${playerNumber + 1}`;
  if (isSkip) {
    return `${name}: skipped (rolled ${move.diceRoll ?? '?'})`;
  }
  const roll = move.diceRoll !== undefined ? ` (${move.diceRoll})` : '';
  const fromStr = move.from === -1 ? 'start' : String(move.from);
  const toStr = move.to === 99 ? 'exit' : String(move.to);
  const cap = wasCapture ? ' \u2694' : '';
  return `${name}: ${fromStr}\u2192${toStr}${roll}${cap}`;
}

export function MoveLog({ entries, gameType, session, onReplay, replayingId }: MoveLogProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = 0;
    }
  }, [entries.length]);

  const playerColor = (pn: number) =>
    gameType === 'ur'
      ? pn === 0 ? '#2F6BAD' : '#7A4A22'
      : pn === 0 ? '#C4A870' : '#3A1A00';

  return (
    <div
      className="rounded-xl border"
      style={{ background: 'rgba(8,5,0,0.6)', borderColor: '#2A1E0E' }}
    >
      <div
        className="px-3 py-2 border-b text-xs font-semibold tracking-wide"
        style={{ color: '#907A60', borderColor: '#2A1E0E' }}
      >
        Move History
      </div>
      <div
        ref={scrollRef}
        className="overflow-y-auto"
        style={{ maxHeight: '240px' }}
      >
        {entries.length === 0 && (
          <div className="px-3 py-4 text-xs text-center" style={{ color: '#5A4A38' }}>
            No moves yet
          </div>
        )}
        {[...entries].reverse().map((entry) => {
          const isReplaying = entry.id === replayingId;
          return (
            <button
              key={entry.id}
              onClick={() => onReplay(entry)}
              className="w-full text-left px-3 py-2 flex items-center gap-2 transition-colors"
              style={{
                background: isReplaying ? 'rgba(196,168,107,0.12)' : 'transparent',
                borderBottom: '1px solid rgba(42,30,14,0.5)',
                fontSize: '11px',
                color: isReplaying ? '#F0E6C8' : '#A09070',
              }}
              title="Replay this move"
            >
              <span
                className="flex-shrink-0 w-2 h-2 rounded-full"
                style={{ background: playerColor(entry.playerNumber) }}
              />
              <span className="flex-1 truncate font-mono">
                {describeMove(entry, session)}
              </span>
              <span style={{ color: '#5A4A38', fontSize: '10px' }}>&#8634;</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
