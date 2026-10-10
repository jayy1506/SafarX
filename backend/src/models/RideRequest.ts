import mongoose, { Schema, Document, Types } from 'mongoose';

export type RideRequestStatus = 'PENDING' | 'ACCEPTED' | 'EXPIRED' | 'CANCELLED';

export interface IRideRequest extends Document {
  customer: Types.ObjectId;
  route: Types.ObjectId;
  pickupStop: string;
  dropStop: string;
  timeSlot: string; // e.g. "10:00 AM - 10:30 AM"
  seatsRequested: number;
  status: RideRequestStatus;
  acceptedByDriver?: Types.ObjectId;
  acceptedAt?: Date;
  booking?: Types.ObjectId; // Link to the created booking once accepted
  createdAt: Date;
  updatedAt: Date;
}

const RideRequestSchema = new Schema<IRideRequest>(
  {
    customer: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    route: { type: Schema.Types.ObjectId, ref: 'Route', required: true },
    pickupStop: { type: String, required: true },
    dropStop: { type: String, required: true },
    timeSlot: { type: String, required: true },
    seatsRequested: { type: Number, required: true, min: 1, max: 6, default: 1 },
    status: {
      type: String,
      enum: ['PENDING', 'ACCEPTED', 'EXPIRED', 'CANCELLED'],
      default: 'PENDING',
      index: true,
    },
    acceptedByDriver: { type: Schema.Types.ObjectId, ref: 'Driver' },
    acceptedAt: { type: Date },
    booking: { type: Schema.Types.ObjectId, ref: 'Booking' },
  },
  { timestamps: true }
);

export const RideRequest = mongoose.model<IRideRequest>('RideRequest', RideRequestSchema);
