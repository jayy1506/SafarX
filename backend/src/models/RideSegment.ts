import mongoose, { Schema, Document, Types } from 'mongoose';

export interface IRideSegment extends Document {
  ride: Types.ObjectId;
  fromStop: string;
  toStop: string;
  sequenceOrder: number;
  totalSeats: number;
  bookedSeats: number;
  pendingSeats: number;
  distanceKm: number;
  segmentFare: number;
  availableSeats: number;
}

export const RideSegmentSchema = new Schema<IRideSegment>(
  {
    ride: { type: Schema.Types.ObjectId, ref: 'Ride', required: true, index: true },
    fromStop: { type: String, required: true, trim: true },
    toStop: { type: String, required: true, trim: true },
    sequenceOrder: { type: Number, required: true },
    totalSeats: { type: Number, required: true, min: 1 },
    bookedSeats: { type: Number, default: 0, min: 0 },
    pendingSeats: { type: Number, default: 0, min: 0 },
    distanceKm: { type: Number, default: 2.5 },
    segmentFare: { type: Number, required: true, default: 10 },
  },
  { timestamps: true }
);

// Fast sub-route matrix & sequence indexes
RideSegmentSchema.index({ ride: 1, sequenceOrder: 1 });
RideSegmentSchema.index({ ride: 1, fromStop: 1, toStop: 1 });

export const RideSegment = mongoose.model<IRideSegment>('RideSegment', RideSegmentSchema);

