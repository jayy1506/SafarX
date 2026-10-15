import crypto from 'crypto';
import { razorpayClient } from '../config/razorpay.js';
import { ENV } from '../config/env.js';
import { IBooking, Booking } from '../models/Booking.js';
import { Payment } from '../models/Payment.js';
import { WebhookEvent } from '../models/WebhookEvent.js';
import { AuditLog } from '../models/AuditLog.js';
import { SegmentEngine } from './segmentEngine.js';
import { logger } from '../utils/logger.js';

export class RazorpayService {
  /**
   * Generates Razorpay Order for a pending booking.
   * Associates with Payment record and uses exact integer paise.
   */
  static async createOrder(booking: IBooking) {
    const amountInPaise = Math.round(booking.totalAmount * 100);
    const receipt = `rcpt_${booking.bookingNumber.toLowerCase().replace(/[^a-z0-9]/g, '_')}`;

    try {
      const options = {
        amount: amountInPaise,
        currency: 'INR',
        receipt: receipt.substring(0, 40),
        notes: {
          bookingId: booking._id.toString(),
          bookingNumber: booking.bookingNumber,
          pickupStop: booking.pickupStop,
          dropStop: booking.dropStop,
          seatsBooked: String(booking.seatsBooked),
        },
      };

      const currentKeyId = process.env.RAZORPAY_KEY_ID || ENV.RAZORPAY_KEY_ID || '';
      let order: any;
      try {
        order = await razorpayClient.orders.create(options);
      } catch (err: any) {
        if (ENV.IS_PRODUCTION && ENV.RAZORPAY_MODE === 'live' && currentKeyId && !currentKeyId.startsWith('rzp_test_')) {
          logger.error({ error: err?.message }, '[Razorpay API] Live order creation failed');
          throw new Error(`Razorpay gateway error: ${err?.message || 'Failed to create order'}`);
        } else {
          logger.warn({ error: err?.message }, '[Razorpay API Order] Creating sandbox test order fallback on Render/test environment');
          order = {
            id: `order_test_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
            entity: 'order',
            amount: amountInPaise,
            currency: 'INR',
            receipt: options.receipt,
            status: 'created',
          };
        }
      }

      // Check for existing pending payment record on this booking
      let paymentRecord = await Payment.findOne({ booking: booking._id, status: 'CREATED' });
      if (paymentRecord) {
        paymentRecord.razorpayOrderId = order.id;
        paymentRecord.amount = booking.totalAmount;
        paymentRecord.amountInPaise = amountInPaise;
        paymentRecord.gatewayResponse = order;
        await paymentRecord.save();
      } else {
        paymentRecord = await Payment.create({
          booking: booking._id,
          customer: booking.customer,
          ride: booking.ride,
          razorpayOrderId: order.id,
          amount: booking.totalAmount,
          amountInPaise,
          currency: 'INR',
          method: 'UPI',
          status: 'CREATED',
          gatewayResponse: order,
        });
      }

      // Record Audit Log
      await AuditLog.create({
        action: 'BOOKING_CREATED',
        performedBy: booking.customer,
        targetEntity: 'Payment',
        targetId: paymentRecord._id.toString(),
        details: {
          orderId: order.id,
          amountInPaise,
          bookingNumber: booking.bookingNumber,
        },
      });

      return {
        orderId: order.id,
        amount: amountInPaise, // in paise for Razorpay Checkout
        amountInRupees: booking.totalAmount,
        currency: 'INR',
        keyId: currentKeyId,
        key_id: currentKeyId,
        paymentRecordId: paymentRecord._id,
      };
    } catch (error: any) {
      logger.error({ error: error.message }, 'Failed to create Razorpay Order');
      throw new Error(`Payment Order Generation Failed: ${error.message}`);
    }
  }

  /**
   * Cryptographically verify Webhook HMAC SHA256 Signature using raw request body
   */
  static verifyWebhookSignature(rawBody: string | Buffer, signature: string): boolean {
    if (!signature || !ENV.RAZORPAY_WEBHOOK_SECRET) {
      return false;
    }

    try {
      const expectedSignature = crypto
        .createHmac('sha256', ENV.RAZORPAY_WEBHOOK_SECRET)
        .update(rawBody)
        .digest('hex');

      const expectedBuf = Buffer.from(expectedSignature, 'utf8');
      const actualBuf = Buffer.from(signature, 'utf8');
      return expectedBuf.length === actualBuf.length && crypto.timingSafeEqual(expectedBuf, actualBuf);
    } catch (err: any) {
      logger.warn({ error: err.message }, 'Webhook signature timing validation error');
      return false;
    }
  }

  /**
   * Cryptographically verify Client Checkout Signature: HMAC-SHA256(order_id + "|" + payment_id, secret)
   */
  static verifyClientSignature(orderId: string, paymentId: string, signature: string): boolean {
    if (!orderId || !paymentId || !signature) return false;

    try {
      const secret = (process.env.RAZORPAY_KEY_SECRET || ENV.RAZORPAY_KEY_SECRET || '').trim().replace(/^["']|["']$/g, '');
      const payload = `${orderId}|${paymentId}`;
      const expectedSignature = crypto
        .createHmac('sha256', secret)
        .update(payload)
        .digest('hex');

      const expectedBuf = Buffer.from(expectedSignature, 'utf8');
      const actualBuf = Buffer.from(signature, 'utf8');
      return expectedBuf.length === actualBuf.length && crypto.timingSafeEqual(expectedBuf, actualBuf);
    } catch {
      return false;
    }
  }

  /**
   * Process Verified Razorpay Webhook Event with strict idempotency protection
   */
  static async processWebhookEvent(event: string, payload: any) {
    // 1. Idempotency Check using WebhookEvent
    const eventId = payload?.id || `${event}_${payload?.payment?.entity?.id || payload?.order?.entity?.id || Date.now()}`;

    const existingEvent = await WebhookEvent.findOne({ eventId });
    if (existingEvent) {
      logger.info({ eventId, event }, '[Razorpay Webhook] Duplicate event already processed. Skipping idempotently.');
      return;
    }

    logger.info({ event, eventId }, '[Razorpay Webhook] Processing verified event');

    try {
      switch (event) {
        case 'payment.captured':
        case 'order.paid': {
          const paymentEntity = payload.payment?.entity || payload;
          const orderId = paymentEntity.order_id || payload.order?.entity?.id;
          const paymentId = paymentEntity.id;

          if (!orderId) {
            logger.warn('[Razorpay Webhook] No order_id found in payment payload');
            break;
          }

          const payment = await Payment.findOne({ razorpayOrderId: orderId });
          if (!payment) {
            logger.warn({ orderId }, '[Razorpay Webhook] Associated Payment record not found');
            break;
          }

          if (payment.status === 'CAPTURED') {
            logger.info({ orderId }, '[Razorpay Webhook] Payment already marked CAPTURED');
            break;
          }

          payment.status = 'CAPTURED';
          payment.razorpayPaymentId = paymentId;
          payment.method = paymentEntity.method || 'UPI';
          payment.gatewayResponse = paymentEntity;
          await payment.save();

          const booking = await Booking.findById(payment.booking);
          if (booking && booking.bookingStatus !== 'CONFIRMED' && booking.bookingStatus !== 'COMPLETED') {
            booking.bookingStatus = 'CONFIRMED';
            booking.paymentStatus = 'SUCCESS';
            booking.payment = payment._id;
            await booking.save();

            // Lock seats in segment matrix
            await SegmentEngine.confirmHeldSeats(
              booking.ride,
              booking.pickupIndex,
              booking.dropIndex,
              booking.seatsBooked
            );

            logger.info({ bookingNumber: booking.bookingNumber }, 'Booking confirmed via Webhook');
          }

          await AuditLog.create({
            action: 'PAYMENT_CAPTURED',
            targetEntity: 'Payment',
            targetId: payment._id.toString(),
            details: { orderId, paymentId, eventId },
          });

          break;
        }

        case 'payment.failed': {
          const paymentEntity = payload.payment?.entity || payload;
          const orderId = paymentEntity.order_id;

          if (orderId) {
            const payment = await Payment.findOne({ razorpayOrderId: orderId });
            if (payment) {
              payment.status = 'FAILED';
              payment.failureReason = paymentEntity.error_description || 'Payment Failed';
              payment.gatewayResponse = paymentEntity;
              await payment.save();

              const booking = await Booking.findById(payment.booking);
              if (booking && booking.bookingStatus === 'PENDING_PAYMENT') {
                booking.paymentStatus = 'FAILED';
                await booking.save();

                // Release held seats on payment failure
                await SegmentEngine.releaseHeldSeats(
                  booking.ride,
                  booking.pickupIndex,
                  booking.dropIndex,
                  booking.seatsBooked
                );
              }
            }
          }
          break;
        }

        case 'refund.processed': {
          const refundEntity = payload.refund?.entity || payload;
          const paymentId = refundEntity.payment_id;

          if (paymentId) {
            const payment = await Payment.findOne({ razorpayPaymentId: paymentId });
            if (payment) {
              payment.status = 'REFUNDED';
              payment.refundId = refundEntity.id;
              payment.refundAmount = refundEntity.amount ? refundEntity.amount / 100 : payment.amount;
              payment.refundAmountInPaise = refundEntity.amount || payment.amountInPaise;
              await payment.save();

              await AuditLog.create({
                action: 'REFUND_PROCESSED',
                targetEntity: 'Payment',
                targetId: payment._id.toString(),
                details: { refundId: refundEntity.id, amount: payment.refundAmount },
              });
            }
          }
          break;
        }

        default:
          logger.info({ event }, '[Razorpay Webhook] Event logged without mutation');
          break;
      }

      // Record processed event to prevent duplicate replays
      await WebhookEvent.create({
        eventId,
        eventType: event,
        payload,
        status: 'PROCESSED',
      });
    } catch (err: any) {
      await WebhookEvent.create({
        eventId,
        eventType: event,
        payload,
        status: 'FAILED',
        errorMessage: err.message,
      });
      throw err;
    }
  }

  /**
   * Process refund request through Razorpay API
   */
  static async processRefund(payment: any, refundAmountRupees: number, notes: Record<string, string> = {}) {
    const refundAmountPaise = Math.round(refundAmountRupees * 100);

    try {
      if (!payment.razorpayPaymentId) {
        return { success: true, simulated: true, refundId: `rfnd_sim_${Date.now()}` };
      }

      let razorpayRefund: any;
      try {
        razorpayRefund = await (razorpayClient.payments as any).refund(payment.razorpayPaymentId, {
          amount: refundAmountPaise,
          notes,
        });
      } catch (err: any) {
        if (ENV.IS_PRODUCTION) {
          throw err;
        }
        razorpayRefund = {
          id: `rfnd_test_${Date.now()}`,
          amount: refundAmountPaise,
          status: 'processed',
        };
      }

      payment.status = 'REFUNDED';
      payment.refundId = razorpayRefund.id;
      payment.refundAmount = refundAmountRupees;
      payment.refundAmountInPaise = refundAmountPaise;
      await payment.save();

      return { success: true, refundId: razorpayRefund.id, amount: refundAmountRupees };
    } catch (err: any) {
      logger.error({ error: err.message }, '[Razorpay Refund Error]');
      throw new Error(`Refund failed: ${err.message}`);
    }
  }
}
