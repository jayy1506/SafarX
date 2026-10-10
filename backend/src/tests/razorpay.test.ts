import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'crypto';
import { setupTestDB, teardownTestDB, clearTestDB } from './setup.js';
import { RazorpayService } from '../services/razorpay.service.js';
import { PaymentController } from '../controllers/payment.controller.js';
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

test('PaymentController.createOrder: rejects amount less than 100 paise', async () => {
  let statusCode = 0;
  let responseData: any = null;

  const mockReq: any = { body: { amount: 50 } };
  const mockRes: any = {
    status(code: number) {
      statusCode = code;
      return this;
    },
    json(data: any) {
      responseData = data;
      return this;
    },
  };

  await PaymentController.createOrder(mockReq, mockRes);
  assert.equal(statusCode, 400);
  assert.equal(responseData.success, false);
});

test('PaymentController.createOrder: creates live Razorpay order for >= 100 paise', async () => {
  let statusCode = 0;
  let responseData: any = null;

  const mockReq: any = { body: { amount: 1500, currency: 'INR', receipt: 'test_rcpt_001' } };
  const mockRes: any = {
    status(code: number) {
      statusCode = code;
      return this;
    },
    json(data: any) {
      responseData = data;
      return this;
    },
  };

  await PaymentController.createOrder(mockReq, mockRes);
  assert.equal(statusCode, 200);
  assert.ok(responseData.order_id);
  assert.equal(responseData.amount, 1500);
  assert.equal(responseData.currency, 'INR');
});

test('PaymentController.verifyPayment: returns 400 on missing parameters', async () => {
  let statusCode = 0;
  let responseData: any = null;

  const mockReq: any = { body: { order_id: 'ord_123' } };
  const mockRes: any = {
    status(code: number) {
      statusCode = code;
      return this;
    },
    json(data: any) {
      responseData = data;
      return this;
    },
  };

  await PaymentController.verifyPayment(mockReq, mockRes);
  assert.equal(statusCode, 400);
  assert.equal(responseData.success, false);
});

test('PaymentController.verifyPayment: returns 400 on signature mismatch', async () => {
  let statusCode = 0;
  let responseData: any = null;

  const mockReq: any = {
    body: {
      order_id: 'order_test_123',
      payment_id: 'pay_test_456',
      signature: 'invalid_sha256_signature_hex',
    },
  };
  const mockRes: any = {
    status(code: number) {
      statusCode = code;
      return this;
    },
    json(data: any) {
      responseData = data;
      return this;
    },
  };

  await PaymentController.verifyPayment(mockReq, mockRes);
  assert.equal(statusCode, 400);
  assert.equal(responseData.success, false);
});

test('PaymentController.verifyPayment: verifies valid HMAC-SHA256 signature', async () => {
  let statusCode = 0;
  let responseData: any = null;

  const orderId = 'order_test_valid_888';
  const paymentId = 'pay_test_valid_888';
  const validSignature = crypto
    .createHmac('sha256', ENV.RAZORPAY_KEY_SECRET)
    .update(`${orderId}|${paymentId}`)
    .digest('hex');

  const mockReq: any = {
    body: {
      razorpay_order_id: orderId,
      razorpay_payment_id: paymentId,
      razorpay_signature: validSignature,
    },
  };
  const mockRes: any = {
    status(code: number) {
      statusCode = code;
      return this;
    },
    json(data: any) {
      responseData = data;
      return this;
    },
  };

  await PaymentController.verifyPayment(mockReq, mockRes);
  assert.equal(statusCode, 200);
  assert.equal(responseData.success, true);
  assert.equal(responseData.order_id, orderId);
  assert.equal(responseData.payment_id, paymentId);
});
