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

const CELL_SIZE = 44; // px

const TERRAIN_STYLE: Record<TerrainCell, string> = {
  empty: 'bg-stone-800',
  indestructible: 'bg-stone-600 border border-stone-500',
  destructible: 'bg-amber-800 border border-amber-600',
};

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

  const rows = terrain.length;
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

    if (r === me.position.row && c === me.position.col && ap >= 2) {
      socket.emit('game:move', {
        sessionCode: session.sessionCode,
        playerId,
        move: {
          playerId,
          pieceIndex: 0,
          from: 0,
          to: 0,
          extra: { type: 'place-bomb', dest: { row: r, col: c } },
        },
      });
    } else if (isAdjacent && terrain[r]?.[c] === 'empty' && ap >= 1) {
      socket.emit('game:move', {
        sessionCode: session.sessionCode,
        playerId,
        move: {
          playerId,
          pieceIndex: 0,
          from: 0,
          to: 0,
          extra: { type: 'move', dest: { row: r, col: c } },
        },
      });
    }
  }

  return (
    <div className="flex flex-col items-center gap-4">
      <div
        className="relative border-2 border-stone-600 rounded"
        style={{ display: 'grid', gridTemplateColumns: `repeat(${cols}, ${CELL_SIZE}px)` }}
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
                className={`relative flex items-center justify-center cursor-pointer select-none
                  ${TERRAIN_STYLE[cell]}
                  ${exploding ? 'bg-orange-500' : ''}
                `}
                style={{ width: CELL_SIZE, height: CELL_SIZE }}
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
