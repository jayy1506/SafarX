import mongoose, { Schema, Document } from 'mongoose';

export interface ICancellationTier {
  minutesBeforeDeparture: number;
  refundPercentage: number;
  description: string;
}

export interface IAdminSettings extends Document {
  key: string;
  minFare: number;
  maxFare: number;
  allowDriverFareAdjustment: boolean;
  commissionType: 'PERCENTAGE' | 'FIXED';
  commissionValue: number; // e.g., 10 for 10%
  seatHoldDurationMinutes: number;
  maxSeatsPerBooking: number;
  customerCancellationTiers: ICancellationTier[];
  driverCancellationPenalty: number;
  driverAutoApproval: boolean;
  supportPhone: string;
  supportEmail: string;
  createdAt: Date;
  updatedAt: Date;
}

const CancellationTierSchema = new Schema<ICancellationTier>(
  {
    minutesBeforeDeparture: { type: Number, required: true },
    refundPercentage: { type: Number, required: true, min: 0, max: 100 },
    description: { type: String, required: true },
  },
  { _id: false }
);

const AdminSettingsSchema = new Schema<IAdminSettings>(
  {
    key: { type: String, required: true, unique: true, default: 'GLOBAL_SETTINGS' },
    minFare: { type: Number, default: 10, min: 5 },
    maxFare: { type: Number, default: 200, max: 1000 },
    allowDriverFareAdjustment: { type: Boolean, default: true },
    commissionType: { type: String, enum: ['PERCENTAGE', 'FIXED'], default: 'PERCENTAGE' },
    commissionValue: { type: Number, default: 10, min: 0 },
    seatHoldDurationMinutes: { type: Number, default: 10, min: 2, max: 30 },
    maxSeatsPerBooking: { type: Number, default: 4, min: 1, max: 8 },
    customerCancellationTiers: [CancellationTierSchema],
    driverCancellationPenalty: { type: Number, default: 50 },
    driverAutoApproval: { type: Boolean, default: false },
    supportPhone: { type: String, default: '+91 9876543210' },
    supportEmail: { type: String, default: 'support@sawangiride.com' },
  },
  { timestamps: true }
);

export const AdminSettings = mongoose.model<IAdminSettings>('AdminSettings', AdminSettingsSchema);
