import { useEffect } from 'react';
import React from 'react';
import { socketService } from '../../../services/socket';
import { GameControlsProps } from '../../GameControls';

const PLAYER_COLORS = ['#F97316', '#8B5CF6', '#22C55E', '#EC4899'];

export default function BombermageControls({ session, gameState, playerId, isMyTurn }: GameControlsProps) {
  const board = gameState.board as any;
  const terrain: any[][] = board.terrain ?? [];
  const bombs: any[] = board.bombs ?? [];
  const players: any[] = board.players ?? [];
  const myPlayer = session.players.find((p) => p.id === playerId);
  const myPN = myPlayer?.playerNumber ?? -1;
  const me = players[myPN];

  const ap: number = board.actionPointsRemaining ?? 0;
  const diceRoll: number | null = board.diceRoll;
  const apMin: number = board.config?.apMin ?? 1;
  const apMax: number = board.config?.apMax ?? 6;
  const staticAP = apMin === apMax;

  // Auto-roll when AP is static (no dice variance)
  useEffect(() => {
    if (staticAP && isMyTurn && diceRoll === null) {
      const socket = socketService.getSocket();
      socket?.emit('game:roll-dice', { sessionCode: session.sessionCode, playerId });
    }
  }, [staticAP, isMyTurn, diceRoll, session.sessionCode, playerId]);

  function emitMove(dest: { row: number; col: number }) {
    const socket = socketService.getSocket();
    if (!socket) return;
    socket.emit('game:move', {
      sessionCode: session.sessionCode,
      playerId,
      move: Object.assign({ playerId, pieceIndex: 0, from: 0, to: 0 }, { extra: { type: 'move', dest } }),
    });
  }

  function emitPlaceBomb() {
    const socket = socketService.getSocket();
    if (!socket || !me) return;
    socket.emit('game:move', {
      sessionCode: session.sessionCode,
      playerId,
      move: Object.assign({ playerId, pieceIndex: 0, from: 0, to: 0 }, {
        extra: { type: 'place-bomb', dest: { row: me.position.row, col: me.position.col } },
      }),
    });
  }

  function handleEndTurn() {
    const socket = socketService.getSocket();
    if (!socket) return;
    socket.emit('game:move', {
      sessionCode: session.sessionCode,
      playerId,
      move: Object.assign({ playerId, pieceIndex: 0, from: 0, to: 0 }, { extra: { type: 'end-turn' } }),
    });
  }

  function handleRollDice() {
    const socket = socketService.getSocket();
    if (!socket) return;
    socket.emit('game:roll-dice', { sessionCode: session.sessionCode, playerId });
  }

  function canMoveTo(dr: number, dc: number): boolean {
    if (!isMyTurn || diceRoll === null || ap < 1 || !me) return false;
    const r = me.position.row + dr;
    const c = me.position.col + dc;
    if (r < 0 || r >= terrain.length || c < 0 || c >= (terrain[0]?.length ?? 0)) return false;
    if (terrain[r]?.[c] !== 'empty') return false;
    if (bombs.some((b: any) => b.position.row === r && b.position.col === c)) return false;
    return true;
  }

  const canBomb =
    isMyTurn && diceRoll !== null && ap >= 1 && !!me &&
    me.activeBombCount < me.inventory.maxBombs;

  const currentTurnPN: number = board.currentTurn ?? 0;

  function renderPlayerPanel(player: any, playerNumber: number, isMe: boolean) {
    if (!player) return <div className="w-16 flex-shrink-0" />;
    const color = PLAYER_COLORS[playerNumber];
    const inv = player.inventory;
    const isActive = currentTurnPN === playerNumber;
    const badges: string[] = [
      inv.blastRadius > 1 ? `+${inv.blastRadius - 1}🔥` : '',
      inv.maxBombs > 1 ? `${inv.maxBombs}💣` : '',
      inv.kickBomb ? '👟' : '',
      inv.manualDetonation ? '⚡' : '',
      inv.shield ? '🛡️' : '',
      inv.speedBoostTurnsRemaining > 0 ? `💨${inv.speedBoostTurnsRemaining}` : '',
    ].filter(Boolean);

    const glowStyle: React.CSSProperties = isActive
      ? { boxShadow: isMe ? '0 0 0 2px #22c55e' : '0 0 0 2px #eab308' }
      : {};

    return (
      <div
        className="flex flex-col gap-1 p-1.5 rounded-lg flex-shrink-0 w-16"
        style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', ...glowStyle }}
      >
        <div className="flex items-center gap-1">
          <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: color }} />
          <span className="text-[10px] font-semibold text-white truncate">
            {isMe ? 'You' : (session.players.find(p => p.playerNumber === playerNumber)?.displayName ?? 'Opp')}
          </span>
        </div>
        <div className="text-[10px] text-stone-400">{player.activeBombCount}/{inv.maxBombs} 💣</div>
        <div className="text-[10px] text-yellow-300">🪙 {player.score ?? 0}</div>
        {badges.length > 0 && (
          <div className="flex flex-wrap gap-0.5">
            {badges.map(label => (
              <span key={label} className="text-[8px] px-0.5 py-px rounded bg-stone-700 text-stone-300">{label}</span>
            ))}
          </div>
        )}
      </div>
    );
  }

  function renderDpad() {
    function dpadBtn(label: string, dr: number, dc: number) {
      const enabled = canMoveTo(dr, dc);
      return (
        <button
          className="w-11 h-11 rounded-lg flex items-center justify-center text-lg font-bold transition-all active:scale-90 disabled:opacity-30"
          style={{ background: enabled ? '#334155' : '#1e293b', color: '#e2e8f0', border: '2px solid #475569' }}
          disabled={!enabled}
          onClick={() => { if (me) emitMove({ row: me.position.row + dr, col: me.position.col + dc }); }}
          onTouchEnd={(e) => { e.preventDefault(); if (me && enabled) emitMove({ row: me.position.row + dr, col: me.position.col + dc }); }}
        >{label}</button>
      );
    }

    // Center cell: Roll → End Turn → waiting indicator (mutually exclusive states)
    function centerCell() {
      const currentTurnName =
        session.players.find(p => p.playerNumber === currentTurnPN)?.displayName ?? '…';

      if (!isMyTurn) {
        // Show AP if rolling has happened, else show waiting indicator
        return (
          <div className="w-11 h-11 rounded-lg flex flex-col items-center justify-center gap-0"
            style={{ background: '#0f172a', border: '2px solid #1e293b' }}>
            {diceRoll !== null ? (
              <>
                <span className="text-green-400 font-bold text-sm leading-none">{ap}</span>
                <span className="text-stone-600 text-[8px] leading-none">AP</span>
              </>
            ) : (
              <span className="text-stone-600 text-[9px] text-center leading-tight px-0.5">{currentTurnName}</span>
            )}
          </div>
        );
      }

      if (diceRoll === null && !staticAP) {
        return (
          <button
            className="w-11 h-11 rounded-lg flex flex-col items-center justify-center text-[9px] font-bold transition-all active:scale-90"
            style={{ background: 'linear-gradient(135deg, #f97316 0%, #c2410c 100%)', color: '#fff', border: '2px solid #f97316' }}
            onClick={handleRollDice}
            onTouchEnd={(e) => { e.preventDefault(); handleRollDice(); }}
          >
            🎲
          </button>
        );
      }

      if (diceRoll !== null) {
        return (
          <button
            className="w-11 h-11 rounded-lg flex flex-col items-center justify-center gap-0 transition-all active:scale-90"
            style={{ background: '#334155', color: '#e2e8f0', border: '2px solid #475569' }}
            onClick={handleEndTurn}
            onTouchEnd={(e) => { e.preventDefault(); handleEndTurn(); }}
          >
            <span className="text-green-400 font-bold text-sm leading-none">{ap}</span>
            <span className="text-[8px] leading-none text-stone-400">end</span>
          </button>
        );
      }

      // staticAP auto-rolling — show AP placeholder
      return (
        <div className="w-11 h-11 rounded-lg flex items-center justify-center"
          style={{ background: '#0f172a', border: '2px solid #1e293b' }}>
          <span className="text-stone-600 text-[9px]">…</span>
        </div>
      );
    }

    return (
      <div className="grid grid-cols-3 gap-1" style={{ gridTemplateRows: 'repeat(3, 1fr)' }}>
        <div />{dpadBtn('↑', -1, 0)}<div />
        {dpadBtn('←', 0, -1)}
        {centerCell()}
        {dpadBtn('→', 0, 1)}
        <div />{dpadBtn('↓', 1, 0)}<div />
      </div>
    );
  }

  if (!me) return null;

  return (
    <div className="w-full flex flex-col items-center gap-2 py-2">
      {/* Player panels row */}
      <div className="flex gap-1.5 justify-center flex-wrap">
        {players.map((player: any) =>
          renderPlayerPanel(player, player.playerNumber, player.playerNumber === myPN)
        )}
      </div>

      {/* D-pad + bomb */}
      <div className="flex items-center gap-3">
        {renderDpad()}
        <button
          className="w-14 h-14 rounded-full flex items-center justify-center text-2xl transition-all active:scale-90 disabled:opacity-30"
          style={{
            background: '#7c2d12',
            border: `3px solid #c2410c`,
          }}
          disabled={!canBomb}
          onClick={emitPlaceBomb}
          onTouchEnd={(e) => { e.preventDefault(); if (canBomb) emitPlaceBomb(); }}
        >
          💣
        </button>
      </div>
    </div>
  );
}
