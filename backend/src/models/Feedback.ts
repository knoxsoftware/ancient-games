import mongoose, { Schema, Document } from 'mongoose';

export interface FeedbackDoc extends Document {
  text: string;
  gameType?: string;
  sessionCode?: string;
  playerName?: string;
  createdAt: Date;
}

const FeedbackSchema = new Schema<FeedbackDoc>({
  text: { type: String, required: true },
  gameType: { type: String, default: null },
  sessionCode: { type: String, default: null },
  playerName: { type: String, default: null },
  createdAt: { type: Date, default: Date.now },
});

export const FeedbackModel = mongoose.model<FeedbackDoc>('Feedback', FeedbackSchema);
