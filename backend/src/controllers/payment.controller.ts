import { Request, Response } from 'express';
import { RazorpayService } from '../services/razorpay.service.js';
import { Payment } from '../models/Payment.js';
import { Booking } from '../models/Booking.js';
import { SegmentEngine } from '../services/segmentEngine.js';
import { logger } from '../utils/logger.js';

export class PaymentController {
  /**
   * @route   POST /api/v1/payments/webhook
   * @desc    Verifies and processes incoming Razorpay webhooks
   * @access  Public (Signature Verified)
   */
  static async handleWebhook(req: Request, res: Response): Promise<void> {
    const signature = req.headers['x-razorpay-signature'] as string;
    const rawBody = (req as any).rawBody || JSON.stringify(req.body);

    if (!signature) {
      logger.warn('[Razorpay Webhook] Missing x-razorpay-signature header');
      res.status(400).json({ success: false, message: 'Missing webhook signature' });
      return;
    }

    const isValid = RazorpayService.verifyWebhookSignature(rawBody, signature);

    if (!isValid) {
      logger.warn('[Razorpay Webhook] Invalid webhook cryptographic signature');
      res.status(400).json({ success: false, message: 'Invalid signature verification' });
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
   * @desc    Client checkout signature verification
   * @access  Private
   */
  static async verifyClientPayment(req: Request, res: Response): Promise<void> {
    const { razorpayOrderId, razorpayPaymentId, razorpaySignature } = req.body;

    if (!razorpayOrderId || !razorpayPaymentId || !razorpaySignature) {
      res.status(400).json({ success: false, message: 'Missing required payment verification parameters.' });
      return;
    }

    const isValid = RazorpayService.verifyClientSignature(razorpayOrderId, razorpayPaymentId, razorpaySignature);

    const payment = await Payment.findOne({ razorpayOrderId });
    if (!payment) {
      res.status(404).json({ success: false, message: 'Payment record not found.' });
      return;
    }

    if (!isValid) {
      payment.status = 'FAILED';
      payment.failureReason = 'Invalid cryptographic signature';
      await payment.save();
      res.status(400).json({ success: false, message: 'Payment signature verification failed.' });
      return;
    }

    payment.status = 'CAPTURED';
    payment.razorpayPaymentId = razorpayPaymentId;
    payment.razorpaySignature = razorpaySignature;
    await payment.save();

    const booking = await Booking.findById(payment.booking);
    if (booking) {
      booking.bookingStatus = 'CONFIRMED';
      booking.paymentStatus = 'SUCCESS';
      booking.payment = payment._id;
      await booking.save();

      await SegmentEngine.confirmHeldSeats(
        booking.ride,
        booking.pickupIndex,
        booking.dropIndex,
        booking.seatsBooked
      );
    }

    res.status(200).json({
      success: true,
      message: 'Payment verified and booking CONFIRMED.',
      booking,
      payment,
    });
  }

  /**
   * @route   GET /api/v1/payments/:id
   * @desc    Get payment receipt details
   * @access  Private
   */
  static async getPaymentDetails(req: Request, res: Response): Promise<void> {
    const payment = await Payment.findById(req.params.id)
      .populate('booking')
      .populate('customer', 'fullName email phone');

    if (!payment) {
      res.status(404).json({ success: false, message: 'Payment not found.' });
      return;
    }

    res.status(200).json({ success: true, payment });
  }
}
