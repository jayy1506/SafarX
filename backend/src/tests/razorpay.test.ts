import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'crypto';
import { setupTestDB, teardownTestDB, clearTestDB } from './setup.js';
import { RazorpayService } from '../services/razorpay.service.js';
import { ENV } from '../config/env.js';
import { WebhookEvent } from '../models/WebhookEvent.js';
import { Payment } from '../models/Payment.js';
import { Booking } from '../models/Booking.js';
import mongoose from 'mongoose';

before(async () => {
  await setupTestDB();
});

after(async () => {
  await teardownTestDB();
});

test('RazorpayService: verifies client payment signature cryptographically', () => {
  const orderId = 'order_test_998877';
  const paymentId = 'pay_test_112233';
  const secret = ENV.RAZORPAY_KEY_SECRET;

  const payload = `${orderId}|${paymentId}`;
  const validSignature = crypto
    .createHmac('sha256', secret)
    .update(payload)
    .digest('hex');

  // Valid signature should return true
  const isValid = RazorpayService.verifyClientSignature(orderId, paymentId, validSignature);
  assert.equal(isValid, true);

  // Tampered paymentId should return false
  const isInvalid = RazorpayService.verifyClientSignature(orderId, 'pay_tampered_id', validSignature);
  assert.equal(isInvalid, false);

  // Fake signature should return false
  const isFake = RazorpayService.verifyClientSignature(orderId, paymentId, 'sim_sig_valid');
  assert.equal(isFake, false, 'Simulated signatures must not be accepted');
});

test('RazorpayService: verifies webhook HMAC-SHA256 signature using raw body', () => {
  const rawBody = JSON.stringify({
    event: 'payment.captured',
    payload: { payment: { entity: { id: 'pay_123', amount: 4000 } } },
  });

  const secret = ENV.RAZORPAY_WEBHOOK_SECRET || 'test_webhook_secret_32_chars_long';
  process.env.RAZORPAY_WEBHOOK_SECRET = secret;
  ENV.RAZORPAY_WEBHOOK_SECRET = secret;

  const validSignature = crypto
    .createHmac('sha256', secret)
    .update(rawBody)
    .digest('hex');

  const isValid = RazorpayService.verifyWebhookSignature(rawBody, validSignature);
  assert.equal(isValid, true);

  const isInvalid = RazorpayService.verifyWebhookSignature(rawBody, 'invalid_sig');
  assert.equal(isValid, true);
  assert.equal(isInvalid, false);
});

test('RazorpayService: processes webhook events with strict idempotency', async () => {
  await clearTestDB();

  const customerId = new mongoose.Types.ObjectId();
  const rideId = new mongoose.Types.ObjectId();
  const bookingId = new mongoose.Types.ObjectId();
  const orderId = 'order_idempotent_test_01';
  const paymentId = 'pay_idempotent_test_01';
  const eventId = 'evt_test_unique_id_999';

  await Payment.create({
    booking: bookingId,
    customer: customerId,
    ride: rideId,
    razorpayOrderId: orderId,
    amount: 40,
    amountInPaise: 4000,
    status: 'CREATED',
  });

  const webhookPayload = {
    id: eventId,
    payment: {
      entity: {
        id: paymentId,
        order_id: orderId,
        amount: 4000,
        method: 'UPI',
      },
    },
  };

  // First webhook delivery
  await RazorpayService.processWebhookEvent('payment.captured', webhookPayload);

  const paymentAfter1 = await Payment.findOne({ razorpayOrderId: orderId });
  assert.equal(paymentAfter1?.status, 'CAPTURED');
  assert.equal(paymentAfter1?.razorpayPaymentId, paymentId);

  const eventRecords = await WebhookEvent.find({ eventId });
  assert.equal(eventRecords.length, 1);

  // Duplicate webhook delivery with same eventId
  await RazorpayService.processWebhookEvent('payment.captured', webhookPayload);

  // Ensure no duplicate records created
  const eventRecordsAfter = await WebhookEvent.find({ eventId });
  assert.equal(eventRecordsAfter.length, 1, 'Duplicate webhook event must be skipped idempotently');
});
