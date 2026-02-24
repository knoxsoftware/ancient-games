import { Session, GameState, TournamentMatch, TournamentFormat } from '@ancient-games/shared';

interface GameEndModalProps {
  session: Session;
  gameState: GameState;
  currentPlayer?: { id: string; displayName: string; playerNumber: number };
  isSpectator: boolean;
  hubSession: Session | null;
  onPlayAgain: () => void;
  onReturnToBracket: () => void;
  onLeave: () => void;
}

function getWinsNeeded(format: TournamentFormat): number {
  switch (format) {
    case 'bo1':
      return 1;
    case 'bo3':
      return 2;
    case 'bo5':
      return 3;
    case 'bo7':
      return 4;
    default:
      return 1;
  }
}

function formatSeriesLabel(format: TournamentFormat): string {
  switch (format) {
    case 'bo1':
      return 'Best of 1';
    case 'bo3':
      return 'Best of 3';
    case 'bo5':
      return 'Best of 5';
    case 'bo7':
      return 'Best of 7';
    case 'round-robin':
      return 'Round Robin';
    default:
      return '';
  }
}

export default function GameEndModal({
  session,
  gameState,
  currentPlayer,
  isSpectator,
  hubSession,
  onPlayAgain,
  onReturnToBracket,
  onLeave,
}: GameEndModalProps) {
  const winner = gameState.winner;
  if (winner === null) return null;

  const winnerPlayer = session.players[winner];
  const isWinner = !isSpectator && currentPlayer?.playerNumber === winner;
  const isTournamentMatch = !!session.tournamentHubCode;

  // Determine title text
  let title: string;
  if (isSpectator) {
    title = `${winnerPlayer?.displayName ?? 'Unknown'} wins!`;
  } else if (isWinner) {
    title = 'You Win!';
  } else {
    title = 'You Lose';
  }

  // Tournament info
  let currentMatch: TournamentMatch | null = null;
  let seriesText = '';
  let seriesOver = false;
  let tournamentOver = false;

  if (isTournamentMatch && hubSession?.tournamentState) {
    const ts = hubSession.tournamentState;
    tournamentOver = !!ts.winnerId;

    // Find current match
    for (const round of ts.rounds) {
      for (const match of round) {
        if (match.currentSessionCode === session.sessionCode) {
          currentMatch = match;
          break;
        }
      }
      if (currentMatch) break;
    }

    if (currentMatch && ts.format !== 'round-robin') {
      const winsNeeded = getWinsNeeded(ts.format);
      seriesText = `Series: ${currentMatch.player1Wins}–${currentMatch.player2Wins} (${formatSeriesLabel(ts.format)})`;
      seriesOver =
        currentMatch.player1Wins >= winsNeeded ||
        currentMatch.player2Wins >= winsNeeded ||
        currentMatch.status === 'finished';
    } else if (currentMatch) {
      seriesText = `${currentMatch.player1Wins}–${currentMatch.player2Wins}`;
      seriesOver = currentMatch.status === 'finished';
    }
  }

  // Determine buttons
  const renderButtons = () => {
    if (isSpectator) {
      return (
        <button
          onClick={onLeave}
          className="btn bg-white/10 hover:bg-white/20 text-white border border-white/20 px-6 py-2"
        >
          Leave
        </button>
      );
    }

    if (!isTournamentMatch) {
      return (
        <>
          <button
            onClick={onPlayAgain}
            className="btn px-6 py-2 font-bold"
            style={{ background: '#C4A030', color: '#1A1008' }}
          >
            Play Again
          </button>
          <button
            onClick={onLeave}
            className="btn bg-white/10 hover:bg-white/20 text-white border border-white/20 px-6 py-2"
          >
            Leave
          </button>
        </>
      );
    }

    // Tournament match
    if (tournamentOver) {
      return (
        <>
          <button
            onClick={onReturnToBracket}
            className="btn px-6 py-2 font-bold"
            style={{ background: '#C4A030', color: '#1A1008' }}
          >
            Return to Bracket
          </button>
          <button
            onClick={onLeave}
            className="btn bg-white/10 hover:bg-white/20 text-white border border-white/20 px-6 py-2"
          >
            Leave Tournament
          </button>
        </>
      );
    }

    if (!seriesOver) {
      // Series continues — next game
      return (
        <>
          <button
            onClick={onPlayAgain}
            className="btn px-6 py-2 font-bold"
            style={{ background: '#C4A030', color: '#1A1008' }}
          >
            Next Game
          </button>
          <button
            onClick={onReturnToBracket}
            className="btn bg-white/10 hover:bg-white/20 text-white border border-white/20 px-6 py-2"
          >
            Return to Bracket
          </button>
        </>
      );
    }

    // Series over, tournament continues
    return (
      <>
        <button
          onClick={onReturnToBracket}
          className="btn px-6 py-2 font-bold"
          style={{ background: '#C4A030', color: '#1A1008' }}
        >
          Return to Bracket
        </button>
        <button
          onClick={onLeave}
          className="btn bg-white/10 hover:bg-white/20 text-white border border-white/20 px-6 py-2"
        >
          Leave Tournament
        </button>
      </>
    );
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.75)' }}
    >
      {/* Sparkle layer for winner */}
      {isWinner && <div className="sparkle-container" />}

      {/* Modal card */}
      <div
        className="relative w-full max-w-sm rounded-xl p-6 text-center"
        style={{ background: '#1A1008', border: '1px solid rgba(196,160,48,0.3)' }}
      >
        <div
          className="text-3xl font-bold mb-2"
          style={{ color: isWinner ? '#E8C870' : '#E8D8B0' }}
        >
          {title}
        </div>
        <div className="text-sm mb-4" style={{ color: '#8A7A60' }}>
          {winnerPlayer?.displayName} is the winner!
        </div>

        {isTournamentMatch && seriesText && (
          <div
            className="text-sm mb-4 py-2 px-3 rounded-lg inline-block"
            style={{
              background: 'rgba(196,160,48,0.08)',
              border: '1px solid rgba(196,160,48,0.2)',
              color: '#C4A030',
            }}
          >
            {seriesText}
          </div>
        )}

        <div className="flex gap-3 justify-center flex-wrap">{renderButtons()}</div>
      </div>
    </div>
  );
}
