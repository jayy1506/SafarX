import { Response } from 'express';
import { AuthRequest } from '../middlewares/auth.js';
import { User } from '../models/User.js';
import { Driver } from '../models/Driver.js';
import { Vehicle } from '../models/Vehicle.js';
import { Route } from '../models/Route.js';
import { Ride } from '../models/Ride.js';
import { Booking } from '../models/Booking.js';
import { Payment } from '../models/Payment.js';
import { AdminSettings } from '../models/AdminSettings.js';
import { NotificationService } from '../services/notificationService.js';

export class AdminController {
  /**
   * Analytics & Overview Dashboard
   */
  static async getDashboardMetrics(req: AuthRequest, res: Response): Promise<void> {
    try {
      const todayStr = new Date().toISOString().split('T')[0];

      const [
        totalCustomers,
        totalDrivers,
        activeDrivers,
        pendingDriverApprovals,
        todayRides,
        activeRides,
        todayBookings,
        cancelledBookings,
        allSuccessfulPayments,
        allRefunds,
      ] = await Promise.all([
        User.countDocuments({ role: 'CUSTOMER' }),
        Driver.countDocuments(),
        Driver.countDocuments({ verificationStatus: 'APPROVED' }),
        Driver.countDocuments({ verificationStatus: 'PENDING' }),
        Ride.countDocuments({ rideDate: todayStr }),
        Ride.countDocuments({ status: 'ACTIVE' }),
        Booking.countDocuments({ createdAt: { $gte: new Date(todayStr) } }),
        Booking.countDocuments({ bookingStatus: { $in: ['CANCELLED_BY_CUSTOMER', 'CANCELLED_BY_DRIVER'] } }),
        Payment.find({ status: 'CAPTURED' }),
        Payment.find({ status: 'REFUNDED' }),
      ]);

      let totalRevenue = 0;
      let platformCommission = 0;
      let driverEarnings = 0;

      const confirmedBookings = await Booking.find({ paymentStatus: 'SUCCESS' });
      for (const b of confirmedBookings) {
        totalRevenue += b.totalAmount;
        platformCommission += b.platformCommission;
        driverEarnings += b.driverEarnings;
      }

      // Recent 5 rides
      const recentRides = await Ride.find()
        .sort({ createdAt: -1 })
        .limit(5)
        .populate('driver', 'fullName phone')
        .populate('vehicle', 'vehicleNumber model brand');

      // Recent 5 bookings
      const recentBookings = await Booking.find()
        .sort({ createdAt: -1 })
        .limit(5)
        .populate('customer', 'fullName phone')
        .populate('ride', 'originStop destinationStop rideDate departureTime');

      res.json({
        success: true,
        metrics: {
          todayRides,
          activeRides,
          todayBookings,
          activeDrivers,
          totalDrivers,
          registeredCustomers: totalCustomers,
          pendingDriverApprovals,
          cancelledBookings,
          totalRevenue,
          platformCommission,
          driverEarnings,
          totalRefundsCount: allRefunds.length,
        },
        recentRides,
        recentBookings,
      });
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message });
    }
  }

  // --- DRIVER FLEET MANAGEMENT ---
  static async getDrivers(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { status } = req.query;
      const filter: any = {};
      if (status && status !== 'ALL') {
        filter.verificationStatus = status;
      }

      const drivers = await Driver.find(filter)
        .populate('user', 'fullName phone email profilePhoto createdAt')
        .sort({ createdAt: -1 });

      const driversWithVehicles = await Promise.all(
        drivers.map(async (d) => {
          const vehicle = await Vehicle.findOne({ driver: d._id });
          return {
            ...d.toObject(),
            vehicle,
          };
        })
      );

      res.json({ success: true, drivers: driversWithVehicles });
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message });
    }
  }

  static async updateDriverStatus(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { driverId } = req.params;
      const { status, rejectionReason } = req.body;

      if (!['APPROVED', 'REJECTED', 'SUSPENDED', 'PENDING'].includes(status)) {
        res.status(400).json({ success: false, message: 'Invalid driver status' });
        return;
      }

      const driver = await Driver.findById(driverId).populate('user');
      if (!driver) {
        res.status(404).json({ success: false, message: 'Driver not found' });
        return;
      }

      driver.verificationStatus = status;
      if (rejectionReason) driver.rejectionReason = rejectionReason;
      await driver.save();

      // Notify Driver
      await NotificationService.sendNotification(
        driver.user._id,
        'DRIVER',
        'KYC Status Updated',
        `Your SafarX driver profile has been ${status}.`,
        'DRIVER_KYC_UPDATE'
      );

      res.json({ success: true, message: `Driver verification status updated to ${status}`, driver });
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message });
    }
  }

  /**
   * Admin onboards and adds a new verified driver partner directly
   */
  static async createDriver(req: AuthRequest, res: Response): Promise<void> {
    try {
      const {
        fullName,
        phone,
        email,
        password,
        drivingLicenseNumber,
        licenseExpiry,
        governmentIdNumber,
        vehicleNumber,
        brand,
        model,
        totalSeats,
        color,
      } = req.body;

      if (!fullName || !phone || !email) {
        res.status(400).json({ success: false, message: 'Driver name, phone, and email are required.' });
        return;
      }

      // Check if user already exists
      let user = await User.findOne({ $or: [{ email: email.toLowerCase() }, { phone }] });
      if (user) {
        user.role = 'DRIVER';
        user.fullName = fullName;
        await user.save();
      } else {
        user = await User.create({
          fullName,
          phone,
          email: email.toLowerCase(),
          password: password || 'driver123',
          role: 'DRIVER',
        });
      }

      // Upsert Driver profile
      let driver = await Driver.findOne({ user: user._id });
      if (!driver) {
        driver = await Driver.create({
          user: user._id,
          drivingLicenseNumber: drivingLicenseNumber || `MH31-DL-${Math.floor(100000 + Math.random() * 900000)}`,
          licenseExpiry: licenseExpiry ? new Date(licenseExpiry) : new Date('2032-12-31'),
          governmentIdNumber: governmentIdNumber || `UID-${Math.floor(100000000000 + Math.random() * 900000000000)}`,
          verificationStatus: 'APPROVED',
          ratingAverage: 5.0,
          ratingCount: 0,
        });
      } else {
        driver.verificationStatus = 'APPROVED';
        await driver.save();
      }

      // Upsert Vehicle profile
      let vehicle = await Vehicle.findOne({ driver: driver._id });
      if (!vehicle) {
        vehicle = await Vehicle.create({
          driver: driver._id,
          vehicleNumber: (vehicleNumber || `MH 31 SX ${Math.floor(1000 + Math.random() * 9000)}`).toUpperCase(),
          brand: brand || 'Maruti Suzuki',
          model: model || 'Swift Dzire',
          color: color || 'Arctic White',
          totalSeats: Number(totalSeats) || 4,
          rcNumber: `RC-${(vehicleNumber || 'MH31SX9999').toUpperCase()}`,
          status: 'APPROVED',
          isDefault: true,
        });
      }

      res.status(201).json({
        success: true,
        message: `Driver partner ${fullName} created and approved successfully.`,
        driver: {
          ...driver.toObject(),
          user: user.toObject(),
          vehicle: vehicle.toObject(),
        },
      });
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message });
    }
  }

  // --- DYNAMIC ROUTE & STOP MANAGEMENT ---
  static async getRoutes(req: AuthRequest, res: Response): Promise<void> {
    try {
      const routes = await Route.find().sort({ createdAt: -1 });
      res.json({ success: true, routes });
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message });
    }
  }

  static async createRoute(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { name, origin, destination, totalDistanceKm, baseFare, farePerKm, stops } = req.body;

      if (!name || !origin || !destination) {
        res.status(400).json({ success: false, message: 'Route name, origin, and destination are required' });
        return;
      }

      const formattedStops = stops && stops.length > 0 ? stops : [
        { name: origin, sequenceOrder: 1, distanceFromStartKm: 0, isActive: true },
        { name: destination, sequenceOrder: 2, distanceFromStartKm: totalDistanceKm || 10, isActive: true },
      ];

      const route = await Route.create({
        name,
        origin,
        destination,
        totalDistanceKm: totalDistanceKm || 12,
        baseFare: baseFare || 20,
        farePerKm: farePerKm || 3,
        stops: formattedStops,
      });

      res.status(201).json({ success: true, message: 'Route created successfully', route });
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message });
    }
  }

  static async updateRoute(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { routeId } = req.params;
      const { name, origin, destination, totalDistanceKm, baseFare, farePerKm, isActive } = req.body;

      const route = await Route.findByIdAndUpdate(
        routeId,
        { name, origin, destination, totalDistanceKm, baseFare, farePerKm, isActive },
        { new: true }
      );

      if (!route) {
        res.status(404).json({ success: false, message: 'Route not found' });
        return;
      }

      res.json({ success: true, message: 'Route updated successfully', route });
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message });
    }
  }

  static async addStop(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { routeId } = req.params;
      const { name, landmark, sequenceOrder, distanceFromStartKm } = req.body;

      if (!name) {
        res.status(400).json({ success: false, message: 'Stop name is required' });
        return;
      }

      const route = await Route.findById(routeId);
      if (!route) {
        res.status(404).json({ success: false, message: 'Route not found' });
        return;
      }

      const seq = sequenceOrder || route.stops.length + 1;
      route.stops.push({
        name,
        landmark: landmark || '',
        sequenceOrder: seq,
        distanceFromStartKm: distanceFromStartKm || 0,
        isActive: true,
      });

      // Sort by sequenceOrder
      route.stops.sort((a, b) => a.sequenceOrder - b.sequenceOrder);
      await route.save();

      res.json({ success: true, message: `Stop '${name}' added to route`, route });
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message });
    }
  }

  static async updateStop(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { routeId, stopId } = req.params;
      const { name, landmark, sequenceOrder, distanceFromStartKm, isActive } = req.body;

      const route = await Route.findById(routeId);
      if (!route) {
        res.status(404).json({ success: false, message: 'Route not found' });
        return;
      }

      const stop = route.stops.find((s: any) => s._id?.toString() === stopId);
      if (!stop) {
        res.status(404).json({ success: false, message: 'Stop not found' });
        return;
      }

      if (name !== undefined) stop.name = name;
      if (landmark !== undefined) stop.landmark = landmark;
      if (sequenceOrder !== undefined) stop.sequenceOrder = sequenceOrder;
      if (distanceFromStartKm !== undefined) stop.distanceFromStartKm = distanceFromStartKm;
      if (isActive !== undefined) stop.isActive = isActive;

      route.stops.sort((a, b) => a.sequenceOrder - b.sequenceOrder);
      await route.save();

      res.json({ success: true, message: 'Stop updated', route });
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message });
    }
  }

  static async deleteStop(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { routeId, stopId } = req.params;
      const route = await Route.findById(routeId);
      if (!route) {
        res.status(404).json({ success: false, message: 'Route not found' });
        return;
      }

      route.stops = route.stops.filter((s: any) => s._id?.toString() !== stopId);
      // Re-sequence remaining
      route.stops.forEach((s, idx) => {
        s.sequenceOrder = idx + 1;
      });
      await route.save();

      res.json({ success: true, message: 'Stop removed from route', route });
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message });
    }
  }

  static async reorderStops(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { routeId } = req.params;
      const { stopIds } = req.body; // Array of stopId in desired order

      if (!Array.isArray(stopIds)) {
        res.status(400).json({ success: false, message: 'stopIds must be an array' });
        return;
      }

      const route = await Route.findById(routeId);
      if (!route) {
        res.status(404).json({ success: false, message: 'Route not found' });
        return;
      }

      const reordered: any[] = [];
      for (let i = 0; i < stopIds.length; i++) {
        const id = stopIds[i];
        const stop = route.stops.find((s: any) => s._id?.toString() === id);
        if (stop) {
          stop.sequenceOrder = i + 1;
          reordered.push(stop);
        }
      }

      route.stops = reordered;
      await route.save();

      res.json({ success: true, message: 'Stops reordered successfully', route });
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message });
    }
  }

  // --- BOOKINGS & PAYMENTS ---
  static async getAllBookings(req: AuthRequest, res: Response): Promise<void> {
    try {
      const bookings = await Booking.find()
        .populate('customer', 'fullName phone email')
        .populate({
          path: 'ride',
          populate: { path: 'driver', select: 'fullName phone' },
        })
        .sort({ createdAt: -1 });

      res.json({ success: true, bookings });
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message });
    }
  }

  static async getAllPayments(req: AuthRequest, res: Response): Promise<void> {
    try {
      const payments = await Payment.find()
        .populate('customer', 'fullName phone email')
        .populate('booking')
        .sort({ createdAt: -1 });

      res.json({ success: true, payments });
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message });
    }
  }

  // --- SYSTEM SETTINGS ---
  static async getSettings(req: AuthRequest, res: Response): Promise<void> {
    try {
      let settings = await AdminSettings.findOne({ key: 'GLOBAL_SETTINGS' });
      if (!settings) {
        settings = await AdminSettings.create({
          key: 'GLOBAL_SETTINGS',
          minFare: 10,
          maxFare: 150,
          commissionValue: 10,
        });
      }
      res.json({ success: true, settings });
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message });
    }
  }

  static async updateSettings(req: AuthRequest, res: Response): Promise<void> {
    try {
      const updates = req.body;
      const settings = await AdminSettings.findOneAndUpdate(
        { key: 'GLOBAL_SETTINGS' },
        { ...updates },
        { new: true, upsert: true }
      );
      res.json({ success: true, message: 'Admin settings saved successfully', settings });
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message });
    }
  }
}
