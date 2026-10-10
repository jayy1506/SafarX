import mongoose, { Schema, Document, Types } from 'mongoose';

export interface IReview extends Document {
  booking: Types.ObjectId;
  ride: Types.ObjectId;
  reviewer: Types.ObjectId;
  reviewerRole: 'CUSTOMER' | 'DRIVER';
  targetUser: Types.ObjectId;
  rating: number;
  comment?: string;
  createdAt: Date;
  updatedAt: Date;
}

const ReviewSchema = new Schema<IReview>(
  {
    booking: { type: Schema.Types.ObjectId, ref: 'Booking', required: true, index: true },
    ride: { type: Schema.Types.ObjectId, ref: 'Ride', required: true },
    reviewer: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    reviewerRole: { type: String, enum: ['CUSTOMER', 'DRIVER'], required: true },
    targetUser: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    rating: { type: Number, required: true, min: 1, max: 5 },
    comment: { type: String, default: '', trim: true },
  },
  { timestamps: true }
);

ReviewSchema.index({ booking: 1, reviewer: 1 }, { unique: true });

export const Review = mongoose.model<IReview>('Review', ReviewSchema);
