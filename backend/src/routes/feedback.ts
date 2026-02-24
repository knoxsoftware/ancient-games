import { Router } from 'express';
import { FeedbackModel } from '../models/Feedback';

export function createFeedbackRoutes(): Router {
  const router = Router();

  // POST /api/feedback — create a feedback entry
  router.post('/feedback', async (req, res) => {
    try {
      const { text, gameType, sessionCode, playerName } = req.body;
      if (!text || typeof text !== 'string' || text.trim() === '') {
        return res.status(400).json({ error: 'text is required' });
      }
      const entry = await FeedbackModel.create({
        text: text.trim(),
        gameType: gameType ?? null,
        sessionCode: sessionCode ?? null,
        playerName: playerName ?? null,
      });
      res.status(201).json(entry);
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  });

  // GET /api/feedback — return all entries newest first
  router.get('/feedback', async (_req, res) => {
    try {
      const entries = await FeedbackModel.find().sort({ createdAt: -1 });
      res.json(entries);
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  });

  // DELETE /api/feedback/clear — delete all entries
  // IMPORTANT: must be registered before /:id to avoid routing conflict
  router.delete('/feedback/clear', async (_req, res) => {
    try {
      await FeedbackModel.deleteMany({});
      res.json({ message: 'All feedback deleted' });
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  });

  // DELETE /api/feedback/:id — delete a single entry
  router.delete('/feedback/:id', async (req, res) => {
    try {
      const { id } = req.params;
      const result = await FeedbackModel.findByIdAndDelete(id);
      if (!result) {
        return res.status(404).json({ error: 'Feedback not found' });
      }
      res.json({ message: 'Feedback deleted' });
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  });

  return router;
}
