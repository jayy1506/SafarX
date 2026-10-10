import mongoose, { Schema, Document, Types } from 'mongoose';
import { IRideSegment } from './RideSegment.js';

export type RideStatus = 'SCHEDULED' | 'ACTIVE' | 'COMPLETED' | 'CANCELLED';
export type RideDirection = 'FORWARD' | 'REVERSE';

export interface IRide extends Document {
  driver: Types.ObjectId;
  vehicle: Types.ObjectId;
  route: Types.ObjectId;
  direction: RideDirection;
  originStop: string;
  destinationStop: string;
  stops: string[];
  rideDate: string; // YYYY-MM-DD
  departureTime: string; // HH:mm
  totalSeats: number;
  availableSeatsCount: number;
  dailyFare: number;
  status: RideStatus;
  cancellationReason?: string;
  cancelledBy?: 'DRIVER' | 'ADMIN' | 'SYSTEM';
  startedAt?: Date;
  completedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const RideSchema = new Schema<IRide>(
  {
    driver: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    vehicle: { type: Schema.Types.ObjectId, ref: 'Vehicle', required: true },
    route: { type: Schema.Types.ObjectId, ref: 'Route', required: true, index: true },
    direction: { type: String, enum: ['FORWARD', 'REVERSE'], default: 'FORWARD' },
    originStop: { type: String, required: true },
    destinationStop: { type: String, required: true },
    stops: [{ type: String, required: true }],
    rideDate: { type: String, required: true, index: true },
    departureTime: { type: String, required: true },
    totalSeats: { type: Number, required: true, min: 1, max: 10 },
    availableSeatsCount: { type: Number, required: true, default: 4 },
    dailyFare: { type: Number, required: true, min: 5 },
    status: {
      type: String,
      enum: ['SCHEDULED', 'ACTIVE', 'COMPLETED', 'CANCELLED'],
      default: 'SCHEDULED',
      index: true,
    },
    cancellationReason: { type: String, default: '' },
    cancelledBy: { type: String, enum: ['DRIVER', 'ADMIN', 'SYSTEM'] },
    startedAt: { type: Date },
    completedAt: { type: Date },
  },
  { timestamps: true }
);

// Compound indexes for optimal query execution plans
RideSchema.index({ route: 1, rideDate: 1, status: 1 });
RideSchema.index({ driver: 1, rideDate: 1, departureTime: 1 });
RideSchema.index({ rideDate: 1, status: 1, departureTime: 1 });
RideSchema.index({ originStop: 1, destinationStop: 1, status: 1, rideDate: 1 });

export const Ride = mongoose.model<IRide>('Ride', RideSchema);

