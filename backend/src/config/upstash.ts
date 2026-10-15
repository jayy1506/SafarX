import { Redis } from '@upstash/redis';
import { Index } from '@upstash/vector';
import { ENV } from './env.js';
import { logger } from '../utils/logger.js';

/**
 * Upstash Redis Client instance
 */
export const redis = new Redis({
  url: ENV.UPSTASH_REDIS_REST_URL || process.env.UPSTASH_REDIS_REST_URL || 'https://settling-leech-174673.upstash.io',
  token: ENV.UPSTASH_REDIS_REST_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN || 'gQAAAAAAAqpRAAIgcDEyZjNkZDhlOWI0NjU0OGNiYWQyMTJiZDUyNmE3MDRmZA',
});

/**
 * Upstash Vector Index instance
 */
export const vectorIndex = new Index({
  url: ENV.UPSTASH_VECTOR_REST_URL || process.env.UPSTASH_VECTOR_REST_URL || 'https://heroic-gator-96699-us1-vector.upstash.io',
  token: ENV.UPSTASH_VECTOR_REST_TOKEN || process.env.UPSTASH_VECTOR_REST_TOKEN || 'ABYIMGhlcm9pYy1nYXRvci05NjY5OS11czFyZWFkb25seU9HVXhNR1pqT1RFdE5HSXpaQzAwWTJSaExXSmlaVGd0WWpVeU5tVmpOREk1WkROaA==',
});

/**
 * Health check & verification for Upstash Redis connectivity
 */
export async function testUpstashConnection(): Promise<{ redis: boolean; vector: boolean }> {
  let redisOk = false;
  let vectorOk = false;

  try {
    await redis.set('foo', 'bar');
    const val = await redis.get('foo');
    redisOk = val === 'bar';
    logger.info({ redisOk }, '[Upstash Redis] Successfully verified key-value operations (foo -> bar)');
  } catch (err: any) {
    logger.warn({ error: err.message }, '[Upstash Redis] Verification check non-fatal warning');
  }

  try {
    const info = await vectorIndex.info();
    vectorOk = !!info;
    logger.info({ vectorInfo: info }, '[Upstash Vector] Successfully connected to Vector Index');
  } catch (err: any) {
    logger.warn({ error: err.message }, '[Upstash Vector] Verification check non-fatal warning');
  }

  return { redis: redisOk, vector: vectorOk };
}
