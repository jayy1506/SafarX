import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setupTestDB, teardownTestDB, clearTestDB } from './setup.js';
import { User } from '../models/User.js';
import { authorizeRole } from '../middlewares/auth.js';

before(async () => {
  await setupTestDB();
});

after(async () => {
  await teardownTestDB();
});

test('User Model: hashes passwords and strips hashes on JSON serialization', async () => {
  await clearTestDB();

  const user = await User.create({
    fullName: 'Test Traveler',
    phone: '9890123456',
    email: 'traveler@safarx.app',
    password: 'securePassword123',
    role: 'CUSTOMER',
  });

  // Database stored password must be hashed (not plain text)
  assert.notEqual(user.password, 'securePassword123');
  assert.equal(user.password?.startsWith('$2'), true);

  // comparePassword method works
  const isCorrect = await user.comparePassword('securePassword123');
  assert.equal(isCorrect, true);

  const isWrong = await user.comparePassword('wrongPassword');
  assert.equal(isWrong, false);

  // toJSON serialization must NEVER include password or __v
  const jsonOutput = user.toJSON();
  assert.equal((jsonOutput as any).password, undefined);
  assert.equal((jsonOutput as any).__v, undefined);
  assert.equal(jsonOutput.email, 'traveler@safarx.app');
});

test('Auth Middleware: authorizeRole enforces role boundaries', () => {
  const customerReq: any = {
    user: { role: 'CUSTOMER', fullName: 'Customer' },
  };
  const driverReq: any = {
    user: { role: 'DRIVER', fullName: 'Driver' },
  };
  const adminReq: any = {
    user: { role: 'ADMIN', fullName: 'Admin' },
  };

  let nextCalled = false;
  const next = () => { nextCalled = true; };

  const adminGuard = authorizeRole('ADMIN');

  // Customer attempting Admin route
  let statusSent = 0;
  let jsonSent: any = null;
  const mockRes: any = {
    status: (s: number) => { statusSent = s; return mockRes; },
    json: (j: any) => { jsonSent = j; },
  };

  nextCalled = false;
  adminGuard(customerReq, mockRes, next);
  assert.equal(nextCalled, false);
  assert.equal(statusSent, 403);
  assert.equal(jsonSent.success, false);

  // Driver attempting Admin route
  nextCalled = false;
  adminGuard(driverReq, mockRes, next);
  assert.equal(nextCalled, false);
  assert.equal(statusSent, 403);

  // Admin accessing Admin route
  nextCalled = false;
  adminGuard(adminReq, mockRes, next);
  assert.equal(nextCalled, true);
});
