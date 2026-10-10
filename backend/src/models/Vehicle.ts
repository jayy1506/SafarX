import mongoose, { Schema, Types } from 'mongoose';

export type VehicleStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'INACTIVE';
export type VehicleType = 'CAR' | 'AUTO' | 'BIKE' | 'VAN';

export interface IVehicle {
  _id?: Types.ObjectId | string;
  driver: Types.ObjectId;
  vehicleNumber: string;
  vehicleType: VehicleType;
  brand: string;
  model: string;
  color: string;
  totalSeats: number;
  rcNumber: string;
  rcDocumentUrl?: string;
  insuranceNumber?: string;
  insuranceExpiry?: Date;
  insuranceDocumentUrl?: string;
  status: VehicleStatus;
  isDefault: boolean;
  createdAt?: Date;
  updatedAt?: Date;
}

const VehicleSchema = new Schema<IVehicle>(
  {
    driver: { type: Schema.Types.ObjectId, ref: 'Driver', required: true, index: true },
    vehicleNumber: { type: String, required: true, unique: true, uppercase: true, trim: true },
    vehicleType: {
      type: String,
      enum: ['CAR', 'AUTO', 'BIKE', 'VAN'],
      default: 'CAR',
    },
    brand: { type: String, required: true, trim: true },
    model: { type: String, required: true, trim: true },
    color: { type: String, required: true, trim: true },
    totalSeats: { type: Number, required: true, min: 1, max: 10, default: 4 },
    rcNumber: { type: String, required: true, uppercase: true, trim: true },
    rcDocumentUrl: { type: String, default: '' },
    insuranceNumber: { type: String, default: '' },
    insuranceExpiry: { type: Date },
    insuranceDocumentUrl: { type: String, default: '' },
    status: {
      type: String,
      enum: ['PENDING', 'APPROVED', 'REJECTED', 'INACTIVE'],
      default: 'APPROVED',
      index: true,
    },
    isDefault: { type: Boolean, default: true },
  },
  { timestamps: true }
);

// Driver vehicle lookup index
VehicleSchema.index({ driver: 1, isDefault: 1, status: 1 });

export const Vehicle = mongoose.model<IVehicle>('Vehicle', VehicleSchema);

