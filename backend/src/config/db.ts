import mongoose from 'mongoose';
import { ENV } from './env.js';

let mongoMemoryServer: any = null;

export async function connectDB(): Promise<typeof mongoose> {
  let uri = (process.env.MONGODB_URI || ENV.MONGODB_URI || '').trim().replace(/^["']|["']$/g, '');

  try {
    // If explicitly configured for in-memory or no URI provided
    if (ENV.USE_IN_MEMORY_DB || !uri) {
      console.log('[DB] USE_IN_MEMORY_DB=true or no MONGODB_URI. Starting embedded MongoMemoryServer...');
      const { MongoMemoryServer } = await import('mongodb-memory-server');
      mongoMemoryServer = await MongoMemoryServer.create();
      uri = mongoMemoryServer.getUri();
      console.log(`[DB] Embedded MongoMemoryServer active at: ${uri}`);
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

    // If external MongoDB connection failed (e.g., Atlas IP whitelist 0.0.0.0/0 missing on Render)
    if (!mongoMemoryServer) {
      try {
        console.warn('[DB Fallback] External MongoDB connection failed. Initializing automatic MongoMemoryServer fallback to keep registration & login online...');
        const { MongoMemoryServer } = await import('mongodb-memory-server');
        mongoMemoryServer = await MongoMemoryServer.create();
        const fallbackUri = mongoMemoryServer.getUri();
        await mongoose.connect(fallbackUri, {
          maxPoolSize: 50,
          serverSelectionTimeoutMS: 5000,
        });
        console.log(`[DB] Fallback MongoMemoryServer connected successfully at: ${fallbackUri}`);

        // Seed initial collections so default admin and routes are available
        try {
          const { seedDatabase } = await import('../seeders/seedData.js');
          await seedDatabase();
          console.log('[DB Fallback] Seed data successfully populated in fallback database.');
        } catch (seedErr: any) {
          console.warn('[DB Fallback Seed Warning]:', seedErr.message);
        }

        return mongoose;
      } catch (memErr: any) {
        console.error('[DB MongoMemoryServer Fallback Error]:', memErr.message || memErr);
      }
    }

    return mongoose;
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
