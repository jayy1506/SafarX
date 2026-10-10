import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setupTestDB, teardownTestDB, clearTestDB } from './setup.js';
import { FareCalculator } from '../services/fareCalculator.js';
import { AdminSettings } from '../models/AdminSettings.js';

before(async () => {
  await setupTestDB();
});

after(async () => {
  await teardownTestDB();
});

test('FareCalculator: calculates proportional corridor fares across segments', async () => {
  await clearTestDB();

  await AdminSettings.create({
    key: 'GLOBAL_SETTINGS',
    minFare: 10,
    maxFare: 150,
    commissionType: 'PERCENTAGE',
    commissionValue: 10,
  });

  const mockRide: any = {
    stops: ['Sawangi', 'DMIHER', 'Nalwadi', 'MIDC', 'Wardha'],
    dailyFare: 40,
  };

  // Full corridor: 4 segments (index 0 to 4)
  const fullFare = await FareCalculator.calculateBookingFare(mockRide, 0, 4, 1);
  assert.equal(fullFare.segmentCount, 4);
  assert.equal(fullFare.farePerSeat, 40);
  assert.equal(fullFare.totalAmount, 40);
  assert.equal(fullFare.platformCommission, 4); // 10%
  assert.equal(fullFare.driverEarnings, 36);

  // Partial corridor: 2 segments (Sawangi -> Nalwadi, index 0 to 2)
  const partialFare = await FareCalculator.calculateBookingFare(mockRide, 0, 2, 1);
  assert.equal(partialFare.segmentCount, 2);
  assert.equal(partialFare.farePerSeat, 20); // 40 * (2/4) = 20
  assert.equal(fullFare.subtotal, 40);

  // Multiple seats: 2 seats
  const multiSeatFare = await FareCalculator.calculateBookingFare(mockRide, 0, 2, 2);
  assert.equal(multiSeatFare.farePerSeat, 20);
  assert.equal(multiSeatFare.totalAmount, 40);
  assert.equal(multiSeatFare.platformCommission, 4);
  assert.equal(multiSeatFare.driverEarnings, 36);
});

test('FareCalculator: enforces minFare and maxFare boundary conditions', async () => {
  await clearTestDB();

  await AdminSettings.create({
    key: 'GLOBAL_SETTINGS',
    minFare: 15,
    maxFare: 50,
    commissionType: 'PERCENTAGE',
    commissionValue: 10,
  });

  const cheapRide: any = {
    stops: ['Sawangi', 'DMIHER'],
    dailyFare: 5, // Below minFare
  };

  const fare = await FareCalculator.calculateBookingFare(cheapRide, 0, 1, 1);
  assert.equal(fare.farePerSeat, 15); // Bounded to minFare
});
