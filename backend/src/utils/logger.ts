import pino from 'pino';
import { pinoHttp } from 'pino-http';
import crypto from 'crypto';
import { Request, Response } from 'express';

const isDev = process.env.NODE_ENV !== 'production';

// Sensitive keys to strictly redact from all logs
const REDACT_PATHS = [
  'req.headers.authorization',
  'req.headers.cookie',
  '*.password',
  '*.newPassword',
  '*.currentPassword',
  '*.otp',
  '*.boardingOtp',
  '*.token',
  '*.idToken',
  '*.refreshToken',
  '*.jwt',
  '*.secret',
  '*.razorpaySecret',
  '*.razorpay_signature',
  '*.private_key',
  '*.cardNumber',
  '*.card_number',
  '*.cvv',
  '*.pan',
  '*.aadhaar',
];

export const logger = pino({
  level: process.env.LOG_LEVEL || (isDev ? 'debug' : 'info'),
  redact: {
    paths: REDACT_PATHS,
    censor: '[REDACTED_SECRET]',
  },
  timestamp: pino.stdTimeFunctions.isoTime,
  base: {
    service: 'safarx-api',
    env: process.env.NODE_ENV || 'development',
  },
});

/**
 * Express HTTP Request Logging Middleware (Pino-HTTP)
 */
export const httpLogger = pinoHttp({
  logger,
  genReqId: (req: Request) => (req.headers['x-request-id'] as string) || crypto.randomUUID(),
  customLogLevel: (req: Request, res: Response, err?: Error) => {
    if (res.statusCode >= 500 || err) return 'error';
    if (res.statusCode >= 400) return 'warn';
    return 'info';
  },
  customProps: (req: Request) => {
    const user = (req as any).user;
    return {
      userId: user?._id || user?.id || user?.uid || null,
      userRole: user?.role || null,
    };
  },
  customSuccessMessage: (req: Request, res: Response, responseTime: number) => {
    return `${req.method} ${req.originalUrl || req.url} -> ${res.statusCode} (${Math.round(responseTime)}ms)`;
  },
  customErrorMessage: (req: Request, res: Response, err: Error) => {
    return `${req.method} ${req.originalUrl || req.url} FAILED -> ${res.statusCode}: ${err.message}`;
  },
});
