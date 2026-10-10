import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';
import { User } from './backend/src/models/User.js';

dotenv.config();

async function test() {
  await mongoose.connect(process.env.MONGODB_URI);
  
  // Find a user
  const user = await User.findOne().sort({ createdAt: -1 });
  if (user) {
    console.log("Latest User:", user.email, "Role:", user.role);
    console.log("Stored Password Hash:", user.password);
  }
  
  // Create a dummy user
  const pass = "test1234";
  const email = "test" + Date.now() + "@test.com";
  const dummy = new User({
    fullName: "Test User",
    email: email,
    phone: "123456" + Date.now().toString().slice(-4),
    password: pass,
    role: "CUSTOMER"
  });
  
  await dummy.save();
  console.log("Saved Dummy Hash:", dummy.password);
  
  const match = await bcrypt.compare(pass, dummy.password);
  console.log("Does it match immediately?", match);
  
  const dbDummy = await User.findById(dummy._id);
  const match2 = await dbDummy.comparePassword(pass);
  console.log("Does model method match?", match2);

  // Try to simulate authController login
  const loginUser = await User.findOne({
    $or: [{ email: email.toLowerCase() }, { phone: email }]
  });
  if (loginUser) {
    const isMatch = await loginUser.comparePassword(pass);
    console.log("Auth controller login match?", isMatch);
  } else {
    console.log("User not found by email/phone in authController simulation");
  }
  
  process.exit(0);
}

test();
