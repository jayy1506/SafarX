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
  IS_PRODUCTION: boolean;
}

const defaultDevSecret = 'safarx_dev_jwt_secret_minimum_32_chars_ok';

export const ENV: EnvironmentConfig = {
  PORT: process.env.PORT ? parseInt(process.env.PORT, 10) : 5000,
  NODE_ENV: (nodeEnv as any) || 'development',
  MONGODB_URI: process.env.MONGODB_URI || '',
  USE_IN_MEMORY_DB: process.env.USE_IN_MEMORY_DB === 'true',
  JWT_SECRET: process.env.JWT_SECRET || (isProduction ? '' : defaultDevSecret),
  JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN || '7d',
  RAZORPAY_KEY_ID: process.env.RAZORPAY_KEY_ID || '',
  RAZORPAY_KEY_SECRET: process.env.RAZORPAY_KEY_SECRET || '',
  RAZORPAY_WEBHOOK_SECRET: process.env.RAZORPAY_WEBHOOK_SECRET || '',
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
  IS_PRODUCTION: isProduction,
};

/**
 * Validates environment configuration during startup.
 * Throws an informative error and halts process if required production variables are absent.
 */
export function validateEnv(): void {
  const errors: string[] = [];

  if (ENV.IS_PRODUCTION) {
    if (!ENV.MONGODB_URI || ENV.MONGODB_URI.trim() === '') {
      errors.push('MONGODB_URI is required in production. In-memory databases are strictly forbidden in production.');
    }

    if (!ENV.JWT_SECRET || ENV.JWT_SECRET.length < 32) {
      errors.push('JWT_SECRET is required and must be at least 32 characters in production.');
    }

    const placeholderSecrets = [
      'your_super_secret_jwt_key_minimum_32_chars',
      'safarx_super_secure_jwt_secret_key_2026',
      defaultDevSecret,
    ];
    if (placeholderSecrets.includes(ENV.JWT_SECRET)) {
      errors.push('JWT_SECRET cannot use default placeholder value in production.');
    }

    if (!ENV.RAZORPAY_KEY_ID || ENV.RAZORPAY_KEY_ID.startsWith('rzp_test_your_')) {
      errors.push('Valid RAZORPAY_KEY_ID is required in production.');
    }

    if (!ENV.RAZORPAY_KEY_SECRET || ENV.RAZORPAY_KEY_SECRET.includes('your_razorpay_secret')) {
      errors.push('Valid RAZORPAY_KEY_SECRET is required in production.');
    }

    if (!ENV.RAZORPAY_WEBHOOK_SECRET) {
      errors.push('RAZORPAY_WEBHOOK_SECRET is required in production for secure webhook verification.');
    }
  } else {
    // Development warnings
    if (!ENV.MONGODB_URI && !ENV.USE_IN_MEMORY_DB) {
      console.warn('[Config Warning] Neither MONGODB_URI nor USE_IN_MEMORY_DB=true is set. Server will check local database.');
    }
  }

  if (errors.length > 0) {
    const errorMsg = `\n========================================\nFATAL CONFIGURATION ERROR:\n${errors.map((e) => `  - ${e}`).join('\n')}\n========================================\n`;
    console.error(errorMsg);
    throw new Error(`Environment validation failed with ${errors.length} error(s).`);
  }
}
