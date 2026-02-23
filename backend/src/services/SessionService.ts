import { customAlphabet } from 'nanoid';
import { SessionModel } from '../models/Session';
import { GameRegistry } from '../games/GameRegistry';
import {
  Session,
  GameType,
  Player,
  Spectator,
  CreateSessionRequest,
  JoinSessionRequest,
  ChatMessage,
  TournamentFormat,
  TournamentMatch,
  TournamentParticipant,
  TournamentState,
  TournamentStanding,
} from '@ancient-games/shared';

const nanoid = customAlphabet('ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789', 6);
const matchNanoid = customAlphabet('abcdefghijklmnopqrstuvwxyz0123456789', 10);

function nextPowerOf2(n: number): number {
  let p = 1;
  while (p < n) p *= 2;
  return p;
}

function getSeriesThreshold(format: TournamentFormat): number {
  if (format === 'bo3') return 2;
  if (format === 'bo5') return 3;
  if (format === 'bo7') return 4;
  return 1; // bo1 or round-robin (always single game per pairing)
}

function generateBracket(participants: TournamentParticipant[]): TournamentMatch[][] {
  const n = participants.length;
  const slots = nextPowerOf2(n);
  const rounds: TournamentMatch[][] = [];

  // Round 0: pair highest vs lowest seed
  const round0: TournamentMatch[] = [];
  for (let i = 0; i < slots / 2; i++) {
    const p1 = participants[i] ?? null;
    const p2 = participants[slots - 1 - i] ?? null;
    const isBye = (p1 !== null) !== (p2 !== null);
    const winnerId = isBye ? (p1?.id ?? p2?.id ?? null) : null;
    round0.push({
      matchId: matchNanoid(),
      roundIndex: 0,
      matchIndex: i,
      player1Id: p1?.id ?? null,
      player2Id: p2?.id ?? null,
      player1Wins: 0,
      player2Wins: 0,
      winnerId,
      currentSessionCode: null,
      status: isBye ? 'bye' : 'pending',
    });
  }
  rounds.push(round0);

  // Subsequent rounds (all TBD)
  let roundSize = slots / 4;
  let roundIdx = 1;
  while (roundSize >= 1) {
    const round: TournamentMatch[] = [];
    for (let i = 0; i < roundSize; i++) {
      round.push({
        matchId: matchNanoid(),
        roundIndex: roundIdx,
        matchIndex: i,
        player1Id: null,
        player2Id: null,
        player1Wins: 0,
        player2Wins: 0,
        winnerId: null,
        currentSessionCode: null,
        status: 'pending',
      });
    }
    rounds.push(round);
    roundSize = Math.floor(roundSize / 2);
    roundIdx++;
  }

  // Advance byes from round 0 into round 1
  if (rounds.length > 1) {
    for (const match of round0) {
      if (match.status === 'bye' && match.winnerId) {
        const nextMatch = rounds[1][Math.floor(match.matchIndex / 2)];
        if (nextMatch) {
          if (match.matchIndex % 2 === 0) {
            nextMatch.player1Id = match.winnerId;
          } else {
            nextMatch.player2Id = match.winnerId;
          }
        }
      }
    }
  }

  return rounds;
}

function generateRoundRobinSchedule(
  participants: TournamentParticipant[]
): { rounds: TournamentMatch[][]; standings: TournamentStanding[] } {
  const players = [...participants];
  // Make even by adding bye placeholder
  if (players.length % 2 !== 0) {
    players.push({ id: '__bye__', displayName: 'Bye', seed: players.length, eliminated: false });
  }

  const N = players.length; // always even
  const numRounds = N - 1;
  const fixed = players[0];
  const rotating = players.slice(1); // N-1 elements

  const rounds: TournamentMatch[][] = [];

  for (let round = 0; round < numRounds; round++) {
    const roundMatches: TournamentMatch[] = [];

    // Match 0: fixed player vs last in rotating
    const pb0 = rotating[N - 2];
    if (fixed.id !== '__bye__' && pb0.id !== '__bye__') {
      roundMatches.push({
        matchId: matchNanoid(),
        roundIndex: round,
        matchIndex: roundMatches.length,
        player1Id: fixed.id,
        player2Id: pb0.id,
        player1Wins: 0,
        player2Wins: 0,
        winnerId: null,
        currentSessionCode: null,
        status: 'pending',
      });
    }

    // Remaining pairs: rotating[k-1] vs rotating[N-2-k] for k=1..N/2-1
    for (let k = 1; k < N / 2; k++) {
      const pa = rotating[k - 1];
      const pb = rotating[N - 2 - k];
      if (pa.id !== '__bye__' && pb.id !== '__bye__') {
        roundMatches.push({
          matchId: matchNanoid(),
          roundIndex: round,
          matchIndex: roundMatches.length,
          player1Id: pa.id,
          player2Id: pb.id,
          player1Wins: 0,
          player2Wins: 0,
          winnerId: null,
          currentSessionCode: null,
          status: 'pending',
        });
      }
    }

    rounds.push(roundMatches);

    // Rotate: move last element to front
    rotating.unshift(rotating.pop()!);
  }

  const standings: TournamentStanding[] = participants.map((p) => ({
    playerId: p.id,
    wins: 0,
    losses: 0,
    matchesPlayed: 0,
  }));

  return { rounds, standings };
}

