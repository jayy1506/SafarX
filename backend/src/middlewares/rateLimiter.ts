import rateLimit from 'express-rate-limit';
import { ENV } from '../config/env.js';

/**
 * Standard Global API Rate Limiter
 * 120 requests per minute per IP (relaxed in development)
 */
export const apiLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: ENV.NODE_ENV === 'development' ? 2000 : 120,
  standardHeaders: true, // Return rate limit info in `RateLimit-*` headers
  legacyHeaders: false, // Disable `X-RateLimit-*` headers
  message: {
    success: false,
    message: 'Too many requests from this IP. Please wait a moment before retrying.',
  },
});

/**
 * Strict Rate Limiter for Authentication & OTP Endpoints
 * Relaxed in development so tests/page reloads never lock out the developer
 * In production: skips /me and /switch-demo
 */
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: ENV.NODE_ENV === 'development' ? 2000 : 30,
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => {
    if (ENV.NODE_ENV === 'development') return true;
    const path = req.path || '';
    return path === '/me' || path.startsWith('/switch-demo');
  },
  message: {
    success: false,
    message: 'Too many authentication attempts. Please try again after 15 minutes.',
  },
});

/**
 * Ride Booking & Seat Hold Rate Limiter
 * 30 attempts per 5 minutes
 */
export const bookingLimiter = rateLimit({
  windowMs: 5 * 60 * 1000, // 5 minutes
  max: ENV.NODE_ENV === 'development' ? 1000 : 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: 'High booking activity detected. Please wait a moment.',
  },
});
