import { Router } from 'express';
import { SessionService } from '../services/SessionService';

export function createSessionRoutes(sessionService: SessionService): Router {
  const router = Router();

  // Create a new session
  router.post('/sessions', async (req, res) => {
    try {
      const { gameType, displayName } = req.body;

      if (!gameType || !displayName) {
        return res.status(400).json({ error: 'gameType and displayName are required' });
      }

      const socketId = 'temp'; // Will be updated when socket connects
      const result = await sessionService.createSession({ gameType, displayName }, socketId);

      res.json(result);
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  });

  // Join an existing session
  router.post('/sessions/join', async (req, res) => {
    try {
      const { sessionCode, displayName } = req.body;

      if (!sessionCode || !displayName) {
        return res.status(400).json({ error: 'sessionCode and displayName are required' });
      }

      const socketId = 'temp'; // Will be updated when socket connects
      const result = await sessionService.joinSession({ sessionCode, displayName }, socketId);

      res.json(result);
    } catch (error) {
      res.status(400).json({ error: (error as Error).message });
    }
  });

  // Spectate a session
  router.post('/sessions/spectate', async (req, res) => {
    try {
      const { sessionCode, displayName } = req.body;

      if (!sessionCode || !displayName) {
        return res.status(400).json({ error: 'sessionCode and displayName are required' });
      }

      const socketId = 'temp';
      const result = await sessionService.addSpectator(sessionCode, displayName, socketId);

      res.json(result);
    } catch (error) {
      res.status(400).json({ error: (error as Error).message });
    }
  });

  // Add a bot player (host only)
  router.post('/sessions/:sessionCode/add-bot', async (req, res) => {
    try {
      const { sessionCode } = req.params;
      const { requesterId, difficulty, persona, ollamaEnabled, ollamaModel } = req.body;

      if (!requesterId || !difficulty) {
        return res.status(400).json({ error: 'requesterId and difficulty are required' });
      }

      const validDifficulties = ['easy', 'medium', 'hard', 'harder', 'hardest'];
      if (!validDifficulties.includes(difficulty)) {
        return res.status(400).json({ error: 'Invalid difficulty' });
      }

      const session = await sessionService.addBotPlayer(sessionCode, requesterId, {
        difficulty,
        persona,
        ollamaEnabled,
        ollamaModel,
      });

      res.json(session);
    } catch (error) {
      const msg = (error as Error).message;
      const status = msg.includes('host') || msg.includes('full') ? 400 : 500;
      res.status(status).json({ error: msg });
    }
  });

  // Remove a bot player (host only, lobby only)
  router.delete('/sessions/:sessionCode/bot/:botId', async (req, res) => {
    try {
      const { sessionCode, botId } = req.params;
      const { requesterId } = req.body;

      if (!requesterId) {
        return res.status(400).json({ error: 'requesterId is required' });
      }

      const session = await sessionService.getSession(sessionCode);
      if (!session) return res.status(404).json({ error: 'Session not found' });
      if (session.hostId !== requesterId) return res.status(403).json({ error: 'Only the host can remove bots' });
      if (session.status !== 'lobby') return res.status(400).json({ error: 'Can only remove bots in the lobby' });

      const bot = session.players.find((p) => p.id === botId);
      if (!bot || !(bot as any).isBot) return res.status(400).json({ error: 'Player is not a bot' });

      const updated = await sessionService.removePlayer(sessionCode, botId);
      res.json(updated);
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  });

  // Get session details
  router.get('/sessions/:sessionCode', async (req, res) => {
    try {
      const { sessionCode } = req.params;
      const session = await sessionService.getSession(sessionCode);

      if (!session) {
        return res.status(404).json({ error: 'Session not found' });
      }

      res.json(session);
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  });

  return router;
}