export interface TournamentGameEndedResult {
  hubSession: Session;
  seriesContinued: boolean;
  seriesNextSessionCode?: string;
  matchFinished: boolean;
  nextRoundMatches: Array<{ sessionCode: string; player1Id: string; player2Id: string }>;
  eliminatedPlayerId?: string;
  tournamentFinished: boolean;
  roundAdvanced: boolean;
}

export class SessionService {
  async createSession(
    request: CreateSessionRequest,
    socketId: string
  ): Promise<{ session: Session; playerId: string }> {
    const sessionCode = nanoid();
    const playerId = this.generatePlayerId();

    const gameEngine = GameRegistry.getGame(request.gameType);
    const initialBoard = gameEngine.initializeBoard();

    const player: Player = {
      id: playerId,
      displayName: request.displayName,
      socketId,
      ready: false,
      playerNumber: 0,
    };

    const session = await SessionModel.create({
      sessionCode,
      gameType: request.gameType,
      status: 'lobby',
      players: [player],
      gameState: {
        board: initialBoard,
        currentTurn: 0,
        winner: null,
        started: false,
        finished: false,
      },
      hostId: playerId,
      createdAt: new Date(),
      lastActivity: new Date(),
    });

    return {
      session: this.toSession(session),
      playerId,
    };
  }

  async joinSession(
    request: JoinSessionRequest,
    socketId: string
  ): Promise<{ session: Session; playerId: string }> {
    const session = await SessionModel.findOne({ sessionCode: request.sessionCode });

    if (!session) {
      throw new Error('Session not found');
    }

    if (session.status !== 'lobby') {
      throw new Error('Session has already started');
    }

    // Allow up to 8 players for tournament lobbies
    if (session.players.length >= 8) {
      throw new Error('Session is full');
    }

    const playerId = this.generatePlayerId();
    const player: Player = {
      id: playerId,
      displayName: request.displayName,
      socketId,
      ready: false,
      playerNumber: session.players.length,
    };

    session.players.push(player);
    session.lastActivity = new Date();
    await session.save();

    return {
      session: this.toSession(session),
      playerId,
    };
  }

  async getSession(sessionCode: string): Promise<Session | null> {
    const session = await SessionModel.findOne({ sessionCode });
    return session ? this.toSession(session) : null;
  }

  async updatePlayerSocketId(
    sessionCode: string,
    playerId: string,
    socketId: string
  ): Promise<void> {
    const playerResult = await SessionModel.updateOne(
      { sessionCode, 'players.id': playerId },
      { $set: { 'players.$.socketId': socketId, lastActivity: new Date() } }
    );
    if (playerResult.matchedCount === 0) {
      await SessionModel.updateOne(
        { sessionCode, 'spectators.id': playerId },
        { $set: { 'spectators.$.socketId': socketId, lastActivity: new Date() } }
      );
    }
  }

  async updatePlayerReady(
    sessionCode: string,
    playerId: string,
    ready: boolean
  ): Promise<Session | null> {
    const session = await SessionModel.findOne({ sessionCode });
    if (!session) return null;

    const player = session.players.find((p) => p.id === playerId);
    if (player) {
      player.ready = ready;
      session.lastActivity = new Date();
      await session.save();
    }

    return this.toSession(session);
  }

