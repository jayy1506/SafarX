import mongoose, { Schema, Document, Types } from 'mongoose';

export type PaymentRecordStatus = 'CREATED' | 'AUTHORIZED' | 'CAPTURED' | 'FAILED' | 'REFUNDED';

export interface IPayment extends Document {
  booking: Types.ObjectId;
  customer: Types.ObjectId;
  ride: Types.ObjectId;
  razorpayOrderId: string;
  razorpayPaymentId?: string;
  razorpaySignature?: string;
  amount: number; // in INR
  currency: string;
  method: string;
  status: PaymentRecordStatus;
  gatewayResponse?: Record<string, any>;
  refundId?: string;
  refundAmount?: number;
  failureReason?: string;
  createdAt: Date;
  updatedAt: Date;
}

const PaymentSchema = new Schema<IPayment>(
  {
    booking: { type: Schema.Types.ObjectId, ref: 'Booking', required: true, index: true },
    customer: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    ride: { type: Schema.Types.ObjectId, ref: 'Ride', required: true },
    razorpayOrderId: { type: String, required: true, unique: true },
    razorpayPaymentId: { type: String },
    razorpaySignature: { type: String },
    amount: { type: Number, required: true },
    currency: { type: String, default: 'INR' },
    method: { type: String, default: 'UPI' },
    status: {
      type: String,
      enum: ['CREATED', 'AUTHORIZED', 'CAPTURED', 'FAILED', 'REFUNDED'],
      default: 'CREATED',
      index: true,
    },
    gatewayResponse: { type: Schema.Types.Mixed },
    refundId: { type: String },
    refundAmount: { type: Number, default: 0 },
    failureReason: { type: String },
  },
  { timestamps: true }
);

// Compound indexes for financial lookups and reconciliation
PaymentSchema.index({ customer: 1, status: 1, createdAt: -1 });
PaymentSchema.index({ booking: 1, status: 1 });
PaymentSchema.index({ razorpayPaymentId: 1 }, { sparse: true });

export const Payment = mongoose.model<IPayment>('Payment', PaymentSchema);


