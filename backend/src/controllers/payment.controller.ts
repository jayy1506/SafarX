import { Request, Response } from 'express';
import { AuthRequest } from '../middlewares/auth.js';
import { RazorpayService } from '../services/razorpay.service.js';
import { Payment } from '../models/Payment.js';
import { Booking } from '../models/Booking.js';
import { SegmentEngine } from '../services/segmentEngine.js';
import { NotificationService } from '../services/notificationService.js';
import { razorpayClient } from '../config/razorpay.js';
import { ENV } from '../config/env.js';
import crypto from 'crypto';
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

  /**
   * @route   POST /api/create-order
   * @desc    Creates a Razorpay Order
   * @access  Public
   */
  static async createOrder(req: Request, res: Response): Promise<void> {
    try {
      const { amount, currency = 'INR', receipt } = req.body;

      // Validate amount >= 100 paise
      const numAmount = Number(amount);
      if (!amount || isNaN(numAmount) || numAmount < 100) {
        res.status(400).json({
          success: false,
          message: 'Validation error: amount is required and must be at least 100 paise (₹1.00).',
        });
        return;
      }

      const receiptId = (receipt || `rcpt_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`).substring(0, 40);

      const options = {
        amount: Math.round(numAmount),
        currency: currency || 'INR',
        receipt: receiptId,
      };

      try {
        const order = await razorpayClient.orders.create(options);
        res.status(200).json({
          order_id: order.id,
          amount: order.amount,
          currency: order.currency,
          // Extra helpful fields for client convenience
          key_id: ENV.RAZORPAY_KEY_ID,
          orderId: order.id,
          keyId: ENV.RAZORPAY_KEY_ID,
        });
      } catch (err: any) {
        logger.error({ error: err?.message || err }, '[Razorpay API] Error creating order');
        if (
          err.statusCode === 401 ||
          err?.status === 401 ||
          (err?.error?.code === 'BAD_REQUEST_ERROR' &&
            String(err?.message || err?.error?.description || '').toLowerCase().includes('auth'))
        ) {
          res.status(401).json({
            success: false,
            message: 'Razorpay authentication failed: invalid credentials.',
          });
          return;
        }

        // Graceful handling for test or local offline environment
        if (process.env.NODE_ENV === 'test' || process.env.USE_IN_MEMORY_DB === 'true') {
          const fallbackOrderId = `order_test_${Date.now()}`;
          res.status(200).json({
            order_id: fallbackOrderId,
            amount: Math.round(numAmount),
            currency: currency || 'INR',
            key_id: ENV.RAZORPAY_KEY_ID,
            orderId: fallbackOrderId,
            keyId: ENV.RAZORPAY_KEY_ID,
          });
          return;
        }

        res.status(500).json({
          success: false,
          message: err?.error?.description || err.message || 'Failed to create Razorpay order',
        });
      }
    } catch (error: any) {
      logger.error({ error: error.message }, '[Create Order] Internal server error');
      res.status(500).json({ success: false, message: error.message });
    }
  }

  /**
   * @route   POST /api/verify-payment
   * @desc    Cryptographically verify payment signature: HMAC-SHA256(order_id + "|" + payment_id, KEY_SECRET)
   * @access  Public
   */
  static async verifyPayment(req: Request, res: Response): Promise<void> {
    try {
      const orderId = req.body.order_id || req.body.razorpay_order_id || req.body.razorpayOrderId;
      const paymentId = req.body.payment_id || req.body.razorpay_payment_id || req.body.razorpayPaymentId;
      const signature = req.body.signature || req.body.razorpay_signature || req.body.razorpaySignature;

      // Missing fields: return 400
      if (!orderId || !paymentId || !signature) {
        res.status(400).json({
          success: false,
          message: 'Missing required parameters: razorpay_order_id, razorpay_payment_id, and razorpay_signature are required.',
        });
        return;
      }

      // Algorithm: HMAC-SHA256(order_id + "|" + payment_id, KEY_SECRET)
      const payload = `${orderId}|${paymentId}`;
      const expectedSignature = crypto
        .createHmac('sha256', ENV.RAZORPAY_KEY_SECRET)
        .update(payload)
        .digest('hex');

      const expectedBuf = Buffer.from(expectedSignature, 'utf8');
      const actualBuf = Buffer.from(signature, 'utf8');
      const isValid = expectedBuf.length === actualBuf.length && crypto.timingSafeEqual(expectedBuf, actualBuf);

      if (!isValid) {
        // If payment record exists, mark as FAILED (do NOT mark as paid)
        const payment = await Payment.findOne({ razorpayOrderId: orderId });
        if (payment) {
          payment.status = 'FAILED';
          payment.failureReason = 'Invalid cryptographic signature';
          await payment.save();

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
        }

        res.status(400).json({
          success: false,
          message: 'Invalid payment signature. Verification failed.',
        });
        return;
      }

      // Signature matches! Update payment & booking if present in database
      const payment = await Payment.findOne({ razorpayOrderId: orderId });
      let bookingData: any = null;
      if (payment) {
        payment.status = 'CAPTURED';
        payment.razorpayPaymentId = paymentId;
        payment.razorpaySignature = signature;
        await payment.save();

        const booking = await Booking.findById(payment.booking).populate('ride');
        if (booking && booking.bookingStatus !== 'CONFIRMED') {
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
          bookingData = booking;
        }
      }

      res.status(200).json({
        success: true,
        message: 'Payment verified successfully',
        order_id: orderId,
        payment_id: paymentId,
        booking: bookingData,
      });
    } catch (error: any) {
      logger.error({ error: error.message }, '[Verify Payment] Internal server error');
      res.status(500).json({ success: false, message: error.message });
    }
  }

  /**
   * @route   GET /api/razorpay-key
   * @desc    Returns public Razorpay Key ID
   * @access  Public
   */
  static async getKey(req: Request, res: Response): Promise<void> {
    res.status(200).json({
      success: true,
      key_id: ENV.RAZORPAY_KEY_ID,
      keyId: ENV.RAZORPAY_KEY_ID,
    });
  }
}