  async addSpectator(
    sessionCode: string,
    displayName: string,
    socketId: string
  ): Promise<{ session: Session; spectatorId: string }> {
    const session = await SessionModel.findOne({ sessionCode });
    if (!session) throw new Error('Session not found');

    const spectatorId = this.generatePlayerId();
    const spectator: Spectator = { id: spectatorId, displayName, socketId };
    session.spectators.push(spectator);
    session.lastActivity = new Date();
    await session.save();

    return { session: this.toSession(session), spectatorId };
  }

  async removeSpectator(sessionCode: string, spectatorId: string): Promise<Session | null> {
    const session = await SessionModel.findOne({ sessionCode });
    if (!session) return null;

    session.spectators = session.spectators.filter((s) => s.id !== spectatorId);

    if (session.players.length === 0 && session.spectators.length === 0) {
      await SessionModel.deleteOne({ sessionCode });
      return null;
    }

    session.lastActivity = new Date();
    await session.save();
    return this.toSession(session);
  }

  async playerToSpectator(sessionCode: string, playerId: string): Promise<Session | null> {
    const session = await SessionModel.findOne({ sessionCode });
    if (!session) return null;

    const playerIndex = session.players.findIndex((p) => p.id === playerId);
    if (playerIndex === -1) return this.toSession(session);

    const player = session.players[playerIndex];
    session.players.splice(playerIndex, 1);

    const spectator: Spectator = {
      id: player.id,
      displayName: player.displayName,
      socketId: player.socketId,
    };
    session.spectators.push(spectator);

    if (session.hostId === playerId && session.players.length > 0) {
      session.hostId = session.players[0].id;
    }

    session.lastActivity = new Date();
    await session.save();
    return this.toSession(session);
  }

  async spectatorToPlayer(sessionCode: string, spectatorId: string): Promise<Session | null> {
    const session = await SessionModel.findOne({ sessionCode });
    if (!session) return null;

    const spectatorIndex = session.spectators.findIndex((s) => s.id === spectatorId);
    if (spectatorIndex === -1) throw new Error('Spectator not found');

    const takenNumbers = new Set(session.players.map((p) => p.playerNumber));
    let playerNumber: number | null = null;
    for (const n of [0, 1]) {
      if (!takenNumbers.has(n)) {
        playerNumber = n;
        break;
      }
    }
    if (playerNumber === null) throw new Error('No seats available');

    const spectator = session.spectators[spectatorIndex];
    session.spectators.splice(spectatorIndex, 1);

    const player: Player = {
      id: spectator.id,
      displayName: spectator.displayName,
      socketId: spectator.socketId,
      ready: false,
      playerNumber,
    };
    session.players.push(player);

    session.lastActivity = new Date();
    await session.save();
    return this.toSession(session);
  }

  async removePlayer(sessionCode: string, playerId: string): Promise<Session | null> {
    const session = await SessionModel.findOne({ sessionCode });
    if (!session) return null;

    session.players = session.players.filter((p) => p.id !== playerId);

    if (session.players.length === 0) {
      await SessionModel.deleteOne({ sessionCode });
      return null;
    }

    if (session.hostId === playerId && session.players.length > 0) {
      session.hostId = session.players[0].id;
    }

    session.lastActivity = new Date();
    await session.save();

    return this.toSession(session);
  }

  async startGame(sessionCode: string, playerId: string): Promise<Session | null> {
    const session = await SessionModel.findOne({ sessionCode });
    if (!session) return null;

    if (session.hostId !== playerId) {
      throw new Error('Only the host can start the game');
    }

    const gameEngine = GameRegistry.getGame(session.gameType);
    if (session.players.length !== gameEngine.playerCount) {
      throw new Error(`Need exactly ${gameEngine.playerCount} players to start`);
    }

    session.status = 'playing';
    session.gameState.started = true;
    session.lastActivity = new Date();
    await session.save();

    return this.toSession(session);
  }

