import { GameType, GameState, Player, Spectator, TournamentState, TournamentFormat } from './game';

export type BombermageGridSize = '9x9' | '11x11' | '13x11';
export type BombermageBarrierDensity = 'sparse' | 'normal' | 'dense';
export type BombermagePowerupFrequency = 'rare' | 'normal' | 'common';
export type BombermageFuseLength = 2 | 3 | 4;
export type BombermagePowerupType =
  | 'blast-radius'
  | 'extra-bomb'
  | 'kick-bomb'
  | 'manual-detonation'
  | 'speed-boost'
  | 'shield';

export interface BombermageConfig {
  gridSize: BombermageGridSize;
  barrierDensity: BombermageBarrierDensity;
  powerupFrequency: 'rare' | 'normal' | 'common';
  enabledPowerups: BombermagePowerupType[];
  fuseLength: BombermageFuseLength;
  coinDensity: number; // 0–1, fraction of destructible boxes that hide a coin
  apMin: number; // minimum AP per turn (when equal to apMax, acts as static AP — no roll button)
  apMax: number; // maximum AP per turn
}

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
  botConfig?: {
    ollamaEnabled: boolean;
    ollamaModel?: string;
  };
  gameOptions?: BombermageConfig;
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
