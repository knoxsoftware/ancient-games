import mongoose, { Schema, Document } from 'mongoose';

export interface PushSubscriptionDoc extends Document {
  playerId: string;
  endpoint: string;
  keys: {
    p256dh: string;
    auth: string;
  };
  createdAt: Date;
}

const PushSubscriptionSchema = new Schema<PushSubscriptionDoc>({
  playerId: { type: String, required: true, unique: true, index: true },
  endpoint: { type: String, required: true },
  keys: {
    p256dh: { type: String, required: true },
    auth: { type: String, required: true },
  },
  createdAt: { type: Date, default: Date.now },
});

// Auto-cleanup subscriptions after 30 days
PushSubscriptionSchema.index({ createdAt: 1 }, { expireAfterSeconds: 30 * 86400 });

export const PushSubscriptionModel = mongoose.model<PushSubscriptionDoc>(
  'PushSubscription',
  PushSubscriptionSchema
);
