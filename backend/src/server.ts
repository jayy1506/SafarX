import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { ENV, validateEnv } from './config/env.js';
import { connectDB, disconnectDB } from './config/db.js';
import { seedDatabase } from './seeders/seedData.js';
import { User } from './models/User.js';
import { SegmentEngine } from './services/segmentEngine.js';

import authRoutes from './routes/authRoutes.js';
import adminRoutes from './routes/adminRoutes.js';
import driverRoutes from './routes/driverRoutes.js';
import customerRoutes from './routes/customerRoutes.js';
import paymentRoutes from './routes/payment.routes.js';
import { PaymentController } from './controllers/payment.controller.js';
import healthRoutes from './routes/health.routes.js';
import { errorHandler, notFoundHandler } from './middlewares/errorHandler.js';
import { apiLimiter, authLimiter } from './middlewares/rateLimiter.js';
import { httpLogger, logger } from './utils/logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

// Security HTTP Headers
app.use(
  helmet({
    contentSecurityPolicy: false, // Allows Firebase CDN & Leaflet maps & Razorpay SDK
    crossOriginEmbedderPolicy: false,
  })
);

// Structured HTTP Request Logging
app.use(httpLogger);

// Allowed Production & Development Origins
const allowedOrigins = ENV.ALLOWED_ORIGINS;

app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (like mobile apps, curl, server-to-server webhooks)
      if (!origin || allowedOrigins.includes(origin) || ENV.NODE_ENV === 'development') {
        callback(null, true);
      } else {
        callback(new Error(`CORS blocked for origin: ${origin}`));
      }
    },
    credentials: true,
  })
);

// Body Parsers (with rawBody preservation for Razorpay webhook verification)
app.use(
  express.json({
    limit: '10mb',
    verify: (req: any, res, buf) => {
      req.rawBody = buf.toString();
    },
  })
);
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

if (ENV.NODE_ENV === 'development') {
  app.use(morgan('dev'));
}

// Static Frontend Directory
const possibleFrontendPaths = [
  path.resolve(__dirname, '../../frontend'),
  path.resolve(__dirname, '../frontend'),
  path.resolve(process.cwd(), 'frontend'),
  path.resolve(process.cwd(), '../frontend'),
];
const frontendDir = possibleFrontendPaths.find((p) => fs.existsSync(p)) || path.resolve(process.cwd(), 'frontend');

if (fs.existsSync(frontendDir)) {
  app.use(express.static(frontendDir));
}

// Health & Readiness Probes
app.use('/api/health', healthRoutes);
app.use('/health', healthRoutes);

// Apply Rate Limiters
app.use('/api/v1/auth', authLimiter);
app.use('/api/v1/payments', apiLimiter);
app.use('/api/v1', apiLimiter);

// Razorpay Standard Checkout Endpoints (Step 1 & Step 3)
app.post('/api/create-order', PaymentController.createOrder);
app.post('/api/verify-payment', PaymentController.verifyPayment);
app.get('/api/razorpay-key', PaymentController.getKey);

app.post('/api/v1/create-order', PaymentController.createOrder);
app.post('/api/v1/verify-payment', PaymentController.verifyPayment);
app.get('/api/v1/razorpay-key', PaymentController.getKey);

// API Routes
app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/admin', adminRoutes);
app.use('/api/v1/driver', driverRoutes);
app.use('/api/v1/customer', customerRoutes);
app.use('/api/v1/payments', paymentRoutes);

// Fallback for SPA navigation
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api')) {
    return next();
  }
  const indexPath = path.join(frontendDir, 'index.html');
  if (fs.existsSync(indexPath)) {
    return res.sendFile(indexPath);
  }
  res.status(404).json({ message: 'SafarX Backend API is active.' });
});

// 404 & Error Handlers
app.use(notFoundHandler);
app.use(errorHandler);

// Global Server & Reaper Instances for Graceful Shutdown
let serverInstance: any = null;
let holdReaperInterval: NodeJS.Timeout | null = null;

async function startServer() {
  // 1. Strict Startup Environment Validation
  validateEnv();

  // 2. Connect Database
  await connectDB();

  // 3. Auto-seed only in development when empty, NEVER in production
  const userCount = await User.countDocuments().catch(() => 0);
  if (userCount === 0 && !ENV.IS_PRODUCTION && (process.env.AUTO_SEED === 'true' || ENV.NODE_ENV === 'development')) {
    logger.info('[Server] Development database is empty. Running initial test seed...');
    try {
      await seedDatabase();
    } catch (seedErr: any) {
      logger.warn({ error: seedErr.message }, '[Server] Auto-seed non-fatal warning during startup');
    }
  }

  // 4. Start Expired Seat Hold Reaper Worker (runs every 60 seconds)
  holdReaperInterval = setInterval(() => {
    SegmentEngine.releaseExpiredHolds().catch((err) => {
      logger.error({ error: err.message }, '[HoldReaper] Error releasing expired holds');
    });
  }, 60000);
  holdReaperInterval.unref();

  // Initial immediate sweep of expired holds
  SegmentEngine.releaseExpiredHolds().catch(() => {});

  // 5. Start HTTP Listener
  serverInstance = app.listen(ENV.PORT, () => {
    logger.info({
      port: ENV.PORT,
      url: `http://localhost:${ENV.PORT}`,
      env: ENV.NODE_ENV,
      corridor: 'Sawangi ↔ DMIHER ↔ Nalwadi ↔ MIDC ↔ Wardha',
    }, `🚀 SafarX Core Mobility Engine is ACTIVE on port ${ENV.PORT}`);
  });

  serverInstance.on('error', (err: NodeJS.ErrnoException) => {
    if (err.code === 'EADDRINUSE') {
      logger.error(`[Server] Port ${ENV.PORT} is already in use.`);
    } else {
      logger.error({ error: err.message }, '[Server] Listen error occurred.');
    }
    process.exit(1);
  });

  return serverInstance;
}

// Graceful Shutdown Handler
async function gracefulShutdown(signal: string) {
  logger.info({ signal }, `Received ${signal}. Starting graceful shutdown...`);

  if (holdReaperInterval) {
    clearInterval(holdReaperInterval);
    holdReaperInterval = null;
  }

  if (serverInstance) {
    serverInstance.close(async () => {
      logger.info('HTTP server closed. Draining database connections...');
      try {
        await disconnectDB();
        logger.info('MongoDB disconnected cleanly. Process exit 0.');
        process.exit(0);
      } catch (err: any) {
        logger.error({ error: err.message }, 'Error during database disconnect.');
        process.exit(1);
      }
    });

    // Force exit if drain takes longer than 10 seconds
    setTimeout(() => {
      logger.error('Force shutdown: connections did not close in time.');
      process.exit(1);
    }, 10000).unref();
  } else {
    process.exit(0);
  }
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

process.on('unhandledRejection', (reason: any) => {
  logger.fatal({ reason: reason?.message || reason, stack: reason?.stack }, 'Unhandled Promise Rejection');
});

process.on('uncaughtException', (err: Error) => {
  logger.fatal({ error: err.message, stack: err.stack }, 'Uncaught Exception');
  gracefulShutdown('uncaughtException');
});

startServer();

export { app, startServer, gracefulShutdown };
