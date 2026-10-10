import mongoose, { Schema, Document } from 'mongoose';

export interface IWebhookEvent extends Document {
  eventId: string;
  eventType: string;
  payload: Record<string, any>;
  processedAt: Date;
  status: 'PROCESSED' | 'FAILED' | 'IGNORED';
  errorMessage?: string;
}

const WebhookEventSchema = new Schema<IWebhookEvent>(
  {
    eventId: { type: String, required: true, unique: true, index: true },
    eventType: { type: String, required: true },
    payload: { type: Schema.Types.Mixed },
    processedAt: { type: Date, default: Date.now },
    status: {
      type: String,
      enum: ['PROCESSED', 'FAILED', 'IGNORED'],
      default: 'PROCESSED',
    },
    errorMessage: { type: String },
  },
  { timestamps: true }
);

WebhookEventSchema.index({ eventType: 1, createdAt: -1 });

export const WebhookEvent = mongoose.model<IWebhookEvent>('WebhookEvent', WebhookEventSchema);
