import { GameType, GameState, Player, Spectator, TournamentState, TournamentFormat } from './game';

export type SessionStatus = 'lobby' | 'playing' | 'finished';

export interface ChatMessage {
  id: string;
  playerId: string;
  displayName: string;
  text: string;
  timestamp: number;
  isSpectator?: boolean;
  chatScope?: 'tournament' | 'match' | 'dm';
  toPlayerId?: string;
}

export interface Session {
  _id?: string;
  sessionCode: string;
  gameType: GameType;
  status: SessionStatus;
  players: Player[];
  spectators: Spectator[];
  gameState: GameState;
  hostId: string;
  createdAt: Date;
  lastActivity: Date;
  chatHistory?: ChatMessage[];
  tournamentState?: TournamentState;
  tournamentHubCode?: string;
  tournamentMatchId?: string;
  lobbyFormat?: TournamentFormat | 'single';
}

export interface CreateSessionRequest {
  gameType: GameType;
  displayName: string;
}

export interface CreateSessionResponse {
  session: Session;
  playerId: string;
}

export interface JoinSessionRequest {
  sessionCode: string;
  displayName: string;
}

export interface JoinSessionResponse {
  session: Session;
  playerId: string;
}

export interface SpectateSessionRequest {
  sessionCode: string;
  displayName: string;
}

export interface SpectateSessionResponse {
  session: Session;
  spectatorId: string;
}
