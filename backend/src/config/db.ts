import mongoose from 'mongoose';
import { ENV } from './env.js';

let mongoMemoryServer: any = null;

export async function connectDB(): Promise<typeof mongoose> {
  try {
    let uri = ENV.MONGODB_URI;

    if (ENV.IS_PRODUCTION) {
      if (!uri) {
        throw new Error('[DB FATAL] MONGODB_URI is not configured in production environment. In-memory databases are strictly forbidden in production.');
      }
    } else {
      // In development / test mode
      if (!uri && ENV.USE_IN_MEMORY_DB) {
        console.log('[DB] USE_IN_MEMORY_DB is true. Initializing embedded MongoMemoryServer for development/testing...');
        const { MongoMemoryServer } = await import('mongodb-memory-server');
        mongoMemoryServer = await MongoMemoryServer.create();
        uri = mongoMemoryServer.getUri();
        console.log(`[DB] Embedded MongoMemoryServer active at: ${uri}`);
      } else if (!uri) {
        // Fallback to local MongoDB instance
        uri = 'mongodb://127.0.0.1:27017/sawangi_ride';
        console.log(`[DB] No MONGODB_URI supplied. Defaulting to local MongoDB: ${uri}`);
      }
    }

    mongoose.set('strictQuery', true);

    await mongoose.connect(uri, {
      maxPoolSize: 50,
      serverSelectionTimeoutMS: 5000,
      connectTimeoutMS: 10000,
    });

    console.log(`[DB] Connected successfully to MongoDB (${ENV.NODE_ENV})`);
    return mongoose;
  } catch (error: any) {
    console.error('[DB Connection Error]:', error.message || error);
    if (ENV.IS_PRODUCTION) {
      process.exit(1);
    }
    throw error;
  }
}

export async function disconnectDB(): Promise<void> {
  try {
    if (mongoose.connection.readyState !== 0) {
      await mongoose.disconnect();
    }
    if (mongoMemoryServer) {
      await mongoMemoryServer.stop();
      mongoMemoryServer = null;
    }
    console.log('[DB] Disconnected cleanly.');
  } catch (err: any) {
    console.error('[DB Disconnect Error]:', err.message || err);
  }
}
