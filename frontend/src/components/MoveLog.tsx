import { memo, useEffect, useRef } from 'react';
import { Move, Session, GAME_MANIFESTS, GameType } from '@ancient-games/shared';
import { useTheme } from '../contexts/ThemeContext';

export interface HistoryEntry {
  id: number;
  move: Move;
  playerNumber: number;
  wasCapture: boolean;
  isSkip?: boolean;
}

interface MoveLogProps {
  entries: HistoryEntry[];
  gameType: GameType;
  session: Session;
  onReplay: (entry: HistoryEntry) => void;
  replayingId: number | null;
}

export function describeMove(entry: HistoryEntry, session: Session): string {
  const { move, playerNumber, wasCapture, isSkip } = entry;
  const name =
    session.players.find((p) => p.playerNumber === playerNumber)?.displayName ??
    `P${playerNumber + 1}`;
  if (isSkip) {
    return `${name}: skipped (rolled ${move.diceRoll ?? '?'})`;
  }
  const roll = move.diceRoll !== undefined ? ` (${move.diceRoll})` : '';
  const fromStr = move.from === -1 ? 'start' : String(move.from);
  const toStr = move.to === 99 ? 'exit' : String(move.to);
  const cap = wasCapture ? ' \u2694' : '';
  return `${name}: ${fromStr}\u2192${toStr}${roll}${cap}`;
}

export const MoveLog = memo(function MoveLog({
  entries,
  gameType,
  session,
  onReplay,
  replayingId,
}: MoveLogProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const { theme } = useTheme();
  const isYahoo = theme === 'yahoo';

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = 0;
    }
  }, [entries.length]);

  const playerColor = (pn: number) => GAME_MANIFESTS[gameType].playerColors[pn];

  return (
    <div
      className="rounded-xl border"
      style={{
        background: isYahoo ? '#ffffff' : 'rgba(8,5,0,0.6)',
        borderColor: isYahoo ? '#cccccc' : '#2A1E0E',
        borderRadius: isYahoo ? '0' : undefined,
      }}
    >
      <div
        className="px-3 py-2 border-b text-xs font-semibold tracking-wide"
        style={{ color: isYahoo ? '#666666' : '#907A60', borderColor: isYahoo ? '#cccccc' : '#2A1E0E' }}
      >
        Move History
      </div>
      <div ref={scrollRef} className="overflow-y-auto" style={{ maxHeight: '240px' }}>
        {entries.length === 0 && (
          <div className="px-3 py-4 text-xs text-center" style={{ color: isYahoo ? '#999999' : '#5A4A38' }}>
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
                background: isReplaying
                  ? (isYahoo ? '#ffffcc' : 'rgba(196,168,107,0.12)')
                  : 'transparent',
                borderBottom: isYahoo ? '1px solid #eeeeee' : '1px solid rgba(42,30,14,0.5)',
                fontSize: '11px',
                color: isReplaying
                  ? (isYahoo ? '#000000' : '#F0E6C8')
                  : (isYahoo ? '#333333' : '#A09070'),
              }}
              title="Replay this move"
            >
              <span
                className="flex-shrink-0 w-2 h-2 rounded-full"
                style={{ background: playerColor(entry.playerNumber) }}
              />
              <span className="flex-1 truncate font-mono">{describeMove(entry, session)}</span>
              <span style={{ color: isYahoo ? '#999999' : '#5A4A38', fontSize: '10px' }}>&#8634;</span>
            </button>
          );
        })}
      </div>
    </div>
  );
});
