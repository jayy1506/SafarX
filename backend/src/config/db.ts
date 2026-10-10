import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { ENV } from './env.js';

let mongoMemoryServer: MongoMemoryServer | null = null;

export async function connectDB(): Promise<typeof mongoose> {
  try {
    let uri = ENV.MONGODB_URI;

    if (!uri) {
      console.log('No external MONGODB_URI configured. Initializing embedded MongoDB memory server...');
      mongoMemoryServer = await MongoMemoryServer.create();
      uri = mongoMemoryServer.getUri();
      console.log(`[DB] Embedded MongoMemoryServer active at: ${uri}`);
    }

    mongoose.set('strictQuery', true);
    await mongoose.connect(uri);

    console.log(`[DB] Connected successfully to MongoDB: ${mongoose.connection.host}/${mongoose.connection.name}`);
    return mongoose;
  } catch (error) {
    console.error('[DB] Connection Error:', error);
    process.exit(1);
  }
}

export async function disconnectDB(): Promise<void> {
  await mongoose.disconnect();
  if (mongoMemoryServer) {
    await mongoMemoryServer.stop();
  }
}
