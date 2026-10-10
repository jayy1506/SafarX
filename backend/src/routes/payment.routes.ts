import { Router } from 'express';
import { PaymentController } from '../controllers/payment.controller.js';
import { authenticate } from '../middlewares/auth.js';

const router = Router();

/**
 * @route   POST /api/v1/payments/webhook
 * @desc    Razorpay Server-to-Server Webhook receiver
 * @access  Public (HMAC Verified)
 */
router.post('/webhook', PaymentController.handleWebhook);

/**
 * @route   POST /api/v1/payments/verify
 * @desc    Frontend Client Checkout callback verification
 * @access  Private
 */
router.post('/verify', authenticate, PaymentController.verifyClientPayment);

/**
 * @route   POST /api/v1/payments/create-order
 * @desc    Create Razorpay Order
 * @access  Public
 */
router.post('/create-order', PaymentController.createOrder);

/**
 * @route   POST /api/v1/payments/verify-payment
 * @desc    Verify payment cryptographic signature
 * @access  Public
 */
router.post('/verify-payment', PaymentController.verifyPayment);

/**
 * @route   GET /api/v1/payments/key
 * @desc    Get public Razorpay Key ID
 * @access  Public
 */
router.get('/key', PaymentController.getKey);

/**
 * @route   GET /api/v1/payments/:id
 * @desc    Get payment receipt & transaction details
 * @access  Private
 */
router.get('/:id', authenticate, PaymentController.getPaymentDetails);

export default router;
