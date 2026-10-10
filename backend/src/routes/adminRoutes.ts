import { Router } from 'express';
import { AdminController } from '../controllers/adminController.js';
import { authenticate, authorizeRole } from '../middlewares/auth.js';

const router = Router();

// Protect all admin routes with JWT and ADMIN role guard
router.use(authenticate, authorizeRole('ADMIN'));

// Dashboard metrics
router.get('/metrics', AdminController.getDashboardMetrics);

// Driver management
router.get('/drivers', AdminController.getDrivers);
router.post('/drivers', AdminController.createDriver);
router.patch('/drivers/:driverId/status', AdminController.updateDriverStatus);


// Route & Stop dynamic management
router.get('/routes', AdminController.getRoutes);
router.post('/routes', AdminController.createRoute);
router.put('/routes/:routeId', AdminController.updateRoute);
router.post('/routes/:routeId/stops', AdminController.addStop);
router.put('/routes/:routeId/stops/:stopId', AdminController.updateStop);
router.delete('/routes/:routeId/stops/:stopId', AdminController.deleteStop);
router.post('/routes/:routeId/reorder-stops', AdminController.reorderStops);

// Bookings & Payments
router.get('/bookings', AdminController.getAllBookings);
router.get('/payments', AdminController.getAllPayments);

// Admin Global Settings
router.get('/settings', AdminController.getSettings);
router.put('/settings', AdminController.updateSettings);

export default router;
