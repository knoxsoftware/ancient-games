import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { Session, GameState } from '@ancient-games/shared';
import DraftModal from './DraftModal';
import { EVENT_DISPLAY, POWER_UP_DISPLAY } from './roguelikeConstants';
import { socketService } from '../../../services/socket';
import { useTheme } from '../../../hooks/useTheme';

const UrBoard = lazy(() => import('../ur/UrBoard'));

interface Props {
  session: Session;
  gameState: GameState;
  playerId: string;
  isMyTurn: boolean;
}

export default function UrRoguelikeBoard({ session, gameState, playerId, isMyTurn }: Props) {
  const eg = useTheme() === 'egyptian';
  const board = gameState.board;
  const player = session.players.find((p) => p.id === playerId);
  const [eventToast, setEventToast] = useState<{ name: string; description: string; emoji: string } | null>(null);
  const prevEventKeyRef = useRef<string | null>(null);
  // Set when the server signals no valid moves but a reroll power is available
  const [awaitingRerollDecision, setAwaitingRerollDecision] = useState(false);

  // Listen for dice-rolled with canReroll flag
  useEffect(() => {
    const socket = socketService.getSocket();
    if (!socket) return;
    const handler = ({ playerNumber, canReroll }: { playerNumber: number; roll: number; canMove: boolean; canReroll?: boolean }) => {
      if (canReroll && playerNumber === player?.playerNumber) {
        setAwaitingRerollDecision(true);
      } else {
        setAwaitingRerollDecision(false);
      }
    };
    socket.on('game:dice-rolled', handler);
    return () => { socket.off('game:dice-rolled', handler); };
  }, [player?.playerNumber]);

  // Clear decision state when turn changes or dice is cleared
  useEffect(() => {
    if (board.diceRoll === null) setAwaitingRerollDecision(false);
  }, [board.diceRoll]);

  // Show toast when a new event triggers
  useEffect(() => {
    const ev = board.pendingEventResult;
    if (ev) {
      const key = ev.eventId + String(board.currentTurn);
      if (key !== prevEventKeyRef.current) {
        prevEventKeyRef.current = key;
        const info = EVENT_DISPLAY[ev.eventId];
        if (info) {
          setEventToast(info);
          const t = setTimeout(() => setEventToast(null), 3000);
          return () => clearTimeout(t);
        }
      }
    }
  }, [board.pendingEventResult, board.currentTurn]);

  const myModifiers = (board.modifiers ?? []).filter(
    (m) => m.owner === player?.playerNumber && (m.remainingUses === null || (m.remainingUses ?? 0) > 0),
  );

  const usePower = (powerId: string) => {
    socketService.getSocket()?.emit('game:use-power', {
      sessionCode: session.sessionCode,
      playerId,
      powerId,
    });
  };

  // Determine which powers are currently usable
  const diceRolled = board.diceRoll !== null;
  const isPowerUsable = (powerId: string): boolean => {
    if (!isMyTurn) return false;
    switch (powerId) {
      case 'slow_curse': return !diceRolled; // use before rolling
      case 'double_roll': return !diceRolled; // activates this roll
      case 'reroll': return diceRolled;       // use after seeing your roll
      case 'extra_move': return !diceRolled;  // arm before rolling, grants extra move
      default: return false;
    }
  };

  return (
    <div className="relative">
      {/* Draft modal overlay */}
      {board.draftPhase && (
        <DraftModal session={session} gameState={gameState} playerId={playerId} />
      )}

      {/* Event toast */}
      {eventToast && (
        <div
          className="absolute top-2 left-1/2 -translate-x-1/2 z-40 rounded-lg px-4 py-2 text-sm font-semibold shadow-lg"
          style={{ background: eg ? '#F0E8D0' : '#3A1A00', border: eg ? '1px solid #C0A070' : '1px solid #C47A20', color: eg ? '#6E5200' : '#E8C870', whiteSpace: 'nowrap' }}
        >
          {eventToast.emoji} {eventToast.name}: {eventToast.description}
        </div>
      )}

      {/* Active modifiers row */}
      {myModifiers.length > 0 && (
        <div className="flex gap-2 mb-2 flex-wrap">
          {myModifiers.map((m) => {
            const info = POWER_UP_DISPLAY[m.id];
            if (!info) return null;
            const usable = isPowerUsable(m.id);
            return usable ? (
              <button
                key={m.id}
                onClick={() => usePower(m.id)}
                className="text-xs rounded px-2 py-0.5 cursor-pointer transition-colors"
                style={{
                  background: '#3A2800',
                  border: '1px solid #C47A20',
                  color: '#E8C870',
                }}
                title={`Use: ${info.description}`}
              >
                {info.emoji} {info.name}
                {m.remainingUses !== null ? ` (${m.remainingUses})` : ''} ▶
              </button>
            ) : (
              <span
                key={m.id}
                className="text-xs rounded px-2 py-0.5"
                style={{ background: '#2A1E10', border: '1px solid #5A4020', color: '#C4A060' }}
                title={info.description}
              >
                {info.emoji} {info.name}
                {m.remainingUses !== null ? ` (${m.remainingUses})` : ''}
              </span>
            );
          })}
        </div>
      )}

      {/* No valid moves — offer reroll or skip */}
      {awaitingRerollDecision && (
        <div className="flex items-center gap-3 mb-2">
          <span className="text-xs" style={{ color: '#C4A060' }}>No valid moves —</span>
          <button
            onClick={() => {
              socketService.getSocket()?.emit('game:skip-turn', {
                sessionCode: session.sessionCode,
                playerId,
              });
              setAwaitingRerollDecision(false);
            }}
            className="text-xs rounded px-2 py-0.5 cursor-pointer"
            style={{ background: '#2A1E10', border: '1px solid #5A4020', color: '#C4A060' }}
          >
            Skip Turn
          </button>
        </div>
      )}

      {/* Surge armed indicator */}
      {board.extraMovePendingFor === player?.playerNumber && (
        <div className="text-xs mb-2 font-semibold" style={{ color: '#E8C870' }}>
          ⚡ Surge armed — roll and make your first move, then move again!
        </div>
      )}

      {/* Event square legend */}
      {(board.eventSquares ?? []).length > 0 && (
        <div className="text-xs mb-2" style={{ color: '#7A6A50' }}>
          ⚗️ Event squares: positions {(board.eventSquares ?? []).sort((a, b) => a - b).join(', ')}
        </div>
      )}

      {/* Base Ur board */}
      <Suspense fallback={<div className="text-center p-4">Loading…</div>}>
        <UrBoard
          session={session}
          gameState={gameState}
          playerId={playerId}
          isMyTurn={isMyTurn}
        />
      </Suspense>
    </div>
  );
}
