import mongoose, { Schema, Document, Types } from 'mongoose';

export interface INotification extends Document {
  recipient: Types.ObjectId;
  recipientRole: 'ADMIN' | 'DRIVER' | 'CUSTOMER';
  title: string;
  message: string;
  type: string;
  data?: Record<string, any>;
  isRead: boolean;
  createdAt: Date;
}

const NotificationSchema = new Schema<INotification>(
  {
    recipient: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    recipientRole: { type: String, enum: ['ADMIN', 'DRIVER', 'CUSTOMER'], required: true },
    title: { type: String, required: true },
    message: { type: String, required: true },
    type: { type: String, required: true },
    data: { type: Schema.Types.Mixed },
    isRead: { type: Boolean, default: false },
  },
  { timestamps: true }
);

export const Notification = mongoose.model<INotification>('Notification', NotificationSchema);
