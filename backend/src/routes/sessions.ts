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
