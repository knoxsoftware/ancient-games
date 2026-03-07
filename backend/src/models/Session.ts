import mongoose, { Schema, Document } from 'mongoose';
import {
  Session as ISession,
  GameState,
  Player,
  Spectator,
  ChatMessage,
} from '@ancient-games/shared';

export interface SessionDocument extends Omit<ISession, '_id'>, Document {}

const PlayerSchema = new Schema<Player>({
  id: { type: String, required: true },
  displayName: { type: String, required: true },
  socketId: { type: String, required: true },
  ready: { type: Boolean, default: false },
  playerNumber: { type: Number, required: true },
  status: { type: String, enum: ['active', 'away'], default: 'active' },
  awayAt: { type: Number, default: null },
  isBot: { type: Boolean, default: false },
  botDifficulty: { type: String, enum: ['easy', 'medium', 'hard', 'harder', 'hardest'], default: null },
  botPersona: { type: String, default: null },
});

const SpectatorSchema = new Schema<Spectator>({
  id: { type: String, required: true },
  displayName: { type: String, required: true },
  socketId: { type: String, required: true },
  status: { type: String, enum: ['active', 'away'], default: 'active' },
  originalSeatNumber: { type: Number, default: null },
});

const ChatMessageSchema = new Schema<ChatMessage>({
  id: { type: String, required: true },
  playerId: { type: String, required: true },
  displayName: { type: String, required: true },
  text: { type: String, required: true },
  timestamp: { type: Number, required: true },
  isSpectator: { type: Boolean, default: false },
  chatScope: { type: String, enum: ['tournament', 'match', 'dm'], default: null },
  toPlayerId: { type: String, default: null },
});

const GameStateSchema = new Schema<GameState>({
  board: { type: Schema.Types.Mixed, required: true },
  currentTurn: { type: Number, default: 0 },
  winner: { type: Number, default: null },
  started: { type: Boolean, default: false },
  finished: { type: Boolean, default: false },
  moveHistory: { type: [Schema.Types.Mixed], default: [] },
});

const SessionSchema = new Schema<SessionDocument>({
  sessionCode: { type: String, required: true, unique: true, index: true },
  gameType: {
    type: String,
    enum: ['ur', 'senet', 'morris', 'wolves-and-ravens', 'rock-paper-scissors', 'stellar-siege', 'fox-and-geese', 'mancala', 'go', 'ur-roguelike', 'bombermage'],
    required: true,
  },
  status: { type: String, enum: ['lobby', 'playing', 'finished'], default: 'lobby' },
  players: [PlayerSchema],
  spectators: { type: [SpectatorSchema], default: [] },
  gameState: { type: GameStateSchema, required: true },
  hostId: { type: String, required: true },
  createdAt: { type: Date, default: Date.now },
  lastActivity: { type: Date, default: Date.now },
  chatHistory: { type: [ChatMessageSchema], default: [] },
  tournamentState: { type: Schema.Types.Mixed, default: null },
  tournamentHubCode: { type: String, default: null },
  tournamentMatchId: { type: String, default: null },
  lobbyFormat: {
    type: String,
    enum: ['single', 'bo1', 'bo3', 'bo5', 'bo7', 'round-robin'],
    default: 'single',
  },
  botConfig: { type: Schema.Types.Mixed, default: null },
});

// Auto-cleanup sessions older than 24 hours with no activity
SessionSchema.index({ lastActivity: 1 }, { expireAfterSeconds: 86400 });

export const SessionModel = mongoose.model<SessionDocument>('Session', SessionSchema);
