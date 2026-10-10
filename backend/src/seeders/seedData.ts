import { User } from '../models/User.js';
import { Driver } from '../models/Driver.js';
import { Vehicle } from '../models/Vehicle.js';
import { Route } from '../models/Route.js';
import { Ride } from '../models/Ride.js';
import { RideSegment } from '../models/RideSegment.js';
import { Booking } from '../models/Booking.js';
import { Payment } from '../models/Payment.js';
import { AdminSettings } from '../models/AdminSettings.js';
import { SegmentEngine } from '../services/segmentEngine.js';

let isSeeding = false;

export async function seedDatabase(): Promise<void> {
  if (isSeeding) return;
  isSeeding = true;
  try {
    console.log('[Seeder] Initializing database seed data...');

  // 1. Admin Settings
  await AdminSettings.deleteMany({});
  await AdminSettings.create({
    key: 'GLOBAL_SETTINGS',
    minFare: 10,
    maxFare: 150,
    allowDriverFareAdjustment: true,
    commissionType: 'PERCENTAGE',
    commissionValue: 10,
    seatHoldDurationMinutes: 10,
    maxSeatsPerBooking: 4,
    customerCancellationTiers: [
      { minutesBeforeDeparture: 120, refundPercentage: 100, description: '>2 hours: 100% refund' },
      { minutesBeforeDeparture: 30, refundPercentage: 70, description: '30m-2h: 70% refund' },
      { minutesBeforeDeparture: 0, refundPercentage: 0, description: '<30m: No refund' },
    ],
    driverCancellationPenalty: 50,
    supportPhone: '+91 98765 43210',
    supportEmail: 'support@sawangiride.com',
  });

  // 2. Clear Existing Collections
  await User.deleteMany({});
  await Driver.deleteMany({});
  await Vehicle.deleteMany({});
  await Route.deleteMany({});
  await Ride.deleteMany({});
  await RideSegment.deleteMany({});
  await Booking.deleteMany({});
  await Payment.deleteMany({});

  // 3. Create Primary Admin (Jay Thakre)
  const admin = await User.create({
    fullName: 'Jay Thakre (Super Admin)',
    email: 'jthakre62@gmail.com',
    phone: '9890123450',
    password: 'admin123',
    role: 'ADMIN',
  });


  // 4. Create Drivers
  const driverUser1 = await User.create({
    fullName: 'Rahul Sharma',
    email: 'rahul.driver@sawangiride.com',
    phone: '9822110001',
    password: 'driver123',
    role: 'DRIVER',
    profilePhoto: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150',
  });

  const driverProfile1 = await Driver.create({
    user: driverUser1._id,
    drivingLicenseNumber: 'MH31-2018-0091823',
    licenseExpiry: new Date('2032-05-15'),
    governmentIdType: 'AADHAAR',
    governmentIdNumber: '5489 1234 9876',
    verificationStatus: 'APPROVED',
    totalRidesCompleted: 142,
    ratingAverage: 4.9,
    ratingCount: 88,
    todayEarnings: 240,
    totalEarnings: 8450,
  });

  const vehicle1 = await Vehicle.create({
    driver: driverProfile1._id,
    vehicleNumber: 'MH 31 AB 1234',
    vehicleType: 'CAR',
    brand: 'Maruti Suzuki',
    model: 'Swift Dzire',
    color: 'Arctic White',
    totalSeats: 4,
    rcNumber: 'RC-MH31AB1234',
    status: 'APPROVED',
    isDefault: true,
  });

  const driverUser2 = await User.create({
    fullName: 'Vikram Deshmukh',
    email: 'vikram.driver@sawangiride.com',
    phone: '9822110002',
    password: 'driver123',
    role: 'DRIVER',
    profilePhoto: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150',
  });

  const driverProfile2 = await Driver.create({
    user: driverUser2._id,
    drivingLicenseNumber: 'MH31-2019-0044556',
    licenseExpiry: new Date('2030-11-20'),
    governmentIdType: 'AADHAAR',
    governmentIdNumber: '6677 8899 0011',
    verificationStatus: 'APPROVED',
    totalRidesCompleted: 78,
    ratingAverage: 4.8,
    ratingCount: 42,
    todayEarnings: 160,
    totalEarnings: 4200,
  });

  const vehicle2 = await Vehicle.create({
    driver: driverProfile2._id,
    vehicleNumber: 'MH 31 CD 5678',
    vehicleType: 'CAR',
    brand: 'Hyundai',
    model: 'Aura CNG',
    color: 'Silver',
    totalSeats: 4,
    rcNumber: 'RC-MH31CD5678',
    status: 'APPROVED',
    isDefault: true,
  });

  const driverUser3 = await User.create({
    fullName: 'Amit Patil',
    email: 'amit.driver@sawangiride.com',
    phone: '9822110003',
    password: 'driver123',
    role: 'DRIVER',
  });

  await Driver.create({
    user: driverUser3._id,
    drivingLicenseNumber: 'MH31-2023-0012399',
    licenseExpiry: new Date('2035-08-10'),
    governmentIdType: 'AADHAAR',
    governmentIdNumber: '1122 3344 5566',
    verificationStatus: 'PENDING',
    totalRidesCompleted: 0,
    ratingAverage: 5.0,
    ratingCount: 0,
  });

  // 5. Create Customers
  const customer1 = await User.create({
    fullName: 'Jay Thakkar',
    email: 'jay@example.com',
    phone: '9890123456',
    password: 'customer123',
    role: 'CUSTOMER',
    emergencyContact: {
      name: 'Ramesh Thakkar',
      phone: '9890111222',
      relationship: 'Father',
    },
  });

  const customer2 = await User.create({
    fullName: 'Priya Sharma',
    email: 'priya@example.com',
    phone: '9890654321',
    password: 'customer123',
    role: 'CUSTOMER',
  });

  const customer3 = await User.create({
    fullName: 'Aman Verma',
    email: 'aman@example.com',
    phone: '9890998877',
    password: 'customer123',
    role: 'CUSTOMER',
  });

  // 6. Create Initial Route: Sawangi ↔ Wardha
  const route = await Route.create({
    name: 'Sawangi ↔ Wardha Highway Corridor',
    origin: 'Sawangi',
    destination: 'Wardha',
    estimatedDurationMinutes: 25,
    totalDistanceKm: 12,
    baseFare: 20,
    farePerKm: 3,
    isActive: true,
    stops: [
      { name: 'Sawangi', landmark: 'Meghe Chowk / Bus Stand', sequenceOrder: 1, distanceFromStartKm: 0, isActive: true },
      { name: 'DMIHER', landmark: 'Campus Main Gate (Datta Meghe)', sequenceOrder: 2, distanceFromStartKm: 2.5, isActive: true },
      { name: 'Nalwadi', landmark: 'Panchavati Square', sequenceOrder: 3, distanceFromStartKm: 6.0, isActive: true },
      { name: 'MIDC', landmark: 'MIDC Wardha Main Entrance', sequenceOrder: 4, distanceFromStartKm: 9.0, isActive: true },
      { name: 'Wardha', landmark: 'Wardha Railway Station / Bus Depot', sequenceOrder: 5, distanceFromStartKm: 12.0, isActive: true },
    ],
  });

  // 7. Create Active Daily Rides
  const todayStr = new Date().toISOString().split('T')[0];
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowStr = tomorrow.toISOString().split('T')[0];

  const stopsForward = ['Sawangi', 'DMIHER', 'Nalwadi', 'MIDC', 'Wardha'];
  const stopsReverse = ['Wardha', 'MIDC', 'Nalwadi', 'DMIHER', 'Sawangi'];

  // Ride 1: Morning Sawangi -> Wardha
  const ride1 = await Ride.create({
    driver: driverUser1._id,
    vehicle: vehicle1._id,
    route: route._id,
    direction: 'FORWARD',
    originStop: 'Sawangi',
    destinationStop: 'Wardha',
    stops: stopsForward,
    rideDate: todayStr,
    departureTime: '08:30',
    totalSeats: 4,
    availableSeatsCount: 3,
    dailyFare: 40,
    status: 'SCHEDULED',
  });
  await SegmentEngine.createSegmentsForRide(ride1._id, stopsForward, 4, 40, route);

  // Ride 2: Evening Wardha -> Sawangi
  const ride2 = await Ride.create({
    driver: driverUser1._id,
    vehicle: vehicle1._id,
    route: route._id,
    direction: 'REVERSE',
    originStop: 'Wardha',
    destinationStop: 'Sawangi',
    stops: stopsReverse,
    rideDate: todayStr,
    departureTime: '17:30',
    totalSeats: 4,
    availableSeatsCount: 4,
    dailyFare: 40,
    status: 'SCHEDULED',
  });
  await SegmentEngine.createSegmentsForRide(ride2._id, stopsReverse, 4, 40, route);

  // Ride 3: Vikram morning ride
  const ride3 = await Ride.create({
    driver: driverUser2._id,
    vehicle: vehicle2._id,
    route: route._id,
    direction: 'FORWARD',
    originStop: 'Sawangi',
    destinationStop: 'Wardha',
    stops: stopsForward,
    rideDate: todayStr,
    departureTime: '09:15',
    totalSeats: 4,
    availableSeatsCount: 4,
    dailyFare: 45,
    status: 'SCHEDULED',
  });
  await SegmentEngine.createSegmentsForRide(ride3._id, stopsForward, 4, 45, route);

  // Ride 4: Tomorrow's ride
  const ride4 = await Ride.create({
    driver: driverUser1._id,
    vehicle: vehicle1._id,
    route: route._id,
    direction: 'FORWARD',
    originStop: 'Sawangi',
    destinationStop: 'Wardha',
    stops: stopsForward,
    rideDate: tomorrowStr,
    departureTime: '08:30',
    totalSeats: 4,
    availableSeatsCount: 4,
    dailyFare: 40,
    status: 'SCHEDULED',
  });
  await SegmentEngine.createSegmentsForRide(ride4._id, stopsForward, 4, 40, route);

  // 8. Create Sample Confirmed Bookings on Ride 1 (Demonstrating Segment Availability)
  // Booking 1: Jay from DMIHER (idx 1) -> Wardha (idx 4) for 1 seat
  const booking1 = await Booking.create({
    bookingNumber: 'BK-SW-101001',
    customer: customer1._id,
    ride: ride1._id,
    pickupStop: 'DMIHER',
    pickupIndex: 1,
    dropStop: 'Wardha',
    dropIndex: 4,
    seatsBooked: 1,
    farePerSeat: 30,
    subtotal: 30,
    platformCommission: 3,
    driverEarnings: 27,
    totalAmount: 30,
    bookingStatus: 'CONFIRMED',
    paymentStatus: 'SUCCESS',
    holdExpiresAt: new Date(Date.now() + 600000),
    boardingOtp: '4829',
  });

  // Confirm segment hold
  await SegmentEngine.confirmHeldSeats(ride1._id, 1, 4, 1);

  // Payment record
  const payment1 = await Payment.create({
    booking: booking1._id,
    customer: customer1._id,
    ride: ride1._id,
    razorpayOrderId: 'order_sw_seed_001',
    razorpayPaymentId: 'pay_sw_seed_001',
    razorpaySignature: 'sim_sig_valid',
    amount: 30,
    amountInPaise: 3000,
    currency: 'INR',
    method: 'UPI',
    status: 'CAPTURED',
  });
  booking1.payment = payment1._id;
  await booking1.save();

  // Booking 2: Aman from Sawangi (idx 0) -> Nalwadi (idx 2) for 1 seat
  const booking2 = await Booking.create({
    bookingNumber: 'BK-SW-101002',
    customer: customer3._id,
    ride: ride1._id,
    pickupStop: 'Sawangi',
    pickupIndex: 0,
    dropStop: 'Nalwadi',
    dropIndex: 2,
    seatsBooked: 1,
    farePerSeat: 20,
    subtotal: 20,
    platformCommission: 2,
    driverEarnings: 18,
    totalAmount: 20,
    bookingStatus: 'CONFIRMED',
    paymentStatus: 'SUCCESS',
    holdExpiresAt: new Date(Date.now() + 600000),
    boardingOtp: '7193',
  });

  await SegmentEngine.confirmHeldSeats(ride1._id, 0, 2, 1);

  const payment2 = await Payment.create({
    booking: booking2._id,
    customer: customer3._id,
    ride: ride1._id,
    razorpayOrderId: 'order_sw_seed_002',
    razorpayPaymentId: 'pay_sw_seed_002',
    razorpaySignature: 'sim_sig_valid',
    amount: 20,
    amountInPaise: 2000,
    currency: 'INR',
    method: 'UPI',
    status: 'CAPTURED',
  });
  booking2.payment = payment2._id;
  await booking2.save();

    console.log('[Seeder] Database successfully seeded with production accounts, routes, rides, and segment matrix.');
  } finally {
    isSeeding = false;
  }
}

if (process.argv[1] && /seedData\.(ts|js)$/.test(process.argv[1].replace(/\\/g, '/'))) {
  const { connectDB, disconnectDB } = await import('../config/db.js');
  await connectDB();
  await seedDatabase();
  await disconnectDB();
  process.exit(0);
}