  async restartGame(sessionCode: string): Promise<Session | null> {
    const session = await SessionModel.findOne({ sessionCode });
    if (!session) return null;

    if (session.status !== 'finished') {
      throw new Error('Game is not finished');
    }

    const gameEngine = GameRegistry.getGame(session.gameType);
    const initialBoard = gameEngine.initializeBoard();

    session.status = 'playing';
    session.gameState = {
      board: initialBoard,
      currentTurn: 0,
      winner: null,
      started: true,
      finished: false,
    };
    session.lastActivity = new Date();
    await session.save();

    return this.toSession(session);
  }

  async updateGameState(sessionCode: string, gameState: any): Promise<Session | null> {
    const session = await SessionModel.findOne({ sessionCode });
    if (!session) return null;

    session.gameState = gameState;
    session.lastActivity = new Date();

    if (gameState.winner !== null) {
      session.status = 'finished';
      session.gameState.finished = true;
    }

    await session.save();
    return this.toSession(session);
  }

  async addChatMessage(sessionCode: string, message: ChatMessage): Promise<void> {
    await SessionModel.updateOne(
      { sessionCode },
      {
        $push: { chatHistory: { $each: [message], $slice: -100 } },
        $set: { lastActivity: new Date() },
      }
    );
  }

  // ─── Tournament ───────────────────────────────────────────────────────────

  async createMatchSession(
    hubCode: string,
    matchId: string,
    player1: { id: string; displayName: string },
    player2: { id: string; displayName: string },
    gameType: GameType
  ): Promise<Session> {
    const sessionCode = nanoid();
    const gameEngine = GameRegistry.getGame(gameType);
    const initialBoard = gameEngine.initializeBoard();

    // Randomly assign who goes first
    const p1GoesFirst = Math.random() < 0.5;
    const p1: Player = {
      id: player1.id,
      displayName: player1.displayName,
      socketId: 'temp',
      ready: true,
      playerNumber: p1GoesFirst ? 0 : 1,
    };
    const p2: Player = {
      id: player2.id,
      displayName: player2.displayName,
      socketId: 'temp',
      ready: true,
      playerNumber: p1GoesFirst ? 1 : 0,
    };

    const session = await SessionModel.create({
      sessionCode,
      gameType,
      status: 'playing',
      players: [p1, p2],
      gameState: {
        board: initialBoard,
        currentTurn: 0,
        winner: null,
        started: true,
        finished: false,
      },
      hostId: player1.id,
      createdAt: new Date(),
      lastActivity: new Date(),
      tournamentHubCode: hubCode,
      tournamentMatchId: matchId,
    });

    return this.toSession(session);
  }

  async startTournament(
    sessionCode: string,
    playerId: string,
    format: TournamentFormat
  ): Promise<{
    hubSession: Session;
    matchSessions: Array<{
      sessionCode: string;
      player1Id: string;
      player2Id: string;
      matchId: string;
    }>;
  }> {
    const session = await SessionModel.findOne({ sessionCode });
    if (!session) throw new Error('Session not found');
    if (session.hostId !== playerId) throw new Error('Only the host can start the tournament');
    if (session.players.length < 2) throw new Error('Need at least 2 players to start a tournament');
    if ((session as any).tournamentState) throw new Error('Tournament already started');

    // Shuffle players for random seeding
    const shuffled = [...session.players].sort(() => Math.random() - 0.5);
    const participants: TournamentParticipant[] = shuffled.map((p, i) => ({
      id: p.id,
      displayName: p.displayName,
      seed: i,
      eliminated: false,
    }));

    let rounds: TournamentMatch[][];
    let standings: TournamentStanding[] | undefined;

    if (format === 'round-robin') {
      const result = generateRoundRobinSchedule(participants);
      rounds = result.rounds;
      standings = result.standings;
    } else {
      rounds = generateBracket(participants);
    }

    const tournamentState: TournamentState = {
      format,
      rounds,
      currentRound: 0,
      participants,
      standings,
      winnerId: null,
    };

    (session as any).tournamentState = tournamentState;
    session.lastActivity = new Date();

    // Create match sessions for the first round's non-bye matches
    const matchSessions: Array<{
      sessionCode: string;
      player1Id: string;
      player2Id: string;
      matchId: string;
    }> = [];

    const firstRound = rounds[0];
    for (const match of firstRound) {
      if (match.status === 'bye' || !match.player1Id || !match.player2Id) continue;

      const p1 = participants.find((p) => p.id === match.player1Id)!;
      const p2 = participants.find((p) => p.id === match.player2Id)!;

      const matchSession = await this.createMatchSession(
        sessionCode,
        match.matchId,
        { id: p1.id, displayName: p1.displayName },
        { id: p2.id, displayName: p2.displayName },
        session.gameType
      );

      match.currentSessionCode = matchSession.sessionCode;
      match.status = 'in_progress';
      matchSessions.push({
        sessionCode: matchSession.sessionCode,
        player1Id: match.player1Id,
        player2Id: match.player2Id,
        matchId: match.matchId,
      });
    }

    (session as any).tournamentState = tournamentState;
    session.markModified('tournamentState');
    await session.save();

    return { hubSession: this.toSession(session), matchSessions };
  }

