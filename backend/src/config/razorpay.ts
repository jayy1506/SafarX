import Razorpay from 'razorpay';
import crypto from 'crypto';
import { ENV } from './env.js';

function createClient(): Razorpay {
  const key_id = process.env.RAZORPAY_KEY_ID || ENV.RAZORPAY_KEY_ID || 'rzp_test_placeholder';
  const key_secret = process.env.RAZORPAY_KEY_SECRET || ENV.RAZORPAY_KEY_SECRET || 'placeholder_secret';
  return new Razorpay({ key_id, key_secret });
}

export const razorpayClient: Razorpay = new Proxy({} as any, {
  get(target, prop, receiver) {
    const client = createClient() as any;
    const val = client[prop];
    return typeof val === 'function' ? val.bind(client) : val;
  },
  set(target, prop, value) {
    (target as any)[prop] = value;
    return true;
  },
});

/**
 * Server-side cryptographic signature verification for Razorpay payment captures.
 */
export function verifyRazorpaySignature(
  orderId: string,
  paymentId: string,
  signature: string
): boolean {
  if (!orderId || !paymentId || !signature) return false;
  
  try {
    const secret = process.env.RAZORPAY_KEY_SECRET || ENV.RAZORPAY_KEY_SECRET;
    const body = `${orderId}|${paymentId}`;
    const expectedSignature = crypto
      .createHmac('sha256', secret)
      .update(body)
      .digest('hex');

    const expectedBuf = Buffer.from(expectedSignature, 'utf8');
    const actualBuf = Buffer.from(signature, 'utf8');
    return expectedBuf.length === actualBuf.length && crypto.timingSafeEqual(expectedBuf, actualBuf);
  } catch {
    return false;
  }
}
