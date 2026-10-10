import { Router } from 'express';
import { DriverController } from '../controllers/driverController.js';
import { authenticate, authorizeRole } from '../middlewares/auth.js';

const router = Router();

// Protect all driver routes
router.use(authenticate, authorizeRole('DRIVER'));

import { RideRequestController } from '../controllers/rideRequestController.js';

router.get('/profile', DriverController.getProfile);
router.post('/vehicle', DriverController.updateVehicle);

// Ride Request Routes
router.get('/requests/available', RideRequestController.getAvailableRequests);
router.post('/requests/:requestId/accept', RideRequestController.acceptRequest);

router.post('/rides/publish', DriverController.publishRide);
router.get('/rides/today', DriverController.getTodayRide);
router.patch('/rides/:rideId/fare', DriverController.updateRideFare);
router.post('/rides/:rideId/start', DriverController.startRide);
router.post('/rides/:rideId/end', DriverController.endRide);
router.post('/rides/:rideId/cancel', DriverController.cancelRide);

router.post('/bookings/:bookingId/boarded', DriverController.markBoarded);
router.post('/bookings/:bookingId/noshow', DriverController.markNoShow);

router.get('/earnings', DriverController.getEarnings);

export default router;
