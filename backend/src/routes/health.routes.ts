import { Router, Request, Response } from 'express';
import mongoose from 'mongoose';
import { ENV } from '../config/env.js';

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
    environment: ENV.NODE_ENV,
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
 * @desc    Readiness Check (Verifies MongoDB Connectivity without revealing internal infrastructure details)
 * @access  Public
 */
router.get('/ready', async (req: Request, res: Response) => {
  const startTime = Date.now();
  const dbState = mongoose.connection.readyState;
  const isDbConnected = dbState === 1;

  if (!isDbConnected) {
    return res.status(503).json({
      status: 'error',
      service: 'safarx-api',
      ready: false,
      database: {
        status: 'disconnected',
      },
      message: 'Service is not ready to accept traffic.',
      timestamp: new Date().toISOString(),
    });
  }

  try {
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
      },
      system: {
        memoryHeapUsedMB: Math.round((memoryUsage.heapUsed / 1024 / 1024) * 100) / 100,
        memoryRssMB: Math.round((memoryUsage.rss / 1024 / 1024) * 100) / 100,
      },
      timestamp: new Date().toISOString(),
    });
  } catch {
    return res.status(503).json({
      status: 'error',
      service: 'safarx-api',
      ready: false,
      database: {
        status: 'unreachable',
      },
      message: 'Failed to communicate with database cluster.',
      timestamp: new Date().toISOString(),
    });
  }
});

import { redis, vectorIndex } from '../config/upstash.js';

/**
 * @route   GET /api/health/upstash
 * @desc    Verify Upstash Redis (set/get) and Upstash Vector connectivity
 * @access  Public
 */
router.get('/upstash', async (req: Request, res: Response) => {
  const start = Date.now();
  try {
    // 1. Redis test: set "foo" -> "bar" and get "foo"
    await redis.set('foo', 'bar');
    const redisVal = await redis.get('foo');

    // 2. Vector test: get vector index info
    const vectorInfo = await vectorIndex.info();

    res.status(200).json({
      status: 'ok',
      service: 'upstash-integration',
      redis: {
        status: 'connected',
        testKey: 'foo',
        testValue: redisVal,
        verified: redisVal === 'bar',
      },
      vector: {
        status: 'connected',
        indexInfo: vectorInfo,
      },
      latencyMs: Date.now() - start,
      timestamp: new Date().toISOString(),
    });
  } catch (err: any) {
    res.status(500).json({
      status: 'error',
      message: err.message,
      latencyMs: Date.now() - start,
    });
  }
});

export default router;
