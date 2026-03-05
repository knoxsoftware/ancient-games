import { memo, useRef, useState, useEffect, useCallback } from 'react';
import {
  TournamentState,
  TournamentParticipant,
  TournamentMatch,
  GameState,
  GameType,
  Session,
} from '@ancient-games/shared';
import MiniBoard from './MiniBoard';
import { getScoreInfo } from '../../utils/gameScoreInfo';
import { GamePiecePreview } from '../games/GamePiecePreview';

interface Props {
  tournament: TournamentState;
  participants: TournamentParticipant[];
  currentPlayerId: string;
  matchGameStates?: Record<string, GameState>;
  matchPlayers?: Record<string, Array<{ id: string; playerNumber: number }>>;
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

const ROUND_GAP = 56;
const CARD_WIDTH = 230;

function EliminationBracket({
  tournament,
  participants,
  currentPlayerId,
  matchGameStates,
  matchPlayers,
  gameType,
  session,
  onMatchClick,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const cardRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const [connectorPaths, setConnectorPaths] = useState<string[]>([]);
  const [svgDims, setSvgDims] = useState({ w: 0, h: 0 });

  const measure = useCallback(() => {
    const container = containerRef.current;
    if (!container) return;
    const cRect = container.getBoundingClientRect();
    const paths: string[] = [];

    for (let rIdx = 0; rIdx < tournament.rounds.length - 1; rIdx++) {
      const round = tournament.rounds[rIdx];
      const nextRound = tournament.rounds[rIdx + 1];

      for (let mIdx = 0; mIdx < nextRound.length; mIdx++) {
        const src1 = round[mIdx * 2];
        const src2 = round[mIdx * 2 + 1];
        const tgt = nextRound[mIdx];
        if (!src1 || !src2 || !tgt) continue;

        const el1 = cardRefs.current[src1.matchId];
        const el2 = cardRefs.current[src2.matchId];
        const elT = cardRefs.current[tgt.matchId];
        if (!el1 || !el2 || !elT) continue;

        const r1 = el1.getBoundingClientRect();
        const r2 = el2.getBoundingClientRect();
        const rT = elT.getBoundingClientRect();

        const yA = r1.top + r1.height / 2 - cRect.top;
        const yB = r2.top + r2.height / 2 - cRect.top;
        const yT = rT.top + rT.height / 2 - cRect.top;
        const xR = r1.right - cRect.left;
        const xL = rT.left - cRect.left;
        const xM = (xR + xL) / 2;

        // Classic bracket shape: top arm → vertical → bottom arm, then connector to target
        paths.push(`M ${xR} ${yA} H ${xM} V ${yB} H ${xR} M ${xM} ${yT} H ${xL}`);
      }
    }

    setConnectorPaths(paths);
    setSvgDims({ w: container.scrollWidth, h: container.scrollHeight });
  }, [tournament]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const obs = new ResizeObserver(measure);
    obs.observe(container);
    measure();
    return () => obs.disconnect();
  }, [measure]);

  // Re-measure when game states update (affects MiniBoard heights)
  useEffect(() => {
    measure();
  }, [matchGameStates, measure]);

  return (
    <div ref={containerRef} className="overflow-x-auto" style={{ position: 'relative' }}>
      {svgDims.w > 0 && (
        <svg
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: svgDims.w,
            height: svgDims.h,
            pointerEvents: 'none',
            overflow: 'visible',
          }}
        >
          {connectorPaths.map((d, i) => (
            <path
              key={i}
              d={d}
              fill="none"
              stroke="rgba(138,122,96,0.35)"
              strokeWidth={1.5}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          ))}
        </svg>
      )}
      <div
        className="flex pb-4"
        style={{ gap: ROUND_GAP, minWidth: `${tournament.rounds.length * (CARD_WIDTH + ROUND_GAP)}px` }}
      >
        {tournament.rounds.map((round, rIdx) => (
          <div key={rIdx} className="flex flex-col flex-shrink-0" style={{ width: CARD_WIDTH }}>
            {/* Round label */}
            <div
              className="text-xs font-semibold text-center py-1.5 mb-3"
              style={{
                color: '#B09A70',
                borderBottom: '1px solid rgba(138,122,96,0.25)',
                letterSpacing: '0.05em',
                textTransform: 'uppercase',
                fontSize: '10px',
              }}
            >
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
                <div key={match.matchId} ref={(el) => { cardRefs.current[match.matchId] = el; }}>
                  <MatchCard
                    match={match}
                    format={tournament.format}
                    participants={participants}
                    currentPlayerId={currentPlayerId}
                    gameState={matchGameStates?.[match.matchId]}
                    matchPlayerList={matchPlayers?.[match.matchId]}
                    gameType={gameType}
                    session={session}
                    onMatchClick={onMatchClick}
                  />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function PlayerInfoRow({
  playerId: pid,
  name,
  isActive,
  isFinished,
  isWinner,
  seriesWins,
  showSeriesWins,
  scoreInfo,
  session,
  playerNumber,
  gameType,
}: {
  playerId: string | null;
  name: string;
  isActive: boolean;
  isFinished: boolean;
  isWinner: boolean;
  seriesWins: number;
  showSeriesWins: boolean;
  scoreInfo: string | null;
  session?: Session;
  playerNumber?: number;
  gameType?: GameType;
}) {
  const playerStatus = pid ? session?.players.find((p) => p.id === pid)?.status : undefined;
  return (
    <div
      className="rounded p-1.5 border transition-all"
      style={{
        background: isActive ? 'rgba(196,160,48,0.08)' : 'rgba(8,5,0,0.4)',
        borderColor: isActive ? 'rgba(196,160,48,0.4)' : 'rgba(42,30,14,0.6)',
      }}
    >
      <div className="flex items-center gap-1 min-w-0">
        {playerStatus !== undefined && (
          <span
            className="flex-shrink-0 w-1.5 h-1.5 rounded-full"
            style={{ background: playerStatus === 'away' ? '#F59E0B' : '#22C55E' }}
          />
        )}
        {playerNumber !== undefined && gameType !== undefined && (
          <div className="flex-shrink-0">
            <GamePiecePreview gameType={gameType} playerNumber={playerNumber as 0 | 1} size={16} />
          </div>
        )}
        <span
          className="text-xs font-semibold truncate flex-1"
          style={{
            color: isFinished ? (isWinner ? '#E8C870' : '#4A3A28') : '#D4C8A8',
            fontWeight: isWinner ? 600 : 400,
          }}
        >
          {name}
        </span>
        <div className="flex items-center gap-1 flex-shrink-0">
          {isActive && (
            <span
              className="text-xs px-1 py-0.5 rounded font-bold"
              style={{ background: 'rgba(196,160,48,0.25)', color: '#E8C870', fontSize: '9px' }}
            >
              Turn
            </span>
          )}
          {showSeriesWins && (
            <span className="text-xs font-bold" style={{ color: '#8A7A60', fontSize: '10px' }}>
              {seriesWins}W
            </span>
          )}
        </div>
      </div>
      {scoreInfo && (
        <div className="text-xs mt-0.5" style={{ color: '#6A5A40', fontSize: '9px' }}>
          {scoreInfo}
        </div>
      )}
    </div>
  );
}

function MatchCard({
  match,
  format,
  participants,
  currentPlayerId,
  gameState,
  matchPlayerList,
  gameType,
  session,
  onMatchClick,
}: {
  match: TournamentMatch;
  format: string;
  participants: TournamentParticipant[];
  currentPlayerId: string;
  gameState?: GameState;
  matchPlayerList?: Array<{ id: string; playerNumber: number }>;
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
  const showSeriesWins = format !== 'bo1' && format !== 'round-robin';

  // Resolve actual playerNumbers from match session data; fall back to positional 0/1
  const p1SeatIndex = matchPlayerList?.find((p) => p.id === match.player1Id)?.playerNumber ?? 0;
  const p2SeatIndex = matchPlayerList?.find((p) => p.id === match.player2Id)?.playerNumber ?? 1;
  const pieces = gameState?.board.pieces;
  const p1Score = pieces && gameType ? getScoreInfo(gameType, pieces, p1SeatIndex) : null;
  const p2Score = pieces && gameType ? getScoreInfo(gameType, pieces, p2SeatIndex) : null;

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

  const canClick = !!gameState && !!onMatchClick;

  return (
    <div
      className="rounded-lg p-2 text-xs transition-all"
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
        cursor: canClick ? 'pointer' : undefined,
      }}
      onClick={canClick ? () => onMatchClick(match.matchId) : undefined}
    >
      {/* Player info panels */}
      <div className="space-y-1 mb-2">
        <PlayerInfoRow
          playerId={match.player1Id}
          name={p1Name}
          isActive={isActive && gameState?.currentTurn === p1SeatIndex}
          isFinished={isFinished}
          isWinner={match.winnerId === match.player1Id}
          seriesWins={match.player1Wins}
          showSeriesWins={showSeriesWins}
          scoreInfo={p1Score}
          session={session}
          playerNumber={p1SeatIndex}
          gameType={gameType}
        />
        <PlayerInfoRow
          playerId={match.player2Id}
          name={p2Name}
          isActive={isActive && gameState?.currentTurn === p2SeatIndex}
          isFinished={isFinished}
          isWinner={match.winnerId === match.player2Id}
          seriesWins={match.player2Wins}
          showSeriesWins={showSeriesWins}
          scoreInfo={p2Score}
          session={session}
          playerNumber={p2SeatIndex}
          gameType={gameType}
        />
      </div>

      {/* Board area */}
      {gameState && gameType && session ? (
        <MiniBoard
          session={session}
          gameState={gameState}
        />
      ) : (
        <div
          className="w-full rounded"
          style={{
            height: 80,
            background: 'rgba(4,2,0,0.5)',
            border: '1px solid rgba(42,30,14,0.4)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <span style={{ color: '#3A2A1A', fontSize: '9px' }}>
            {match.status === 'pending' ? 'Upcoming' : ''}
          </span>
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
  matchPlayers: _matchPlayers,
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
  matchPlayers,
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
          matchPlayers={matchPlayers}
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
          matchPlayers={matchPlayers}
          gameType={gameType}
          session={session}
          onMatchClick={onMatchClick}
        />
      )}
    </div>
  );
}

export default memo(TournamentBracket);
