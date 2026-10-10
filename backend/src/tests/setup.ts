import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';

let mongoServer: MongoMemoryServer | null = null;

export async function setupTestDB(): Promise<string> {
  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
  }
  mongoServer = await MongoMemoryServer.create();
  const uri = mongoServer.getUri();
  mongoose.set('strictQuery', true);
  await mongoose.connect(uri);
  return uri;
}

export async function teardownTestDB(): Promise<void> {
  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
  }
  if (mongoServer) {
    await mongoServer.stop();
    mongoServer = null;
  }
}

export async function clearTestDB(): Promise<void> {
  if (mongoose.connection.readyState !== 0 && mongoose.connection.db) {
    const collections = await mongoose.connection.db.collections();
    for (const collection of collections) {
      await collection.deleteMany({});
    }
  }
}
