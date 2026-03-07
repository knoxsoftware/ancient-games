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

function calcBlast(terrain: TerrainCell[][], center: Position, radius: number): Position[] {
  const cells: Position[] = [{ ...center }];
  const dirs: [number, number][] = [[-1, 0], [1, 0], [0, -1], [0, 1]];
  for (const [dr, dc] of dirs) {
    for (let i = 1; i <= radius; i++) {
      const r = center.row + dr * i;
      const c = center.col + dc * i;
      if (r < 0 || r >= terrain.length || c < 0 || c >= terrain[0].length) break;
      if (terrain[r][c] === 'indestructible') break;
      cells.push({ row: r, col: c });
      if (terrain[r][c] === 'destructible') break;
    }
  }
  return cells;
}

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
  const coins: boolean[][] = board.coins ?? [];
  const bombs: any[] = board.bombs ?? [];
  const explosions: Position[] = board.explosions ?? [];
  const players: any[] = board.players ?? [];

  const myPlayer = session.players.find((p) => p.id === playerId);
  const myPlayerNumber = myPlayer?.playerNumber ?? -1;

  const cols = terrain[0]?.length ?? 0;

  const fuseLength: number = board.config?.fuseLength ?? 3;
  const blastZoneCells = new Map<string, { inZone: boolean; imminent: boolean }>();
  for (const bomb of bombs) {
    const owner = players[bomb.ownerPlayerNumber];
    const radius: number = owner?.inventory?.blastRadius ?? 1;
    const countdown = fuseLength - (board.totalMoveCount - bomb.placedOnMove);
    const imminent = countdown === 1;
    for (const cell of calcBlast(terrain, bomb.position, radius)) {
      const key = `${cell.row},${cell.col}`;
      const existing = blastZoneCells.get(key);
      blastZoneCells.set(key, { inZone: true, imminent: (existing?.imminent ?? false) || imminent });
    }
  }

  function cellBlastInfo(r: number, c: number) {
    return blastZoneCells.get(`${r},${c}`) ?? { inZone: false, imminent: false };
  }

  function cellHasExplosion(r: number, c: number) {
    return explosions.some((e) => e.row === r && e.col === c);
  }

  function cellHasBomb(r: number, c: number) {
    return bombs.find((b) => b.position.row === r && b.position.col === c);
  }

  function playerOnCell(r: number, c: number) {
    return players.find((p) => p.alive && p.position.row === r && p.position.col === c);
  }

  function emitPlaceBomb() {
    const socket = socketService.getSocket();
    if (!socket) return;
    const me = players[myPlayerNumber];
    if (!me) return;
    socket.emit('game:move', {
      sessionCode: session.sessionCode,
      playerId,
      move: Object.assign({ playerId, pieceIndex: 0, from: 0, to: 0 }, {
        extra: { type: 'place-bomb', dest: { row: me.position.row, col: me.position.col } },
      }),
    });
  }

  function emitMove(dest: Position) {
    const socket = socketService.getSocket();
    if (!socket) return;
    socket.emit('game:move', {
      sessionCode: session.sessionCode,
      playerId,
      move: Object.assign({ playerId, pieceIndex: 0, from: 0, to: 0 }, { extra: { type: 'move', dest } }),
    });
  }

  function handleCellClick(r: number, c: number) {
    if (!isMyTurn || board.diceRoll === null) return;
    const ap = board.actionPointsRemaining ?? 0;
    const me = players[myPlayerNumber];
    if (!me) return;

    const isAdjacent =
      (Math.abs(r - me.position.row) === 1 && c === me.position.col) ||
      (Math.abs(c - me.position.col) === 1 && r === me.position.row);

    const destHasBomb = bombs.some((b: any) => b.position.row === r && b.position.col === c);

    if (r === me.position.row && c === me.position.col) {
      if (ap >= 1 && me.activeBombCount < me.inventory.maxBombs) emitPlaceBomb();
      return;
    }

    if (isAdjacent && terrain[r]?.[c] === 'empty' && !destHasBomb && ap >= 1) {
      emitMove({ row: r, col: c });
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
            const { inZone, imminent } = cellBlastInfo(r, c);

            return (
              <div
                key={`${r}-${c}`}
                className={`relative flex items-center justify-center cursor-pointer select-none aspect-square overflow-hidden`}
                style={{ ...terrainStyle(cell, exploding), touchAction: 'manipulation' }}
                onClick={() => handleCellClick(r, c)}
                onTouchEnd={(e) => { e.preventDefault(); handleCellClick(r, c); }}
              >
                {powerup && !player && !bomb && (
                  <span className="text-lg opacity-80">{POWERUP_ICON[powerup] ?? '?'}</span>
                )}
                {!player && !bomb && terrain[r][c] === 'empty' && coins[r]?.[c] && (
                  <span className="text-base leading-none">🪙</span>
                )}
                {bomb && (
                  <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                    <span className="text-xl">💣</span>
                    <span className="absolute top-0.5 right-0.5 text-xs bg-red-700 text-white rounded-full w-4 h-4 flex items-center justify-center font-bold">
                      {Math.max(0, (board.config?.fuseLength ?? 3) - (board.totalMoveCount - bomb.placedOnMove))}
                    </span>
                  </div>
                )}
                {player && (
                  <div
                    className="w-7 h-7 rounded-full border-2 flex items-center justify-center text-xs font-bold text-white pointer-events-none"
                    style={{ backgroundColor: PLAYER_COLORS[player.playerNumber], borderColor: 'white' }}
                  >
                    {player.playerNumber + 1}
                  </div>
                )}
                {!exploding && inZone && (
                  <div
                    className={`absolute inset-0 rounded pointer-events-none${imminent ? ' animate-pulse' : ''}`}
                    style={{ backgroundColor: 'rgba(251, 146, 60, 0.25)', zIndex: 1 }}
                  />
                )}
                {exploding && (
                  <div className="absolute inset-0 bg-orange-400 opacity-70 rounded pointer-events-none" />
                )}
              </div>
            );
          })
        )}
      </div>

    </div>
  );
}
