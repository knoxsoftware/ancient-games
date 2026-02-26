import { describe, it, expect, vi, beforeEach } from 'vitest';

// We test addBotPlayer logic by checking the method exists and validates inputs
// Full integration testing requires MongoDB; unit test stubs the model.

vi.mock('../models/Session', () => {
  const players = [
    {
      id: 'host-id',
      displayName: 'Host',
      socketId: 'sock1',
      ready: false,
      playerNumber: 0,
      status: 'active',
    },
  ];

  let callCount = 0;
  const mockDoc = {
    sessionCode: 'TEST01',
    gameType: 'ur',
    status: 'lobby',
    players,
    spectators: [],
    gameState: { board: { pieces: [], currentTurn: 0, diceRoll: null, lastMove: null }, currentTurn: 0, winner: null, started: false, finished: false },
    hostId: 'host-id',
    createdAt: new Date(),
    lastActivity: new Date(),
    chatHistory: [],
    _id: 'doc-id',
  };

  return {
    SessionModel: {
      findOne: vi.fn(({ sessionCode }) => {
        if (sessionCode === 'NOTFOUND') return Promise.resolve(null);
        // After updateOne, return with bot player appended
        const doc = { ...mockDoc, players: [...players] };
        if (callCount > 0) {
          doc.players.push({
            id: 'bot-nanoid',
            displayName: 'Ancient Strategist',
            socketId: 'bot',
            ready: true,
            playerNumber: 1,
            status: 'active',
            isBot: true,
            botDifficulty: 'medium',
            botPersona: 'Ancient Strategist',
          } as any);
        }
        return Promise.resolve(doc);
      }),
      updateOne: vi.fn(() => {
        callCount++;
        return Promise.resolve({ modifiedCount: 1 });
      }),
    },
  };
});

import { SessionService } from './SessionService';

describe('addBotPlayer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('throws if session not found', async () => {
    const svc = new SessionService();
    await expect(svc.addBotPlayer('NOTFOUND', 'host-id', { difficulty: 'medium' })).rejects.toThrow(
      'Session not found',
    );
  });

  it('throws if requester is not host', async () => {
    const svc = new SessionService();
    await expect(svc.addBotPlayer('TEST01', 'not-host', { difficulty: 'medium' })).rejects.toThrow(
      'Only the host can add bots',
    );
  });
});
