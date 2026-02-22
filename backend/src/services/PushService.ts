import webpush from 'web-push';
import { PushSubscriptionModel } from '../models/PushSubscription';

export interface PushPayload {
  title: string;
  body: string;
  url: string;
}

export class PushService {
  private readonly configured: boolean;

  constructor() {
    const publicKey = process.env.VAPID_PUBLIC_KEY;
    const privateKey = process.env.VAPID_PRIVATE_KEY;
    const mailto = process.env.VAPID_MAILTO || 'mailto:admin@example.com';

    if (publicKey && privateKey) {
      webpush.setVapidDetails(mailto, publicKey, privateKey);
      this.configured = true;
    } else {
      console.warn('VAPID keys not set — push notifications disabled. Set VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY.');
      this.configured = false;
    }
  }

  isConfigured(): boolean {
    return this.configured;
  }

  async saveSubscription(
    playerId: string,
    subscription: { endpoint: string; keys: { p256dh: string; auth: string } }
  ): Promise<void> {
    await PushSubscriptionModel.findOneAndUpdate(
      { playerId },
      { playerId, endpoint: subscription.endpoint, keys: subscription.keys, createdAt: new Date() },
      { upsert: true, new: true }
    );
  }

  async removeSubscription(playerId: string): Promise<void> {
    await PushSubscriptionModel.deleteOne({ playerId });
  }

  async sendNotification(playerId: string, payload: PushPayload): Promise<void> {
    if (!this.configured) return;

    const sub = await PushSubscriptionModel.findOne({ playerId });
    if (!sub) return;

    try {
      await webpush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.keys.p256dh, auth: sub.keys.auth } },
        JSON.stringify(payload)
      );
    } catch (err: any) {
      if (err.statusCode === 410 || err.statusCode === 404) {
        // Subscription expired — remove it
        await PushSubscriptionModel.deleteOne({ playerId });
      } else {
        console.error('Push notification error for player', playerId, err.message);
      }
    }
  }
}
