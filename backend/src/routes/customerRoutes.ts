import { Router } from 'express';
import { CustomerController } from '../controllers/customerController.js';
import { authenticate, authorizeRole } from '../middlewares/auth.js';

const router = Router();

// Public routes for route and search
router.get('/routes', CustomerController.getRoutesAndStops);
router.get('/rides/search', CustomerController.searchRides);

import { RideRequestController } from '../controllers/rideRequestController.js';

// Protected customer routes
router.post('/requests', authenticate, authorizeRole('CUSTOMER'), RideRequestController.createRequest);
router.get('/requests/:requestId', authenticate, authorizeRole('CUSTOMER'), RideRequestController.getRequestStatus);

router.post('/bookings/initiate', authenticate, authorizeRole('CUSTOMER'), CustomerController.initiateBooking);
router.post('/payments/verify', authenticate, authorizeRole('CUSTOMER'), CustomerController.verifyPayment);
router.post('/bookings/:bookingId/cancel', authenticate, authorizeRole('CUSTOMER'), CustomerController.cancelBooking);
router.get('/bookings/my', authenticate, authorizeRole('CUSTOMER'), CustomerController.getMyBookings);
router.post('/reviews', authenticate, authorizeRole('CUSTOMER'), CustomerController.submitReview);

export default router;
