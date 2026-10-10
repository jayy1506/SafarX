import { RazorpayService } from './razorpay.service.js';
import { IBooking } from '../models/Booking.js';
import { Payment } from '../models/Payment.js';

export class PaymentService {
  /**
   * Creates a Razorpay Order for a pending booking via RazorpayService
   */
  static async createOrder(booking: IBooking) {
    return RazorpayService.createOrder(booking);
  }

  /**
   * Cryptographically verifies Razorpay payment completion
   */
  static async verifyAndCapturePayment(
    bookingId: string,
    razorpayOrderId: string,
    razorpayPaymentId: string,
    razorpaySignature: string
  ) {
    const isValid = RazorpayService.verifyClientSignature(razorpayOrderId, razorpayPaymentId, razorpaySignature);

    const payment = await Payment.findOne({ razorpayOrderId });
    if (!payment) {
      throw new Error('Payment record for this order not found');
    }

    if (!isValid) {
      payment.status = 'FAILED';
      payment.failureReason = 'Invalid cryptographic signature';
      await payment.save();
      return { success: false, message: 'Signature verification failed' };
    }

    payment.status = 'CAPTURED';
    payment.razorpayPaymentId = razorpayPaymentId;
    payment.razorpaySignature = razorpaySignature;
    await payment.save();

    return { success: true, payment };
  }
}
