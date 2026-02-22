import { Router } from 'express';
import { PushService } from '../services/PushService';

export function createPushRoutes(pushService: PushService): Router {
  const router = Router();

  router.get('/push/vapid-public-key', (req, res) => {
    const key = process.env.VAPID_PUBLIC_KEY;
    if (!key) {
      return res.status(503).json({ error: 'Push notifications not configured' });
    }
    res.json({ publicKey: key });
  });

  router.post('/push/subscribe', async (req, res) => {
    const { playerId, subscription } = req.body;
    if (
      !playerId ||
      !subscription?.endpoint ||
      !subscription?.keys?.p256dh ||
      !subscription?.keys?.auth
    ) {
      return res.status(400).json({ error: 'Invalid subscription data' });
    }
    try {
      await pushService.saveSubscription(playerId, subscription);
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  router.delete('/push/subscribe', async (req, res) => {
    const { playerId } = req.body;
    if (!playerId) {
      return res.status(400).json({ error: 'playerId is required' });
    }
    try {
      await pushService.removeSubscription(playerId);
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  return router;
}
