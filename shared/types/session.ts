import { GameType, GameState, Player, Spectator } from './game';

export type SessionStatus = 'lobby' | 'playing' | 'finished';

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
