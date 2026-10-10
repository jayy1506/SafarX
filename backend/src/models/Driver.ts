import mongoose, { Schema, Document, Types } from 'mongoose';

export type DriverStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'SUSPENDED';

export interface IDriver extends Document {
  user: Types.ObjectId;
  drivingLicenseNumber: string;
  licenseExpiry: Date;
  governmentIdType: string;
  governmentIdNumber: string;
  governmentIdDocumentUrl?: string;
  licenseDocumentUrl?: string;
  dateOfBirth?: Date;
  address?: string;
  verificationStatus: DriverStatus;
  rejectionReason?: string;
  totalRidesCompleted: number;
  ratingAverage: number;
  ratingCount: number;
  todayEarnings: number;
  totalEarnings: number;
  createdAt: Date;
  updatedAt: Date;
}

const DriverSchema = new Schema<IDriver>(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
    drivingLicenseNumber: { type: String, required: true, unique: true, uppercase: true, trim: true },
    licenseExpiry: { type: Date, required: true },
    governmentIdType: { type: String, default: 'AADHAAR' },
    governmentIdNumber: { type: String, required: true, trim: true },
    governmentIdDocumentUrl: { type: String, default: '' },
    licenseDocumentUrl: { type: String, default: '' },
    dateOfBirth: { type: Date },
    address: { type: String, default: '' },
    verificationStatus: {
      type: String,
      enum: ['PENDING', 'APPROVED', 'REJECTED', 'SUSPENDED'],
      default: 'PENDING',
      index: true,
    },
    rejectionReason: { type: String, default: '' },
    totalRidesCompleted: { type: Number, default: 0 },
    ratingAverage: { type: Number, default: 5.0 },
    ratingCount: { type: Number, default: 0 },
    todayEarnings: { type: Number, default: 0 },
    totalEarnings: { type: Number, default: 0 },
  },
  { timestamps: true }
);

// Admin dashboard KYC verification query index
DriverSchema.index({ verificationStatus: 1, createdAt: -1 });

export const Driver = mongoose.model<IDriver>('Driver', DriverSchema);

