import React from 'react';
import { Session, GameState } from '@ancient-games/shared';
import { socketService } from '../../../services/socket';

interface Props {
  session: Session;
  gameState: GameState;
  playerId: string;
  isMyTurn: boolean;
}

type TerrainCell = 'empty' | 'indestructible' | 'destructible';
interface Position { row: number; col: number; }

function terrainStyle(cell: TerrainCell, exploding: boolean): React.CSSProperties {
  if (exploding) {
    return { background: '#f97316', border: '1px solid #ea580c' };
  }
  switch (cell) {
    case 'empty':
      return {
        background: `
          repeating-linear-gradient(
            45deg,
            rgba(255,255,255,0.025) 0px,
            rgba(255,255,255,0.025) 1px,
            transparent 1px,
            transparent 8px
          ),
          repeating-linear-gradient(
            -45deg,
            rgba(255,255,255,0.025) 0px,
            rgba(255,255,255,0.025) 1px,
            transparent 1px,
            transparent 8px
          ),
          #0f172a
        `,
        border: '1px solid #1e293b',
      };
    case 'indestructible':
      return {
        background: `
          repeating-linear-gradient(
            0deg,
            rgba(0,0,0,0.3) 0px,
            rgba(0,0,0,0.3) 1px,
            transparent 1px,
            transparent 12px
          ),
          repeating-linear-gradient(
            90deg,
            rgba(0,0,0,0.2) 0px,
            rgba(0,0,0,0.2) 1px,
            transparent 1px,
            transparent 24px
          ),
          #334155
        `,
        border: '1px solid #64748b',
      };
    case 'destructible':
      return {
        background: `
          repeating-linear-gradient(
            30deg,
            rgba(0,0,0,0.2) 0px,
            rgba(0,0,0,0.2) 2px,
            transparent 2px,
            transparent 10px
          ),
          repeating-linear-gradient(
            -30deg,
            rgba(255,255,255,0.06) 0px,
            rgba(255,255,255,0.06) 1px,
            transparent 1px,
            transparent 10px
          ),
          #92400e
        `,
        border: '1px solid #d97706',
      };
  }
}

const POWERUP_ICON: Record<string, string> = {
  'blast-radius': '🔥',
  'extra-bomb': '💣',
  'kick-bomb': '👟',
  'manual-detonation': '⚡',
  'speed-boost': '💨',
  'shield': '🛡️',
};

const PLAYER_COLORS = ['#F97316', '#8B5CF6'];

export default function BombermageBoard({ session, gameState, playerId, isMyTurn }: Props) {
  const board = gameState.board as any;
  const terrain: TerrainCell[][] = board.terrain ?? [];
  const powerups: (string | null)[][] = board.powerups ?? [];
  const bombs: any[] = board.bombs ?? [];
  const explosions: Position[] = board.explosions ?? [];
  const players: any[] = board.players ?? [];

  const myPlayer = session.players.find((p) => p.id === playerId);
  const myPlayerNumber = myPlayer?.playerNumber ?? -1;

  const cols = terrain[0]?.length ?? 0;

  function cellHasExplosion(r: number, c: number) {
    return explosions.some((e) => e.row === r && e.col === c);
  }

  function cellHasBomb(r: number, c: number) {
    return bombs.find((b) => b.position.row === r && b.position.col === c);
  }

  function playerOnCell(r: number, c: number) {
    return players.find((p) => p.alive && p.position.row === r && p.position.col === c);
  }

  function handleCellClick(r: number, c: number) {
    if (!isMyTurn || board.diceRoll === null) return;
    const ap = board.actionPointsRemaining ?? 0;
    const me = players[myPlayerNumber];
    if (!me) return;

    const isAdjacent =
      (Math.abs(r - me.position.row) === 1 && c === me.position.col) ||
      (Math.abs(c - me.position.col) === 1 && r === me.position.row);

    const socket = socketService.getSocket();
    if (!socket) return;

    if (r === me.position.row && c === me.position.col && ap >= 2) {
      socket.emit('game:move', {
        sessionCode: session.sessionCode,
        playerId,
        move: Object.assign({ playerId, pieceIndex: 0, from: 0, to: 0 }, { extra: { type: 'place-bomb', dest: { row: r, col: c } } }),
      });
    } else if (isAdjacent && terrain[r]?.[c] === 'empty' && ap >= 1) {
      socket.emit('game:move', {
        sessionCode: session.sessionCode,
        playerId,
        move: Object.assign({ playerId, pieceIndex: 0, from: 0, to: 0 }, { extra: { type: 'move', dest: { row: r, col: c } } }),
      });
    }
  }

  return (
    <div className="flex flex-col items-center gap-4 w-full px-2">
      <div
        className="relative border-2 border-stone-600 rounded w-full"
        style={{
          display: 'grid',
          gridTemplateColumns: `repeat(${cols}, 1fr)`,
          maxWidth: `${cols * 40}px`,
        }}
      >
        {terrain.map((row, r) =>
          row.map((cell, c) => {
            const bomb = cellHasBomb(r, c);
            const player = playerOnCell(r, c);
            const powerup = terrain[r][c] === 'empty' ? powerups[r]?.[c] : null;
            const exploding = cellHasExplosion(r, c);

            return (
              <div
                key={`${r}-${c}`}
                className={`relative flex items-center justify-center cursor-pointer select-none aspect-square`}
                style={terrainStyle(cell, exploding)}
                onClick={() => handleCellClick(r, c)}
              >
                {powerup && !player && !bomb && (
                  <span className="text-lg opacity-80">{POWERUP_ICON[powerup] ?? '?'}</span>
                )}
                {bomb && (
                  <div className="relative flex items-center justify-center">
                    <span className="text-xl">💣</span>
                    <span className="absolute -top-1 -right-1 text-xs bg-red-700 text-white rounded-full w-4 h-4 flex items-center justify-center font-bold">
                      {Math.max(0, (board.config?.fuseLength ?? 3) - (board.totalMoveCount - bomb.placedOnMove))}
                    </span>
                  </div>
                )}
                {player && (
                  <div
                    className="w-7 h-7 rounded-full border-2 border-white flex items-center justify-center text-xs font-bold text-white"
                    style={{ backgroundColor: PLAYER_COLORS[player.playerNumber] }}
                  >
                    {player.playerNumber + 1}
                  </div>
                )}
                {exploding && (
                  <div className="absolute inset-0 bg-orange-400 opacity-70 rounded" />
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
