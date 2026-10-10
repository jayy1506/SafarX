import { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger.js';

export class AppError extends Error {
  public statusCode: number;
  public isOperational: boolean;
  public errors?: any;

  constructor(message: string, statusCode = 500, errors?: any) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = true;
    this.errors = errors;
    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * Global Production Error Handler Middleware
 */
export function errorHandler(err: any, req: Request, res: Response, next: NextFunction): void {
  let statusCode = err.statusCode || 500;
  let message = err.message || 'Internal Server Error';
  let errors = err.errors;

  // Handle Mongoose Validation Error
  if (err.name === 'ValidationError' && err.errors) {
    statusCode = 400;
    message = 'Validation Failed';
    errors = Object.values(err.errors).map((e: any) => ({
      field: e.path,
      message: e.message,
    }));
  }

  // Handle Mongoose Bad ObjectId (CastError)
  if (err.name === 'CastError') {
    statusCode = 400;
    message = `Invalid resource identifier for field: ${err.path}`;
  }

  // Handle MongoDB Duplicate Key Error (E11000)
  if (err.code === 11000) {
    statusCode = 409;
    const duplicatedField = Object.keys(err.keyPattern || {})[0] || 'Field';
    message = `${duplicatedField} already exists in the system.`;
  }

  // Handle JWT Auth Errors
  if (err.name === 'JsonWebTokenError') {
    statusCode = 401;
    message = 'Invalid authentication token. Please log in again.';
  }
  if (err.name === 'TokenExpiredError') {
    statusCode = 401;
    message = 'Authentication token has expired. Please refresh your session.';
  }

  // Structured Logging via Pino
  logger.error({
    requestId: req.headers['x-request-id'] || (req as any).id,
    method: req.method,
    url: req.originalUrl || req.url,
    statusCode,
    userId: (req as any).user?._id || (req as any).user?.uid || null,
    errorMessage: err.message,
    errorName: err.name,
    stack: err.stack,
  }, `[Error] ${req.method} ${req.originalUrl || req.url} -> ${statusCode}: ${message}`);

  // Safe client response (no internal stack leak in production)
  res.status(statusCode).json({
    success: false,
    message,
    errors: errors || undefined,
    requestId: req.headers['x-request-id'] || (req as any).id,
    ...(process.env.NODE_ENV === 'development' ? { stack: err.stack } : {}),
  });
}

/**
 * 404 Route Not Found Handler
 */
export function notFoundHandler(req: Request, res: Response): void {
  logger.warn({
    method: req.method,
    url: req.originalUrl,
  }, `[404 Not Found] ${req.method} ${req.originalUrl}`);

  res.status(404).json({
    success: false,
    message: `Route not found: ${req.method} ${req.originalUrl}`,
    service: 'safarx-api',
  });
}
