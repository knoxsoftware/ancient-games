import { customAlphabet } from 'nanoid';
import { SessionModel } from '../models/Session';
import { GameRegistry } from '../games/GameRegistry';
import { Session, GameType, Player, CreateSessionRequest, JoinSessionRequest } from '@ancient-games/shared';

const nanoid = customAlphabet('ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789', 6);

export class SessionService {
  async createSession(request: CreateSessionRequest, socketId: string): Promise<{ session: Session; playerId: string }> {
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

  async joinSession(request: JoinSessionRequest, socketId: string): Promise<{ session: Session; playerId: string }> {
    const session = await SessionModel.findOne({ sessionCode: request.sessionCode });

    if (!session) {
      throw new Error('Session not found');
    }

    if (session.status !== 'lobby') {
      throw new Error('Session has already started');
    }

    const gameEngine = GameRegistry.getGame(session.gameType);
    if (session.players.length >= gameEngine.playerCount) {
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

  async updatePlayerSocketId(sessionCode: string, playerId: string, socketId: string): Promise<void> {
    await SessionModel.updateOne(
      { sessionCode, 'players.id': playerId },
      { $set: { 'players.$.socketId': socketId, lastActivity: new Date() } }
    );
  }

  async updatePlayerReady(sessionCode: string, playerId: string, ready: boolean): Promise<Session | null> {
    const session = await SessionModel.findOne({ sessionCode });
    if (!session) return null;

    const player = session.players.find(p => p.id === playerId);
    if (player) {
      player.ready = ready;
      session.lastActivity = new Date();
      await session.save();
    }

    return this.toSession(session);
  }

  async removePlayer(sessionCode: string, playerId: string): Promise<Session | null> {
    const session = await SessionModel.findOne({ sessionCode });
    if (!session) return null;

    session.players = session.players.filter(p => p.id !== playerId);

    // If no players left, delete the session
    if (session.players.length === 0) {
      await SessionModel.deleteOne({ sessionCode });
      return null;
    }

    // If host left, assign new host
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

    // Check if game is finished
    if (gameState.winner !== null) {
      session.status = 'finished';
      session.gameState.finished = true;
    }

    await session.save();
    return this.toSession(session);
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
      gameState: doc.gameState,
      hostId: doc.hostId,
      createdAt: doc.createdAt,
      lastActivity: doc.lastActivity,
    };
  }
}
