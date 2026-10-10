import mongoose, { Schema, Document, Types } from 'mongoose';

export type AuditActionType =
  | 'PAYMENT_CAPTURED'
  | 'PAYMENT_FAILED'
  | 'REFUND_PROCESSED'
  | 'BOOKING_CREATED'
  | 'BOOKING_CANCELLED'
  | 'BOOKING_BOARDED'
  | 'SEAT_HOLD_EXPIRED'
  | 'DRIVER_APPROVED'
  | 'DRIVER_REJECTED'
  | 'SETTINGS_UPDATED'
  | 'WEBHOOK_PROCESSED';

export interface IAuditLog extends Document {
  action: AuditActionType;
  performedBy?: Types.ObjectId;
  targetEntity?: string;
  targetId?: string;
  details: Record<string, any>;
  ipAddress?: string;
  createdAt: Date;
}

const AuditLogSchema = new Schema<IAuditLog>(
  {
    action: { type: String, required: true, index: true },
    performedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    targetEntity: { type: String },
    targetId: { type: String, index: true },
    details: { type: Schema.Types.Mixed, default: {} },
    ipAddress: { type: String },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

AuditLogSchema.index({ action: 1, createdAt: -1 });
AuditLogSchema.index({ targetId: 1, action: 1 });

export const AuditLog = mongoose.model<IAuditLog>('AuditLog', AuditLogSchema);
