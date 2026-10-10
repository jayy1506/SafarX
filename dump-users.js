import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { User } from './backend/src/models/User.js';

dotenv.config();

async function test() {
  await mongoose.connect(process.env.MONGODB_URI);
  
  const users = await User.find().sort({ createdAt: -1 }).limit(10);
  
  for (const user of users) {
    console.log(`Email: ${user.email}, Phone: ${user.phone}, Role: ${user.role}, Has Password: ${!!user.password}, Hash: ${user.password}`);
  }
  
  process.exit(0);
}

test();
