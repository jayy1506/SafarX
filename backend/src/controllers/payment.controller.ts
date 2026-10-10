import { Request, Response } from 'express';
import { AuthRequest } from '../middlewares/auth.js';
import { RazorpayService } from '../services/razorpay.service.js';
import { Payment } from '../models/Payment.js';
import { Booking } from '../models/Booking.js';
import { SegmentEngine } from '../services/segmentEngine.js';
import { NotificationService } from '../services/notificationService.js';
import { logger } from '../utils/logger.js';

export class PaymentController {
  /**
   * @route   POST /api/v1/payments/webhook
   * @desc    Verifies and processes incoming Razorpay server-to-server webhooks
   * @access  Public (HMAC Verified)
   */
  static async handleWebhook(req: Request, res: Response): Promise<void> {
    const signature = req.headers['x-razorpay-signature'] as string;
    const rawBody = (req as any).rawBody || JSON.stringify(req.body);

    if (!signature) {
      logger.warn('[Razorpay Webhook] Missing x-razorpay-signature header');
      res.status(400).json({ success: false, message: 'Missing webhook signature header' });
      return;
    }

    const isValid = RazorpayService.verifyWebhookSignature(rawBody, signature);

    if (!isValid) {
      logger.warn('[Razorpay Webhook] Invalid webhook cryptographic signature');
      res.status(400).json({ success: false, message: 'Invalid webhook signature' });
      return;
    }

    const event = req.body.event;
    const payload = req.body.payload;

    try {
      await RazorpayService.processWebhookEvent(event, payload);
      res.status(200).json({ status: 'ok', received: true });
    } catch (error: any) {
      logger.error({ error: error.message }, '[Razorpay Webhook] Error processing event');
      res.status(500).json({ status: 'error', message: error.message });
    }
  }

  /**
   * @route   POST /api/v1/payments/verify
   * @desc    Client checkout callback signature verification & authoritative booking confirmation
   * @access  Private (Authenticated Customer)
   */
  static async verifyClientPayment(req: AuthRequest, res: Response): Promise<void> {
    const { razorpayOrderId, razorpayPaymentId, razorpaySignature } = req.body;

    if (!razorpayOrderId || !razorpayPaymentId || !razorpaySignature) {
      res.status(400).json({ success: false, message: 'Missing required payment verification parameters.' });
      return;
    }

    const payment = await Payment.findOne({ razorpayOrderId });
    if (!payment) {
      res.status(404).json({ success: false, message: 'Payment record for this order not found.' });
      return;
    }

    // Object-level authorization check (IDOR protection)
    const isOwner = payment.customer.equals(req.user!._id);
    const isAdmin = req.user!.role === 'ADMIN';
    if (!isOwner && !isAdmin) {
      res.status(403).json({ success: false, message: 'Forbidden. You do not own this payment record.' });
      return;
    }

    // Idempotent return if already CAPTURED
    if (payment.status === 'CAPTURED') {
      const booking = await Booking.findById(payment.booking);
      res.status(200).json({
        success: true,
        message: 'Payment was already verified and captured.',
        booking,
        payment,
      });
      return;
    }

    // Cryptographic signature check
    const isValid = RazorpayService.verifyClientSignature(razorpayOrderId, razorpayPaymentId, razorpaySignature);

    if (!isValid) {
      payment.status = 'FAILED';
      payment.failureReason = 'Invalid cryptographic signature';
      await payment.save();

      // Release held seats on payment failure
      const booking = await Booking.findById(payment.booking);
      if (booking && booking.bookingStatus === 'PENDING_PAYMENT') {
        booking.paymentStatus = 'FAILED';
        await booking.save();
        await SegmentEngine.releaseHeldSeats(
          booking.ride,
          booking.pickupIndex,
          booking.dropIndex,
          booking.seatsBooked
        );
      }

      res.status(400).json({ success: false, message: 'Payment cryptographic verification failed.' });
      return;
    }

    payment.status = 'CAPTURED';
    payment.razorpayPaymentId = razorpayPaymentId;
    payment.razorpaySignature = razorpaySignature;
    await payment.save();

    const booking = await Booking.findById(payment.booking).populate('ride');
    if (booking) {
      booking.bookingStatus = 'CONFIRMED';
      booking.paymentStatus = 'SUCCESS';
      booking.payment = payment._id;
      await booking.save();

      await SegmentEngine.confirmHeldSeats(
        booking.ride._id || booking.ride,
        booking.pickupIndex,
        booking.dropIndex,
        booking.seatsBooked
      );

      const ride = booking.ride as any;
      if (ride?.driver) {
        await NotificationService.notifyBookingConfirmed(req.user!._id, ride.driver, booking);
      }
    }

    res.status(200).json({
      success: true,
      message: 'Payment verified and booking CONFIRMED 🎉',
      booking,
      payment,
    });
  }

  /**
   * @route   GET /api/v1/payments/:id
   * @desc    Get payment receipt & transaction details (with IDOR protection)
   * @access  Private
   */
  static async getPaymentDetails(req: AuthRequest, res: Response): Promise<void> {
    const payment = await Payment.findById(req.params.id)
      .populate('booking')
      .populate('customer', 'fullName email phone');

    if (!payment) {
      res.status(404).json({ success: false, message: 'Payment not found.' });
      return;
    }

    // Object-level authorization check (IDOR protection)
    const isOwner = (payment.customer as any)?._id
      ? (payment.customer as any)._id.equals(req.user!._id)
      : (payment.customer as any).equals(req.user!._id);

    const isAdmin = req.user!.role === 'ADMIN';

    if (!isOwner && !isAdmin) {
      res.status(403).json({ success: false, message: 'Forbidden. You do not have permission to view this receipt.' });
      return;
    }

    res.status(200).json({ success: true, payment });
  }
}
