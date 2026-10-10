import { Router, Request, Response } from 'express';
import mongoose from 'mongoose';

const router = Router();

/**
 * @route   GET /api/health
 * @desc    Basic Health & Liveness Check (Server Process Alive)
 * @access  Public
 */
router.get('/', (req: Request, res: Response) => {
  res.status(200).json({
    status: 'ok',
    service: 'safarx-api',
    uptime: Math.floor(process.uptime()),
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development',
  });
});

/**
 * @route   GET /api/health/live
 * @desc    Kubernetes / Cloud Orchestrator Liveness Probe
 * @access  Public
 */
router.get('/live', (req: Request, res: Response) => {
  res.status(200).json({
    status: 'ok',
    liveness: 'alive',
    timestamp: new Date().toISOString(),
  });
});

/**
 * @route   GET /api/health/ready
 * @desc    Readiness Check (Verifies MongoDB & Dependency Connectivity)
 * @access  Public
 */
router.get('/ready', async (req: Request, res: Response) => {
  const startTime = Date.now();
  const dbState = mongoose.connection.readyState;
  
  // Mongoose readyState values:
  // 0 = disconnected, 1 = connected, 2 = connecting, 3 = disconnecting
  const isDbConnected = dbState === 1;

  if (!isDbConnected) {
    return res.status(503).json({
      status: 'error',
      service: 'safarx-api',
      ready: false,
      database: {
        status: 'disconnected',
        readyState: dbState,
      },
      message: 'Database is not connected. Service is not ready to accept traffic.',
      timestamp: new Date().toISOString(),
    });
  }

  try {
    // Perform active ping on MongoDB admin/command
    if (mongoose.connection.db) {
      await mongoose.connection.db.admin().ping();
    }
    const dbLatencyMs = Date.now() - startTime;

    const memoryUsage = process.memoryUsage();

    return res.status(200).json({
      status: 'ok',
      service: 'safarx-api',
      ready: true,
      uptimeSeconds: Math.floor(process.uptime()),
      database: {
        status: 'connected',
        latencyMs: dbLatencyMs,
        host: mongoose.connection.host || 'cluster',
        name: mongoose.connection.name || 'safarx_db',
      },
      system: {
        memoryHeapUsedMB: Math.round((memoryUsage.heapUsed / 1024 / 1024) * 100) / 100,
        memoryRssMB: Math.round((memoryUsage.rss / 1024 / 1024) * 100) / 100,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    return res.status(503).json({
      status: 'error',
      service: 'safarx-api',
      ready: false,
      database: {
        status: 'unreachable',
        error: error.message,
      },
      message: 'Failed to communicate with database cluster.',
      timestamp: new Date().toISOString(),
    });
  }
});

export default router;
