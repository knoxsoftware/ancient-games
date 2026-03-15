import { Session, GameState, TournamentMatch, TournamentFormat } from '@ancient-games/shared';

const PLAYER_COLORS = ['#F97316', '#8B5CF6', '#22C55E', '#EC4899'];

interface BombermageEndModalProps {
  session: Session;
  gameState: GameState;
  currentPlayer?: { id: string; displayName: string; playerNumber: number };
  isSpectator: boolean;
  hubSession: Session | null;
  onPlayAgain: () => void;
  onReturnToBracket: () => void;
  onLeave: () => void;
  onDismiss: () => void;
}

function getWinsNeeded(format: TournamentFormat): number {
  switch (format) {
    case 'bo3': return 2;
    case 'bo5': return 3;
    case 'bo7': return 4;
    default: return 1;
  }
}

export default function BombermageEndModal({
  session,
  gameState,
  currentPlayer,
  isSpectator,
  hubSession,
  onPlayAgain,
  onReturnToBracket,
  onLeave,
  onDismiss,
}: BombermageEndModalProps) {
  const board = gameState.board as any;
  const bmPlayers: any[] = board?.players ?? [];

  // Build podium: alive players by score desc, then dead players by deathOrder desc (died later = higher rank)
  const alive = bmPlayers
    .filter((p: any) => p.alive)
    .sort((a: any, b: any) => b.score - a.score);
  const dead = bmPlayers
    .filter((p: any) => !p.alive)
    .sort((a: any, b: any) => (b.deathOrder ?? 0) - (a.deathOrder ?? 0));
  const podium = [...alive, ...dead]; // index 0 = 1st place

  const isTournamentMatch = !!session.tournamentHubCode;
  let seriesText = '';
  let seriesOver = false;
  let tournamentOver = false;
  let currentMatch: TournamentMatch | null = null;

  if (isTournamentMatch && hubSession?.tournamentState) {
    const ts = hubSession.tournamentState;
    tournamentOver = !!ts.winnerId;
    for (const round of ts.rounds) {
      for (const match of round) {
        if (match.currentSessionCode === session.sessionCode) { currentMatch = match; break; }
      }
      if (currentMatch) break;
    }
    if (currentMatch && ts.format !== 'round-robin') {
      const winsNeeded = getWinsNeeded(ts.format);
      seriesText = `Series: ${currentMatch.player1Wins}–${currentMatch.player2Wins}`;
      seriesOver = currentMatch.player1Wins >= winsNeeded || currentMatch.player2Wins >= winsNeeded || currentMatch.status === 'finished';
    } else if (currentMatch) {
      seriesText = `${currentMatch.player1Wins}–${currentMatch.player2Wins}`;
      seriesOver = currentMatch.status === 'finished';
    }
  }

  const renderButtons = () => {
    if (isSpectator) return (
      <button onClick={onLeave} className="btn bg-white/10 hover:bg-white/20 text-white border border-white/20 px-6 py-2">Leave</button>
    );
    if (!isTournamentMatch) return (
      <>
        <button onClick={onPlayAgain} className="btn px-6 py-2 font-bold" style={{ background: '#C4A030', color: '#1A1008' }}>Play Again</button>
        <button onClick={onLeave} className="btn bg-white/10 hover:bg-white/20 text-white border border-white/20 px-6 py-2">Leave</button>
      </>
    );
    if (tournamentOver) return (
      <>
        <button onClick={onReturnToBracket} className="btn px-6 py-2 font-bold" style={{ background: '#C4A030', color: '#1A1008' }}>Return to Bracket</button>
        <button onClick={onLeave} className="btn bg-white/10 hover:bg-white/20 text-white border border-white/20 px-6 py-2">Leave Tournament</button>
      </>
    );
    if (!seriesOver) return (
      <>
        <button onClick={onPlayAgain} className="btn px-6 py-2 font-bold" style={{ background: '#C4A030', color: '#1A1008' }}>Next Game</button>
        <button onClick={onReturnToBracket} className="btn bg-white/10 hover:bg-white/20 text-white border border-white/20 px-6 py-2">Return to Bracket</button>
      </>
    );
    return (
      <>
        <button onClick={onReturnToBracket} className="btn px-6 py-2 font-bold" style={{ background: '#C4A030', color: '#1A1008' }}>Return to Bracket</button>
        <button onClick={onLeave} className="btn bg-white/10 hover:bg-white/20 text-white border border-white/20 px-6 py-2">Leave Tournament</button>
      </>
    );
  };

  const placeLabel = (i: number) => {
    if (i === 0) return '1st 🥇';
    if (i === 1) return '2nd 🥈';
    if (i === 2) return '3rd 🥉';
    return `${i + 1}th`;
  };

  const podiumHeights = ['h-24', 'h-16', 'h-12', 'h-10'];
  const visualOrder =
    podium.length === 2 ? [0, 1] :
    podium.length === 3 ? [1, 0, 2] :
    [1, 0, 2, 3];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.82)' }}>
      <div
        className="relative w-full max-w-md rounded-xl p-6 text-center"
        style={{ background: '#1A1008', border: '1px solid rgba(196,160,48,0.3)' }}
      >
        <button
          onClick={onDismiss}
          aria-label="View board"
          className="absolute top-3 right-3 w-7 h-7 flex items-center justify-center rounded-full text-sm transition-colors"
          style={{ color: '#8A7A60', background: 'rgba(255,255,255,0.05)' }}
          title="View final board"
        >✕</button>

        <div className="text-2xl font-bold mb-1" style={{ color: '#E8C870' }}>Game Over</div>
        {isTournamentMatch && seriesText && (
          <div className="text-sm mb-3 py-1 px-3 rounded-lg inline-block" style={{ background: 'rgba(196,160,48,0.08)', border: '1px solid rgba(196,160,48,0.2)', color: '#C4A030' }}>
            {seriesText}
          </div>
        )}

        {/* Podium */}
        <div className="flex items-end justify-center gap-2 mt-4 mb-6">
          {visualOrder.map((podiumIdx) => {
            const player = podium[podiumIdx];
            if (!player) return null;
            const sessionPlayer = session.players.find(p => p.playerNumber === player.playerNumber);
            const name = sessionPlayer?.displayName ?? `P${player.playerNumber + 1}`;
            const color = PLAYER_COLORS[player.playerNumber] ?? '#888';
            const isDead = !player.alive;
            const isMe = currentPlayer?.playerNumber === player.playerNumber;

            return (
              <div
                key={player.playerNumber}
                className="flex flex-col items-center gap-1"
                style={{ opacity: isDead ? 0.4 : 1 }}
              >
                <div className="text-[10px] font-semibold truncate max-w-[60px]" style={{ color: isMe ? '#E8C870' : '#d4cdb0' }}>
                  {name}
                </div>
                <div className="text-[10px] text-yellow-300">🪙 {player.score ?? 0}</div>
                <div className="w-8 h-8 rounded-full border-2 flex items-center justify-center text-sm font-bold" style={{ backgroundColor: color, borderColor: 'rgba(255,255,255,0.3)', color: '#fff' }}>
                  {player.playerNumber + 1}
                </div>
                <div
                  className={`w-14 ${podiumHeights[podiumIdx] ?? 'h-8'} rounded-t-md flex items-start justify-center pt-1`}
                  style={{ background: podiumIdx === 0 ? '#854d0e' : '#292524', border: '1px solid rgba(255,255,255,0.08)' }}
                >
                  <span className="text-[10px] font-bold" style={{ color: podiumIdx === 0 ? '#fde68a' : '#a8a29e' }}>
                    {placeLabel(podiumIdx)}
                  </span>
                </div>
              </div>
            );
          })}
        </div>

        <div className="flex gap-3 justify-center flex-wrap">{renderButtons()}</div>
      </div>
    </div>
  );
}
