import { memo } from 'react';
import {
  TournamentState,
  TournamentParticipant,
  TournamentMatch,
  GameState,
  GameType,
  Session,
} from '@ancient-games/shared';
import MiniBoard from './MiniBoard';

interface Props {
  tournament: TournamentState;
  participants: TournamentParticipant[];
  currentPlayerId: string;
  matchGameStates?: Record<string, GameState>;
  gameType?: GameType;
  session?: Session;
  onMatchClick?: (matchId: string) => void;
}

function participantName(participants: TournamentParticipant[], id: string | null): string {
  if (!id) return 'TBD';
  return participants.find((p) => p.id === id)?.displayName ?? 'Unknown';
}

function getRoundName(format: string, roundIndex: number, totalRounds: number): string {
  if (format === 'round-robin') return `Round ${roundIndex + 1}`;
  const remaining = totalRounds - roundIndex;
  if (remaining === 1) return 'Final';
  if (remaining === 2) return 'Semi-finals';
  if (remaining === 3) return 'Quarter-finals';
  return `Round of ${Math.pow(2, remaining)}`;
}

function EliminationBracket({
  tournament,
  participants,
  currentPlayerId,
  matchGameStates,
  gameType,
  session,
  onMatchClick,
}: Props) {
  return (
    <div className="overflow-x-auto">
      <div className="flex gap-6 pb-4" style={{ minWidth: `${tournament.rounds.length * 200}px` }}>
        {tournament.rounds.map((round, rIdx) => (
          <div key={rIdx} className="flex flex-col gap-3 flex-shrink-0" style={{ width: 180 }}>
            <div className="text-xs font-semibold text-center mb-1" style={{ color: '#8A7A60' }}>
              {getRoundName(tournament.format, rIdx, tournament.rounds.length)}
            </div>

            {/* Vertically space matches to align with bracket */}
            <div
              className="flex flex-col"
              style={{
                gap: rIdx === 0 ? '8px' : `${Math.pow(2, rIdx) * 28 + 8}px`,
                paddingTop: rIdx === 0 ? 0 : `${(Math.pow(2, rIdx) - 1) * 18}px`,
              }}
            >
              {round.map((match) => (
                <MatchCard
                  key={match.matchId}
                  match={match}
                  format={tournament.format}
                  participants={participants}
                  currentPlayerId={currentPlayerId}
                  gameState={matchGameStates?.[match.matchId]}
                  gameType={gameType}
                  session={session}
                  onMatchClick={onMatchClick}
                />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function MatchCard({
  match,
  format,
  participants,
  currentPlayerId,
  gameState,
  gameType,
  session,
  onMatchClick,
}: {
  match: TournamentMatch;
  format: string;
  participants: TournamentParticipant[];
  currentPlayerId: string;
  gameState?: GameState;
  gameType?: GameType;
  session?: Session;
  onMatchClick?: (matchId: string) => void;
}) {
  const p1Name = participantName(participants, match.player1Id);
  const p2Name = participantName(participants, match.player2Id);
  const isMyMatch = match.player1Id === currentPlayerId || match.player2Id === currentPlayerId;
  const isBye = match.status === 'bye';
  const isActive = match.status === 'in_progress';
  const isFinished = match.status === 'finished';

  if (isBye) {
    return (
      <div
        className="rounded-lg p-2.5 text-xs"
        style={{
          background: 'rgba(8,5,0,0.3)',
          border: '1px solid rgba(42,30,14,0.5)',
          opacity: 0.5,
        }}
      >
        <div style={{ color: '#5A4A38' }}>Bye</div>
        <div style={{ color: '#8A7A60' }}>{participantName(participants, match.winnerId)}</div>
      </div>
    );
  }

  return (
    <div
      className="rounded-lg p-2.5 text-xs transition-all"
      style={{
        background:
          isMyMatch && isActive
            ? 'rgba(196,160,48,0.10)'
            : isActive
              ? 'rgba(20,40,20,0.4)'
              : 'rgba(8,5,0,0.5)',
        border: isActive
          ? `1px solid ${isMyMatch ? 'rgba(196,160,48,0.5)' : 'rgba(60,120,60,0.5)'}`
          : '1px solid rgba(42,30,14,0.8)',
      }}
    >
      {/* Player 1 */}
      <div
        className="flex items-center justify-between mb-1"
        style={{
          color:
            isFinished && match.winnerId === match.player1Id
              ? '#E8C870'
              : isFinished && match.winnerId !== match.player1Id
                ? '#4A3A28'
                : '#D4C8A8',
          fontWeight: isFinished && match.winnerId === match.player1Id ? 600 : 400,
        }}
      >
        <span className="truncate max-w-[100px]">{p1Name}</span>
        {format !== 'bo1' && format !== 'round-robin' && (
          <span style={{ color: '#8A7A60', marginLeft: 4 }}>{match.player1Wins}</span>
        )}
      </div>

      {/* Divider */}
      <div style={{ borderTop: '1px solid rgba(42,30,14,0.6)', margin: '3px 0' }} />

      {/* Player 2 */}
      <div
        className="flex items-center justify-between"
        style={{
          color:
            isFinished && match.winnerId === match.player2Id
              ? '#E8C870'
              : isFinished && match.winnerId !== match.player2Id
                ? '#4A3A28'
                : '#D4C8A8',
          fontWeight: isFinished && match.winnerId === match.player2Id ? 600 : 400,
        }}
      >
        <span className="truncate max-w-[100px]">{p2Name}</span>
        {format !== 'bo1' && format !== 'round-robin' && (
          <span style={{ color: '#8A7A60', marginLeft: 4 }}>{match.player2Wins}</span>
        )}
      </div>

      {/* Mini board for active matches (desktop) */}
      {isActive && gameState && gameType && session && (
        <div className="mt-2 hidden md:block">
          <MiniBoard
            session={session}
            gameState={gameState}
            onClick={() => onMatchClick?.(match.matchId)}
          />
        </div>
      )}
      {/* Live badge for active matches (mobile) */}
      {isActive && gameState && (
        <div className="mt-2 block md:hidden">
          <div
            className="text-xs text-center py-2 px-3 rounded cursor-pointer"
            style={{ background: 'rgba(60,120,60,0.3)', color: '#90D090' }}
            onClick={() => onMatchClick?.(match.matchId)}
          >
            ● Live — Tap to watch
          </div>
        </div>
      )}

    </div>
  );
}

function RoundRobinView({
  tournament,
  participants,
  currentPlayerId,
  matchGameStates,
  onMatchClick,
}: Props) {
  const standings = tournament.standings ?? [];
  const sorted = [...standings].sort((a, b) => b.wins - a.wins || a.losses - b.losses);

  return (
    <div className="space-y-4">
      {/* Standings table */}
      <div
        className="rounded-xl border overflow-hidden"
        style={{ background: 'rgba(8,5,0,0.5)', borderColor: 'rgba(42,30,14,0.8)' }}
      >
        <div
          className="px-4 py-2 text-xs font-semibold"
          style={{
            background: 'rgba(42,30,14,0.6)',
            color: '#8A7A60',
            borderBottom: '1px solid rgba(42,30,14,0.8)',
          }}
        >
          Standings
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr style={{ borderBottom: '1px solid rgba(42,30,14,0.5)' }}>
              <th className="text-left px-4 py-2 text-xs font-medium" style={{ color: '#6A5A40' }}>
                #
              </th>
              <th className="text-left px-4 py-2 text-xs font-medium" style={{ color: '#6A5A40' }}>
                Player
              </th>
              <th
                className="text-center px-3 py-2 text-xs font-medium"
                style={{ color: '#6A5A40' }}
              >
                W
              </th>
              <th
                className="text-center px-3 py-2 text-xs font-medium"
                style={{ color: '#6A5A40' }}
              >
                L
              </th>
              <th
                className="text-center px-3 py-2 text-xs font-medium"
                style={{ color: '#6A5A40' }}
              >
                P
              </th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((standing, i) => {
              const participant = participants.find((p) => p.id === standing.playerId);
              const isMe = standing.playerId === currentPlayerId;
              return (
                <tr
                  key={standing.playerId}
                  style={{
                    borderBottom:
                      i < sorted.length - 1 ? '1px solid rgba(42,30,14,0.3)' : undefined,
                    background: isMe ? 'rgba(196,160,48,0.05)' : undefined,
                  }}
                >
                  <td className="px-4 py-2 text-xs" style={{ color: '#5A4A38' }}>
                    {i + 1}
                  </td>
                  <td className="px-4 py-2">
                    <span style={{ color: isMe ? '#E8C870' : '#D4C8A8' }}>
                      {participant?.displayName ?? 'Unknown'}
                    </span>
                    {isMe && (
                      <span className="ml-2 text-xs" style={{ color: '#6A5A40' }}>
                        you
                      </span>
                    )}
                    {tournament.winnerId === standing.playerId && (
                      <span className="ml-2 text-xs" style={{ color: '#E8C870' }}>
                        ★ Winner
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-center" style={{ color: '#90B890' }}>
                    {standing.wins}
                  </td>
                  <td className="px-3 py-2 text-center" style={{ color: '#B88888' }}>
                    {standing.losses}
                  </td>
                  <td className="px-3 py-2 text-center text-xs" style={{ color: '#6A5A40' }}>
                    {standing.matchesPlayed}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Round schedule */}
      <div className="space-y-3">
        {tournament.rounds.map((round, rIdx) => {
          const isCurrentRound = rIdx === tournament.currentRound;
          const allDone = round.every((m) => m.status === 'finished' || m.status === 'bye');
          return (
            <div
              key={rIdx}
              className="rounded-xl border"
              style={{
                background: 'rgba(8,5,0,0.5)',
                borderColor: isCurrentRound ? 'rgba(196,160,48,0.3)' : 'rgba(42,30,14,0.6)',
              }}
            >
              <div
                className="px-4 py-2 text-xs font-semibold flex items-center gap-2"
                style={{
                  background: isCurrentRound ? 'rgba(196,160,48,0.08)' : 'rgba(42,30,14,0.4)',
                  color: isCurrentRound ? '#E8C870' : '#6A5A40',
                  borderBottom: '1px solid rgba(42,30,14,0.6)',
                  borderRadius: '12px 12px 0 0',
                }}
              >
                Round {rIdx + 1}
                {isCurrentRound && !allDone && (
                  <span
                    className="px-1.5 py-0.5 rounded text-xs"
                    style={{ background: 'rgba(60,120,60,0.3)', color: '#90D090' }}
                  >
                    Active
                  </span>
                )}
                {allDone && (
                  <span className="text-xs" style={{ color: '#4A5A4A' }}>
                    Complete
                  </span>
                )}
              </div>
              <div className="p-3 space-y-2">
                {round.map((match) => {
                  const p1Name = participantName(participants, match.player1Id);
                  const p2Name = participantName(participants, match.player2Id);
                  const isMyMatch =
                    match.player1Id === currentPlayerId || match.player2Id === currentPlayerId;
                  return (
                    <div
                      key={match.matchId}
                      className="flex items-center justify-between rounded-lg px-3 py-2 text-sm"
                      style={{
                        background: isMyMatch ? 'rgba(196,160,48,0.07)' : 'rgba(20,12,0,0.4)',
                        border: `1px solid ${isMyMatch ? 'rgba(196,160,48,0.2)' : 'rgba(42,30,14,0.6)'}`,
                      }}
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <span
                          style={{
                            color: match.winnerId === match.player1Id ? '#E8C870' : '#D4C8A8',
                            fontWeight: match.winnerId === match.player1Id ? 600 : 400,
                          }}
                          className="truncate"
                        >
                          {p1Name}
                        </span>
                        <span style={{ color: '#4A3A28' }}>vs</span>
                        <span
                          style={{
                            color: match.winnerId === match.player2Id ? '#E8C870' : '#D4C8A8',
                            fontWeight: match.winnerId === match.player2Id ? 600 : 400,
                          }}
                          className="truncate"
                        >
                          {p2Name}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0 ml-2">
                        {match.status === 'finished' && (
                          <span className="text-xs" style={{ color: '#4A5A4A' }}>
                            Done
                          </span>
                        )}
                        {match.status === 'in_progress' && (
                          <span
                            className="text-xs px-1.5 py-0.5 rounded cursor-pointer"
                            style={{ background: 'rgba(60,120,60,0.25)', color: '#80C080' }}
                            onClick={() =>
                              matchGameStates?.[match.matchId] && onMatchClick?.(match.matchId)
                            }
                          >
                            Live
                          </span>
                        )}
                        {match.status === 'pending' && (
                          <span className="text-xs" style={{ color: '#3A2A1A' }}>
                            Upcoming
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function TournamentBracket({
  tournament,
  participants,
  currentPlayerId,
  matchGameStates,
  gameType,
  session,
  onMatchClick,
}: Props) {
  const isRoundRobin = tournament.format === 'round-robin';

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div
          className="text-xs px-2.5 py-1 rounded-full font-semibold"
          style={{
            background: 'rgba(196,160,48,0.15)',
            color: '#E8C870',
            border: '1px solid rgba(196,160,48,0.3)',
          }}
        >
          {isRoundRobin
            ? 'Round Robin'
            : tournament.format === 'bo1'
              ? 'Best of 1'
              : tournament.format === 'bo3'
                ? 'Best of 3'
                : tournament.format === 'bo5'
                  ? 'Best of 5'
                  : 'Best of 7'}
        </div>
        <div className="text-sm" style={{ color: '#6A5A40' }}>
          {participants.length} players
        </div>
        {tournament.winnerId && (
          <div className="text-sm font-semibold" style={{ color: '#E8C870' }}>
            Winner:{' '}
            {participants.find((p) => p.id === tournament.winnerId)?.displayName ?? 'Unknown'}
          </div>
        )}
      </div>

      {isRoundRobin ? (
        <RoundRobinView
          tournament={tournament}
          participants={participants}
          currentPlayerId={currentPlayerId}
          matchGameStates={matchGameStates}
          gameType={gameType}
          session={session}
          onMatchClick={onMatchClick}
        />
      ) : (
        <EliminationBracket
          tournament={tournament}
          participants={participants}
          currentPlayerId={currentPlayerId}
          matchGameStates={matchGameStates}
          gameType={gameType}
          session={session}
          onMatchClick={onMatchClick}
        />
      )}
    </div>
  );
}

export default memo(TournamentBracket);
