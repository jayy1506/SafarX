import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { User } from './backend/src/models/User.js';

dotenv.config();

async function seedAdmin() {
  await mongoose.connect(process.env.MONGODB_URI);
  
  const adminEmail = 'jthakre62@gmail.com';
  const adminPassword = 'Jay@1523'; // The user can use this to login
  
  let admin = await User.findOne({ email: adminEmail });
  
  if (admin) {
    console.log('Admin exists, updating password...');
    admin.password = adminPassword;
    admin.role = 'ADMIN';
    await admin.save();
    console.log(`Admin password updated to: ${adminPassword}`);
  } else {
    console.log('Creating new Admin account...');
    admin = new User({
      fullName: 'Jay Thakkar (Admin)',
      email: adminEmail,
      phone: '9999999999',
      password: adminPassword,
      role: 'ADMIN',
    });
    await admin.save();
    console.log(`Admin created with password: ${adminPassword}`);
  }
  
  process.exit(0);
}

seedAdmin();
