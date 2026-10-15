import { Request, Response, NextFunction } from 'express';
import rateLimit from 'express-rate-limit';
import { Ratelimit } from '@upstash/ratelimit';
import { redis } from '../config/upstash.js';
import { ENV } from '../config/env.js';
import { logger } from '../utils/logger.js';

// Fallback in-memory rate limiters for tests or when Upstash is unreachable
const memoryApiLimiter = rateLimit({
  windowMs: 1 * 60 * 1000,
  max: ENV.NODE_ENV === 'development' ? 2000 : 120,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: 'Too many requests from this IP. Please wait a moment before retrying.',
  },
});

const memoryAuthLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
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

const memoryBookingLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  max: ENV.NODE_ENV === 'development' ? 1000 : 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: 'High booking activity detected. Please wait a moment.',
  },
});

// Upstash Distributed Rate Limiters
let upstashApiRatelimit: Ratelimit | null = null;
let upstashAuthRatelimit: Ratelimit | null = null;
let upstashBookingRatelimit: Ratelimit | null = null;

try {
  if (ENV.UPSTASH_REDIS_REST_URL && ENV.UPSTASH_REDIS_REST_TOKEN && ENV.NODE_ENV !== 'test') {
    upstashApiRatelimit = new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(ENV.NODE_ENV === 'development' ? 2000 : 120, '1 m'),
      analytics: true,
      prefix: 'safarx:ratelimit:api',
    });

    upstashAuthRatelimit = new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(ENV.NODE_ENV === 'development' ? 2000 : 30, '15 m'),
      analytics: true,
      prefix: 'safarx:ratelimit:auth',
    });

    upstashBookingRatelimit = new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(ENV.NODE_ENV === 'development' ? 1000 : 30, '5 m'),
      analytics: true,
      prefix: 'safarx:ratelimit:booking',
    });
  }
} catch (err: any) {
  logger.warn({ error: err.message }, '[Upstash Ratelimit] Failed to initialize Upstash ratelimiters, falling back to memory');
}

function getClientIdentifier(req: Request): string {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string') {
    return forwarded.split(',')[0].trim();
  }
  if (Array.isArray(forwarded)) {
    return forwarded[0].trim();
  }
  return req.ip || req.socket.remoteAddress || '127.0.0.1';
}

/**
 * Standard Global API Rate Limiter
 * Distributed Upstash Redis sliding window (with graceful in-memory fallback)
 */
export const apiLimiter = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  if (ENV.NODE_ENV === 'test' || !upstashApiRatelimit) {
    return memoryApiLimiter(req, res, next);
  }

  try {
    const identifier = getClientIdentifier(req);
    const { success, limit, remaining, reset } = await upstashApiRatelimit.limit(identifier);

    res.setHeader('RateLimit-Limit', limit.toString());
    res.setHeader('RateLimit-Remaining', remaining.toString());
    res.setHeader('RateLimit-Reset', reset.toString());

    if (!success) {
      res.status(429).json({
        success: false,
        message: 'Too many requests from this IP. Please wait a moment before retrying.',
        retryAfter: Math.ceil((reset - Date.now()) / 1000),
      });
      return;
    }

    next();
  } catch (error: any) {
    logger.warn({ error: error.message }, '[Upstash Ratelimit] Falling back to memory limiter for API');
    return memoryApiLimiter(req, res, next);
  }
};

/**
 * Strict Rate Limiter for Authentication & OTP Endpoints
 */
export const authLimiter = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  if (ENV.NODE_ENV === 'development') {
    return next();
  }
  if (ENV.NODE_ENV === 'test' || !upstashAuthRatelimit) {
    return memoryAuthLimiter(req, res, next);
  }

  const path = req.path || '';
  if (path === '/me' || path.startsWith('/switch-demo')) {
    return next();
  }

  try {
    const identifier = getClientIdentifier(req);
    const { success, limit, remaining, reset } = await upstashAuthRatelimit.limit(`auth_${identifier}`);

    res.setHeader('RateLimit-Limit', limit.toString());
    res.setHeader('RateLimit-Remaining', remaining.toString());
    res.setHeader('RateLimit-Reset', reset.toString());

    if (!success) {
      res.status(429).json({
        success: false,
        message: 'Too many authentication attempts. Please try again after 15 minutes.',
        retryAfter: Math.ceil((reset - Date.now()) / 1000),
      });
      return;
    }

    next();
  } catch (error: any) {
    logger.warn({ error: error.message }, '[Upstash Ratelimit] Falling back to memory limiter for Auth');
    return memoryAuthLimiter(req, res, next);
  }
};

/**
 * Ride Booking & Seat Hold Rate Limiter
 */
export const bookingLimiter = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  if (ENV.NODE_ENV === 'test' || !upstashBookingRatelimit) {
    return memoryBookingLimiter(req, res, next);
  }

  try {
    const identifier = getClientIdentifier(req);
    const { success, limit, remaining, reset } = await upstashBookingRatelimit.limit(`booking_${identifier}`);

    res.setHeader('RateLimit-Limit', limit.toString());
    res.setHeader('RateLimit-Remaining', remaining.toString());
    res.setHeader('RateLimit-Reset', reset.toString());

    if (!success) {
      res.status(429).json({
        success: false,
        message: 'High booking activity detected. Please wait a moment.',
        retryAfter: Math.ceil((reset - Date.now()) / 1000),
      });
      return;
    }

    next();
  } catch (error: any) {
    logger.warn({ error: error.message }, '[Upstash Ratelimit] Falling back to memory limiter for Booking');
    return memoryBookingLimiter(req, res, next);
  }
};