  async handleTournamentGameEnded(
    matchSessionCode: string,
    winnerPlayerNumber: number
  ): Promise<TournamentGameEndedResult> {
    const matchSession = await SessionModel.findOne({ sessionCode: matchSessionCode });
    if (
      !matchSession ||
      !(matchSession as any).tournamentHubCode ||
      !(matchSession as any).tournamentMatchId
    ) {
      throw new Error('Not a tournament match session');
    }

    const hubCode = (matchSession as any).tournamentHubCode as string;
    const matchId = (matchSession as any).tournamentMatchId as string;
    const winnerPlayer = matchSession.players.find((p) => p.playerNumber === winnerPlayerNumber);
    const loserPlayer = matchSession.players.find((p) => p.playerNumber !== winnerPlayerNumber);
    if (!winnerPlayer || !loserPlayer) throw new Error('Players not found in match session');

    const winnerId = winnerPlayer.id;
    const loserId = loserPlayer.id;

    const hub = await SessionModel.findOne({ sessionCode: hubCode });
    if (!hub || !(hub as any).tournamentState) throw new Error('Hub session not found');

    const ts: TournamentState = (hub as any).tournamentState;

    // Find the match in the bracket by matchId
    let foundMatch: TournamentMatch | null = null;
    for (const round of ts.rounds) {
      for (const m of round) {
        if (m.matchId === matchId) {
          foundMatch = m;
          break;
        }
      }
      if (foundMatch) break;
    }
    if (!foundMatch) throw new Error('Match not found in tournament bracket');

    const match = foundMatch;

    // Increment wins for winner
    if (winnerId === match.player1Id) {
      match.player1Wins += 1;
    } else {
      match.player2Wins += 1;
    }

    const result: TournamentGameEndedResult = {
      hubSession: this.toSession(hub),
      seriesContinued: false,
      matchFinished: false,
      nextRoundMatches: [],
      tournamentFinished: false,
      roundAdvanced: false,
    };

    if (ts.format === 'round-robin') {
      // Round-robin: always single game per match
      match.status = 'finished';
      match.winnerId = winnerId;

      // Update standings
      if (ts.standings) {
        const winnerStanding = ts.standings.find((s) => s.playerId === winnerId);
        const loserStanding = ts.standings.find((s) => s.playerId === loserId);
        if (winnerStanding) {
          winnerStanding.wins += 1;
          winnerStanding.matchesPlayed += 1;
        }
        if (loserStanding) {
          loserStanding.losses += 1;
          loserStanding.matchesPlayed += 1;
        }
      }

      result.matchFinished = true;

      // Check if all matches in current round are complete
      const currentRoundMatches = ts.rounds[ts.currentRound];
      const allCurrentRoundDone = currentRoundMatches.every(
        (m) => m.status === 'finished' || m.status === 'bye'
      );

      if (allCurrentRoundDone) {
        const nextRoundIndex = ts.currentRound + 1;
        if (nextRoundIndex < ts.rounds.length) {
          ts.currentRound = nextRoundIndex;
          result.roundAdvanced = true;

          const nextRoundMatches = ts.rounds[nextRoundIndex];
          for (const nextMatch of nextRoundMatches) {
            if (!nextMatch.player1Id || !nextMatch.player2Id) continue;
            const p1 = ts.participants.find((p) => p.id === nextMatch.player1Id)!;
            const p2 = ts.participants.find((p) => p.id === nextMatch.player2Id)!;

            const matchSess = await this.createMatchSession(
              hubCode,
              nextMatch.matchId,
              { id: p1.id, displayName: p1.displayName },
              { id: p2.id, displayName: p2.displayName },
              matchSession.gameType
            );
            nextMatch.currentSessionCode = matchSess.sessionCode;
            nextMatch.status = 'in_progress';
            result.nextRoundMatches.push({
              sessionCode: matchSess.sessionCode,
              player1Id: nextMatch.player1Id,
              player2Id: nextMatch.player2Id,
            });
          }
        } else {
          // All rounds complete — find winner by most wins
          if (ts.standings) {
            const sorted = [...ts.standings].sort(
              (a, b) => b.wins - a.wins || a.losses - b.losses
            );
            ts.winnerId = sorted[0].playerId;
          }
          result.tournamentFinished = true;
        }
      }
    } else {
      // Elimination bracket (bo1/bo3/bo5/bo7)
      const threshold = getSeriesThreshold(ts.format);
      const winnerWins = winnerId === match.player1Id ? match.player1Wins : match.player2Wins;

      if (winnerWins < threshold) {
        // Series continues — create next game
        const p1 = ts.participants.find((p) => p.id === match.player1Id)!;
        const p2 = ts.participants.find((p) => p.id === match.player2Id)!;
        const nextGameSession = await this.createMatchSession(
          hubCode,
          match.matchId,
          { id: p1.id, displayName: p1.displayName },
          { id: p2.id, displayName: p2.displayName },
          matchSession.gameType
        );
        match.currentSessionCode = nextGameSession.sessionCode;
        result.seriesContinued = true;
        result.seriesNextSessionCode = nextGameSession.sessionCode;
      } else {
        // Series finished — winner advances
        match.status = 'finished';
        match.winnerId = winnerId;
        result.matchFinished = true;
        result.eliminatedPlayerId = loserId;

        const loserParticipant = ts.participants.find((p) => p.id === loserId);
        if (loserParticipant) loserParticipant.eliminated = true;

        const nextRoundIndex = match.roundIndex + 1;
        if (nextRoundIndex < ts.rounds.length) {
          const nextMatchIndex = Math.floor(match.matchIndex / 2);
          const nextMatch = ts.rounds[nextRoundIndex][nextMatchIndex];
          if (nextMatch) {
            if (match.matchIndex % 2 === 0) {
              nextMatch.player1Id = winnerId;
            } else {
              nextMatch.player2Id = winnerId;
            }

            // If both sides are filled, start the next match
            if (nextMatch.player1Id && nextMatch.player2Id) {
              const np1 = ts.participants.find((p) => p.id === nextMatch.player1Id)!;
              const np2 = ts.participants.find((p) => p.id === nextMatch.player2Id)!;
              const nextMatchSess = await this.createMatchSession(
                hubCode,
                nextMatch.matchId,
                { id: np1.id, displayName: np1.displayName },
                { id: np2.id, displayName: np2.displayName },
                matchSession.gameType
              );
              nextMatch.currentSessionCode = nextMatchSess.sessionCode;
              nextMatch.status = 'in_progress';
              result.nextRoundMatches.push({
                sessionCode: nextMatchSess.sessionCode,
                player1Id: nextMatch.player1Id,
                player2Id: nextMatch.player2Id,
              });
            }
          }
        } else {
          // This was the final
          ts.winnerId = winnerId;
          result.tournamentFinished = true;
        }
      }
    }

    // Save updated hub tournament state
    (hub as any).tournamentState = ts;
    hub.markModified('tournamentState');
    hub.lastActivity = new Date();
    await hub.save();

    result.hubSession = this.toSession(hub);
    return result;
  }

  private generatePlayerId(): string {
    return nanoid();
  }

  private toSession(doc: any): Session {
    return {
      _id: doc._id.toString(),
      sessionCode: doc.sessionCode,
      gameType: doc.gameType,
      status: doc.status,
      players: doc.players,
      spectators: doc.spectators ?? [],
      gameState: doc.gameState,
      hostId: doc.hostId,
      createdAt: doc.createdAt,
      lastActivity: doc.lastActivity,
      chatHistory: doc.chatHistory ?? [],
      tournamentState: doc.tournamentState ?? undefined,
      tournamentHubCode: doc.tournamentHubCode ?? undefined,
      tournamentMatchId: doc.tournamentMatchId ?? undefined,
    };
  }
}
