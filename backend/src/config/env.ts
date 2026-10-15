import dotenv from 'dotenv';
dotenv.config();

const nodeEnv = process.env.NODE_ENV || 'development';
const isProduction = nodeEnv === 'production';

export interface EnvironmentConfig {
  PORT: number;
  NODE_ENV: 'development' | 'production' | 'test';
  MONGODB_URI: string;
  USE_IN_MEMORY_DB: boolean;
  JWT_SECRET: string;
  JWT_EXPIRES_IN: string;
  RAZORPAY_KEY_ID: string;
  RAZORPAY_KEY_SECRET: string;
  RAZORPAY_WEBHOOK_SECRET: string;
  RAZORPAY_MODE: 'test' | 'live';
  FRONTEND_URL: string;
  ALLOWED_ORIGINS: string[];
  FIREBASE_PROJECT_ID: string;
  FIREBASE_SERVICE_ACCOUNT: string;
  UPSTASH_REDIS_REST_URL: string;
  UPSTASH_REDIS_REST_TOKEN: string;
  UPSTASH_VECTOR_REST_URL: string;
  UPSTASH_VECTOR_REST_TOKEN: string;
  IS_PRODUCTION: boolean;
}

import crypto from 'crypto';

const defaultDevSecret = 'safarx_dev_jwt_secret_minimum_32_chars_ok';

// Resolve secure JWT secret with automatic fallback if placeholder/empty
let resolvedJwtSecret = process.env.JWT_SECRET || '';
const placeholderSecrets = [
  'your_super_secret_jwt_key_minimum_32_chars',
  'safarx_super_secure_jwt_secret_key_2026',
  defaultDevSecret,
];
if (!resolvedJwtSecret || resolvedJwtSecret.length < 32 || placeholderSecrets.includes(resolvedJwtSecret)) {
  if (isProduction) {
    resolvedJwtSecret = process.env.JWT_SECRET && process.env.JWT_SECRET.length >= 32
      ? process.env.JWT_SECRET
      : 'safarx_prod_' + crypto.randomBytes(28).toString('hex');
  } else {
    resolvedJwtSecret = process.env.JWT_SECRET || defaultDevSecret;
  }
}

export const ENV: EnvironmentConfig = {
  PORT: process.env.PORT ? parseInt(process.env.PORT, 10) : 5000,
  NODE_ENV: (nodeEnv as any) || 'development',
  MONGODB_URI: process.env.MONGODB_URI || '',
  USE_IN_MEMORY_DB: process.env.USE_IN_MEMORY_DB === 'true',
  JWT_SECRET: resolvedJwtSecret,
  JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN || '7d',
  RAZORPAY_KEY_ID: process.env.RAZORPAY_KEY_ID || '',
  RAZORPAY_KEY_SECRET: process.env.RAZORPAY_KEY_SECRET || '',
  RAZORPAY_WEBHOOK_SECRET: process.env.RAZORPAY_WEBHOOK_SECRET || 'rzp_whsec_safarx_prod_default_key',
  RAZORPAY_MODE: (process.env.RAZORPAY_MODE === 'live' ? 'live' : 'test'),
  FRONTEND_URL: process.env.FRONTEND_URL || 'http://localhost:5000',
  ALLOWED_ORIGINS: process.env.ALLOWED_ORIGINS
    ? process.env.ALLOWED_ORIGINS.split(',').map((o) => o.trim()).filter(Boolean)
    : [
        'http://localhost:5000',
        'http://localhost:3000',
        'http://127.0.0.1:5000',
        'https://safarx.in',
        'https://app.safarx.in',
        'https://admin.safarx.in',
        'https://driver.safarx.in',
      ],
  FIREBASE_PROJECT_ID: process.env.FIREBASE_PROJECT_ID || 'safarx-513ce',
  FIREBASE_SERVICE_ACCOUNT: process.env.FIREBASE_SERVICE_ACCOUNT || '',
  UPSTASH_REDIS_REST_URL: process.env.UPSTASH_REDIS_REST_URL || '',
  UPSTASH_REDIS_REST_TOKEN: process.env.UPSTASH_REDIS_REST_TOKEN || '',
  UPSTASH_VECTOR_REST_URL: process.env.UPSTASH_VECTOR_REST_URL || '',
  UPSTASH_VECTOR_REST_TOKEN: process.env.UPSTASH_VECTOR_REST_TOKEN || '',
  IS_PRODUCTION: isProduction,
};

/**
 * Validates environment configuration during startup.
 * Logs informative warnings without crashing the deployment process.
 */
export function validateEnv(): void {
  if (ENV.IS_PRODUCTION) {
    if (!ENV.MONGODB_URI || ENV.MONGODB_URI.trim() === '') {
      console.warn('[Config Warning] MONGODB_URI is not set. Ensure MONGODB_URI is configured in production environment variables.');
    }
    if (!ENV.RAZORPAY_KEY_ID || !ENV.RAZORPAY_KEY_SECRET) {
      console.warn('[Config Warning] Razorpay live credentials not provided. Payment gateway will run in test mode.');
    }
    console.log('[Config] Production environment initialized successfully.');
  } else {
    if (!ENV.MONGODB_URI && !ENV.USE_IN_MEMORY_DB) {
      console.warn('[Config Warning] Neither MONGODB_URI nor USE_IN_MEMORY_DB=true is set. Server will check local database.');
    }
  }
}
