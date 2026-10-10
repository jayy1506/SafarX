import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import { setupTestDB, teardownTestDB, clearTestDB } from './setup.js';
import { SegmentEngine } from '../services/segmentEngine.js';
import { RideSegment } from '../models/RideSegment.js';
import { Booking } from '../models/Booking.js';

before(async () => {
  await setupTestDB();
});

after(async () => {
  await teardownTestDB();
});

test('SegmentEngine: allows sequential passengers to reuse seats on non-overlapping segments', async () => {
  await clearTestDB();

  const rideId = new mongoose.Types.ObjectId();
  const mockRoute: any = { totalDistanceKm: 12 };
  const stops = ['Sawangi', 'DMIHER', 'Nalwadi', 'MIDC', 'Wardha'];

  // 4 segments created with totalSeats = 2
  await SegmentEngine.createSegmentsForRide(rideId, stops, 2, 40, mockRoute);

  // Passenger 1 books Sawangi -> DMIHER (index 0 to 1, segment 1) for 2 seats (full capacity for segment 1)
  const p1Held = await SegmentEngine.holdSeats(rideId, 0, 1, 2);
  assert.equal(p1Held, true);
  await SegmentEngine.confirmHeldSeats(rideId, 0, 1, 2);

  // Segment 1 now has 0 available seats
  const seg1Avail = await SegmentEngine.checkAvailability(rideId, 0, 1, 1);
  assert.equal(seg1Avail.availableSeats, 0);
  assert.equal(seg1Avail.isAvailable, false);

  // Passenger 2 wants DMIHER -> Wardha (index 1 to 4, segments 2, 3, 4)
  // Because segment 1 does NOT overlap with segments 2, 3, 4, seats MUST BE AVAILABLE!
  const p2Avail = await SegmentEngine.checkAvailability(rideId, 1, 4, 2);
  assert.equal(p2Avail.availableSeats, 2);
  assert.equal(p2Avail.isAvailable, true);

  const p2Held = await SegmentEngine.holdSeats(rideId, 1, 4, 2);
  assert.equal(p2Held, true);
});

test('SegmentEngine: prevents overbooking under concurrent requests for the last seat', async () => {
  await clearTestDB();

  const rideId = new mongoose.Types.ObjectId();
  const mockRoute: any = { totalDistanceKm: 12 };
  const stops = ['Sawangi', 'DMIHER', 'Wardha'];

  // 2 segments with capacity = 1 seat
  await SegmentEngine.createSegmentsForRide(rideId, stops, 1, 30, mockRoute);

  // 5 customers concurrently try to hold the 1 seat on Sawangi -> Wardha (index 0 to 2)
  const concurrentAttempts = await Promise.all([
    SegmentEngine.holdSeats(rideId, 0, 2, 1),
    SegmentEngine.holdSeats(rideId, 0, 2, 1),
    SegmentEngine.holdSeats(rideId, 0, 2, 1),
    SegmentEngine.holdSeats(rideId, 0, 2, 1),
    SegmentEngine.holdSeats(rideId, 0, 2, 1),
  ]);

  const successfulHolds = concurrentAttempts.filter((res) => res === true);
  assert.equal(successfulHolds.length, 1, 'Exactly one concurrent request must acquire the last seat');

  // Verify database segment counts reflect exactly 1 pending seat
  const segments = await RideSegment.find({ ride: rideId });
  for (const seg of segments) {
    assert.equal(seg.pendingSeats, 1);
    assert.equal(seg.bookedSeats, 0);
  }
});

test('SegmentEngine: releases expired seat holds safely', async () => {
  await clearTestDB();

  const rideId = new mongoose.Types.ObjectId();
  const customerId = new mongoose.Types.ObjectId();
  const mockRoute: any = { totalDistanceKm: 12 };
  const stops = ['Sawangi', 'DMIHER'];

  await SegmentEngine.createSegmentsForRide(rideId, stops, 1, 20, mockRoute);

  // Hold 1 seat
  await SegmentEngine.holdSeats(rideId, 0, 1, 1);

  // Create booking with expired timestamp
  const expiredHoldDate = new Date(Date.now() - 5000); // 5 seconds ago
  await Booking.create({
    bookingNumber: 'BK-TEST-EXPIRED',
    customer: customerId,
    ride: rideId,
    pickupStop: 'Sawangi',
    pickupIndex: 0,
    dropStop: 'DMIHER',
    dropIndex: 1,
    seatsBooked: 1,
    farePerSeat: 20,
    subtotal: 20,
    totalAmount: 20,
    bookingStatus: 'PENDING_PAYMENT',
    paymentStatus: 'PENDING',
    holdExpiresAt: expiredHoldDate,
    boardingOtp: '1234',
  });

  // Seat is currently unavailable
  let avail = await RideSegment.findOne({ ride: rideId });
  assert.equal(avail?.pendingSeats, 1);

  // Run reaper
  const released = await SegmentEngine.releaseExpiredHolds();
  assert.equal(released, 1);

  // Check that booking is CANCELLED_BY_SYSTEM and seats are 0 pending
  const updatedBooking = await Booking.findOne({ bookingNumber: 'BK-TEST-EXPIRED' });
  assert.equal(updatedBooking?.bookingStatus, 'CANCELLED_BY_SYSTEM');

  avail = await RideSegment.findOne({ ride: rideId });
  assert.equal(avail?.pendingSeats, 0);
});
