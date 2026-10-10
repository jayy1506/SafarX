import mongoose, { Schema, Document, Types } from 'mongoose';

export type BookingStatus =
  | 'PENDING_PAYMENT'
  | 'CONFIRMED'
  | 'BOARDED'
  | 'NO_SHOW'
  | 'CANCELLED_BY_CUSTOMER'
  | 'CANCELLED_BY_DRIVER'
  | 'COMPLETED';

export type PaymentStatus =
  | 'PENDING'
  | 'SUCCESS'
  | 'FAILED'
  | 'REFUNDED'
  | 'PARTIALLY_REFUNDED';

export interface IBooking extends Document {
  bookingNumber: string;
  customer: Types.ObjectId;
  ride: Types.ObjectId;
  pickupStop: string;
  pickupIndex: number;
  dropStop: string;
  dropIndex: number;
  timeSlot?: string;
  rideRequest?: Types.ObjectId;
  seatsBooked: number;
  farePerSeat: number;
  subtotal: number;
  platformCommission: number;
  driverEarnings: number;
  totalAmount: number;
  bookingStatus: BookingStatus;
  paymentStatus: PaymentStatus;
  payment?: Types.ObjectId;
  holdExpiresAt: Date;
  boardingOtp: string;
  boardedAt?: Date;
  cancellation?: {
    cancelledAt: Date;
    cancelledBy: 'CUSTOMER' | 'DRIVER' | 'ADMIN' | 'SYSTEM';
    reason: string;
    refundAmount: number;
    penaltyAmount: number;
    refundStatus: 'NOT_APPLICABLE' | 'INITIATED' | 'COMPLETED' | 'FAILED';
  };
  createdAt: Date;
  updatedAt: Date;
}

const BookingSchema = new Schema<IBooking>(
  {
    bookingNumber: { type: String, required: true, unique: true, uppercase: true },
    customer: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    ride: { type: Schema.Types.ObjectId, ref: 'Ride', required: true, index: true },
    pickupStop: { type: String, required: true },
    pickupIndex: { type: Number, required: true },
    dropStop: { type: String, required: true },
    dropIndex: { type: Number, required: true },
    timeSlot: { type: String },
    rideRequest: { type: Schema.Types.ObjectId, ref: 'RideRequest' },
    seatsBooked: { type: Number, required: true, min: 1, max: 6, default: 1 },
    farePerSeat: { type: Number, required: true },
    subtotal: { type: Number, required: true },
    platformCommission: { type: Number, required: true, default: 0 },
    driverEarnings: { type: Number, required: true, default: 0 },
    totalAmount: { type: Number, required: true },
    bookingStatus: {
      type: String,
      enum: [
        'PENDING_PAYMENT',
        'CONFIRMED',
        'BOARDED',
        'NO_SHOW',
        'CANCELLED_BY_CUSTOMER',
        'CANCELLED_BY_DRIVER',
        'COMPLETED',
      ],
      default: 'PENDING_PAYMENT',
      index: true,
    },
    paymentStatus: {
      type: String,
      enum: ['PENDING', 'SUCCESS', 'FAILED', 'REFUNDED', 'PARTIALLY_REFUNDED'],
      default: 'PENDING',
      index: true,
    },
    payment: { type: Schema.Types.ObjectId, ref: 'Payment' },
    holdExpiresAt: { type: Date, required: true },
    boardingOtp: { type: String, required: true },
    boardedAt: { type: Date },
    cancellation: {
      cancelledAt: { type: Date },
      cancelledBy: { type: String, enum: ['CUSTOMER', 'DRIVER', 'ADMIN', 'SYSTEM'] },
      reason: { type: String, default: '' },
      refundAmount: { type: Number, default: 0 },
      penaltyAmount: { type: Number, default: 0 },
      refundStatus: {
        type: String,
        enum: ['NOT_APPLICABLE', 'INITIATED', 'COMPLETED', 'FAILED'],
        default: 'NOT_APPLICABLE',
      },
    },
  },
  { timestamps: true }
);

// High performance compound indexes
BookingSchema.index({ customer: 1, bookingStatus: 1, createdAt: -1 });
BookingSchema.index({ ride: 1, bookingStatus: 1 });
BookingSchema.index({ ride: 1, boardingOtp: 1, bookingStatus: 1 });
BookingSchema.index({ bookingStatus: 1, holdExpiresAt: 1 });
BookingSchema.index({ paymentStatus: 1, createdAt: -1 });

export const Booking = mongoose.model<IBooking>('Booking', BookingSchema);

