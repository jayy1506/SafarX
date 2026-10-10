import { Response } from 'express';
import { AuthRequest } from '../middlewares/auth.js';
import { Driver } from '../models/Driver.js';
import { Vehicle } from '../models/Vehicle.js';
import { Route } from '../models/Route.js';
import { Ride } from '../models/Ride.js';
import { RideSegment } from '../models/RideSegment.js';
import { Booking } from '../models/Booking.js';
import { Payment } from '../models/Payment.js';
import { AdminSettings } from '../models/AdminSettings.js';
import { SegmentEngine } from '../services/segmentEngine.js';
import { NotificationService } from '../services/notificationService.js';
import { RefundService } from '../services/refundService.js';

export class DriverController {
  static async getProfile(req: AuthRequest, res: Response): Promise<void> {
    try {
      const driver = await Driver.findOne({ user: req.user!._id }).populate('user');
      if (!driver) {
        res.status(404).json({ success: false, message: 'Driver profile not found' });
        return;
      }

      const vehicle = await Vehicle.findOne({ driver: driver._id });

      res.json({ success: true, driver, vehicle });
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message });
    }
  }

  static async updateVehicle(req: AuthRequest, res: Response): Promise<void> {
    try {
      const driver = await Driver.findOne({ user: req.user!._id });
      if (!driver) {
        res.status(404).json({ success: false, message: 'Driver profile not found' });
        return;
      }

      const { vehicleNumber, vehicleType, brand, model, color, totalSeats, rcNumber } = req.body;

      let vehicle = await Vehicle.findOne({ driver: driver._id });
      if (vehicle) {
        vehicle.vehicleNumber = vehicleNumber || vehicle.vehicleNumber;
        vehicle.vehicleType = vehicleType || vehicle.vehicleType;
        vehicle.brand = brand || vehicle.brand;
        vehicle.model = model || vehicle.model;
        vehicle.color = color || vehicle.color;
        vehicle.totalSeats = totalSeats || vehicle.totalSeats;
        vehicle.rcNumber = rcNumber || vehicle.rcNumber;
        await vehicle.save();
      } else {
        vehicle = await Vehicle.create({
          driver: driver._id,
          vehicleNumber,
          vehicleType: vehicleType || 'CAR',
          brand,
          model,
          color: color || 'White',
          totalSeats: totalSeats || 4,
          rcNumber: rcNumber || `RC-${vehicleNumber}`,
          status: 'APPROVED',
        });
      }

      res.json({ success: true, message: 'Vehicle details saved successfully', vehicle });
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message });
    }
  }

  /**
   * Publish Daily Ride (with Admin fare limits enforcement & segment creation)
   */
  static async publishRide(req: AuthRequest, res: Response): Promise<void> {
    try {
      const driver = await Driver.findOne({ user: req.user!._id });
      if (!driver) {
        res.status(403).json({ success: false, message: 'Driver profile not found' });
        return;
      }

      if (driver.verificationStatus !== 'APPROVED') {
        res.status(403).json({
          success: false,
          message: `Only APPROVED drivers can publish rides. Current status: ${driver.verificationStatus}`,
        });
        return;
      }

      const vehicle = await Vehicle.findOne({ driver: driver._id, status: 'APPROVED' });
      if (!vehicle) {
        res.status(400).json({ success: false, message: 'No approved vehicle found for this driver' });
        return;
      }

      const { routeId, direction = 'FORWARD', rideDate, departureTime, totalSeats, dailyFare } = req.body;

      if (!routeId || !rideDate || !departureTime || !dailyFare) {
        res.status(400).json({ success: false, message: 'Route, date, departure time, and fare are required' });
        return;
      }

      const route = await Route.findById(routeId);
      if (!route || !route.isActive) {
        res.status(404).json({ success: false, message: 'Active route not found' });
        return;
      }

      // Check admin bounds for fare
      const settings = await AdminSettings.findOne({ key: 'GLOBAL_SETTINGS' });
      const minFare = settings?.minFare || 10;
      const maxFare = settings?.maxFare || 200;

      if (dailyFare < minFare || dailyFare > maxFare) {
        res.status(400).json({
          success: false,
          message: `Daily fare must be between ₹${minFare} and ₹${maxFare} as per admin policy`,
        });
        return;
      }

      // Determine directional stops
      const orderedStops = route.getStopsForDirection(direction);
      const stopNames = orderedStops.map((s) => s.name);

      const seats = totalSeats ? Math.min(totalSeats, vehicle.totalSeats) : vehicle.totalSeats;

      const ride = await Ride.create({
        driver: req.user!._id,
        vehicle: vehicle._id,
        route: route._id,
        direction,
        originStop: stopNames[0],
        destinationStop: stopNames[stopNames.length - 1],
        stops: stopNames,
        rideDate,
        departureTime,
        totalSeats: seats,
        availableSeatsCount: seats,
        dailyFare,
        status: 'SCHEDULED',
      });

      // Generate atomic consecutive segments
      await SegmentEngine.createSegmentsForRide(ride._id, stopNames, seats, dailyFare, route);

      res.status(201).json({
        success: true,
        message: 'Ride published successfully and available for bookings',
        ride,
      });
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message });
    }
  }

  /**
   * Get Today's Ride & Passengers
   */
  static async getTodayRide(req: AuthRequest, res: Response): Promise<void> {
    try {
      const todayStr = new Date().toISOString().split('T')[0];

      // Find active or scheduled ride for today or nearest upcoming
      const ride = await Ride.findOne({
        driver: req.user!._id,
        status: { $in: ['SCHEDULED', 'ACTIVE'] },
      })
        .sort({ rideDate: 1, departureTime: 1 })
        .populate('vehicle', 'vehicleNumber model brand totalSeats color')
        .populate('route', 'name');

      if (!ride) {
        res.json({ success: true, ride: null, passengers: [] });
        return;
      }

      // Fetch passengers booked for this ride
      const bookings = await Booking.find({
        ride: ride._id,
        bookingStatus: { $in: ['CONFIRMED', 'BOARDED', 'NO_SHOW'] },
      }).populate('customer', 'fullName phone profilePhoto');

      const segments = await RideSegment.find({ ride: ride._id }).sort({ sequenceOrder: 1 });

      // Calculate total booked seats across segments
      const totalSeats = ride.totalSeats;
      let minAvailableSeats = totalSeats;
      for (const seg of segments) {
        const avail = seg.totalSeats - (seg.bookedSeats + seg.pendingSeats);
        if (avail < minAvailableSeats) minAvailableSeats = avail;
      }

      const bookedCount = totalSeats - minAvailableSeats;

      res.json({
        success: true,
        ride: {
          ...ride.toObject(),
          availableSeats: Math.max(0, minAvailableSeats),
          bookedSeats: Math.max(0, bookedCount),
        },
        passengers: bookings,
        segments,
      });
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message });
    }
  }

  /**
   * Driver updates daily fare for upcoming ride
   */
  static async updateRideFare(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { rideId } = req.params;
      const { dailyFare } = req.body;

      const ride = await Ride.findOne({ _id: rideId, driver: req.user!._id, status: 'SCHEDULED' });
      if (!ride) {
        res.status(404).json({ success: false, message: 'Scheduled ride not found' });
        return;
      }

      const settings = await AdminSettings.findOne({ key: 'GLOBAL_SETTINGS' });
      if (settings && !settings.allowDriverFareAdjustment) {
        res.status(403).json({ success: false, message: 'Admin has disabled custom driver fare adjustments' });
        return;
      }

      const minFare = settings?.minFare || 10;
      const maxFare = settings?.maxFare || 200;

      if (dailyFare < minFare || dailyFare > maxFare) {
        res.status(400).json({ success: false, message: `Fare must be between ₹${minFare} and ₹${maxFare}` });
        return;
      }

      ride.dailyFare = dailyFare;
      await ride.save();

      // Recalculate segment fares
      const segmentFare = Math.max(10, Math.round(dailyFare / (ride.stops.length - 1)));
      await RideSegment.updateMany({ ride: ride._id }, { segmentFare });

      res.json({ success: true, message: 'Fare updated successfully', ride });
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message });
    }
  }

  /**
   * Passenger Boarding Verification
   */
  static async markBoarded(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { bookingId } = req.params;
      const { otp } = req.body;

      const booking = await Booking.findById(bookingId).populate('customer', 'fullName phone');
      if (!booking) {
        res.status(404).json({ success: false, message: 'Booking not found' });
        return;
      }

      if (booking.boardingOtp !== otp) {
        res.status(400).json({ success: false, message: 'Invalid Boarding OTP provided by passenger' });
        return;
      }

      booking.bookingStatus = 'BOARDED';
      booking.boardedAt = new Date();
      await booking.save();

      res.json({ success: true, message: `Passenger ${(booking.customer as any)?.fullName || 'Passenger'} marked as BOARDED`, booking });
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message });
    }
  }

  static async markNoShow(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { bookingId } = req.params;
      const booking = await Booking.findById(bookingId);
      if (!booking) {
        res.status(404).json({ success: false, message: 'Booking not found' });
        return;
      }

      booking.bookingStatus = 'NO_SHOW';
      await booking.save();

      res.json({ success: true, message: 'Passenger marked as No-Show', booking });
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message });
    }
  }

  static async startRide(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { rideId } = req.params;
      const ride = await Ride.findOne({ _id: rideId, driver: req.user!._id });
      if (!ride) {
        res.status(404).json({ success: false, message: 'Ride not found' });
        return;
      }

      ride.status = 'ACTIVE';
      ride.startedAt = new Date();
      await ride.save();

      // Notify all confirmed passengers
      const bookings = await Booking.find({ ride: ride._id, bookingStatus: 'CONFIRMED' });
      for (const b of bookings) {
        await NotificationService.sendNotification(
          b.customer,
          'CUSTOMER',
          'Ride Started! 🚗',
          `Your driver has started the ride from ${ride.originStop}. Please be ready at ${b.pickupStop}.`,
          'RIDE_STARTED',
          { rideId: ride._id }
        );
      }

      res.json({ success: true, message: 'Ride started successfully', ride });
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message });
    }
  }

  static async endRide(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { rideId } = req.params;
      const ride = await Ride.findOne({ _id: rideId, driver: req.user!._id });
      if (!ride) {
        res.status(404).json({ success: false, message: 'Ride not found' });
        return;
      }

      ride.status = 'COMPLETED';
      ride.completedAt = new Date();
      await ride.save();

      // Complete all boarded/confirmed bookings and compute driver earnings
      const bookings = await Booking.find({
        ride: ride._id,
        bookingStatus: { $in: ['BOARDED', 'CONFIRMED'] },
      });

      let tripEarnings = 0;
      for (const b of bookings) {
        b.bookingStatus = 'COMPLETED';
        await b.save();
        tripEarnings += b.driverEarnings;

        // Prompt customer to rate
        await NotificationService.sendNotification(
          b.customer,
          'CUSTOMER',
          'Ride Completed! Rate your ride ⭐',
          `Thank you for traveling with ${(req.user as any)?.fullName || 'Driver'}. Please share your review.`,
          'RIDE_COMPLETED',
          { rideId: ride._id, bookingId: b._id }
        );
      }

      // Update Driver total earnings
      const driver = await Driver.findOne({ user: req.user!._id });
      if (driver) {
        driver.totalEarnings += tripEarnings;
        driver.todayEarnings += tripEarnings;
        driver.totalRidesCompleted += 1;
        await driver.save();
      }

      res.json({
        success: true,
        message: 'Ride completed successfully',
        tripEarnings,
        completedPassengers: bookings.length,
      });
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message });
    }
  }

  static async cancelRide(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { rideId } = req.params;
      const { reason } = req.body;

      const ride = await Ride.findOne({ _id: rideId, driver: req.user!._id });
      if (!ride) {
        res.status(404).json({ success: false, message: 'Ride not found' });
        return;
      }

      ride.status = 'CANCELLED';
      ride.cancellationReason = reason || 'Cancelled by driver';
      ride.cancelledBy = 'DRIVER';
      await ride.save();

      // Cancel all bookings & initiate 100% refund
      const bookings = await Booking.find({
        ride: ride._id,
        bookingStatus: { $in: ['CONFIRMED', 'PENDING_PAYMENT'] },
      });

      for (const b of bookings) {
        b.bookingStatus = 'CANCELLED_BY_DRIVER';
        b.paymentStatus = 'REFUNDED';
        b.cancellation = {
          cancelledAt: new Date(),
          cancelledBy: 'DRIVER',
          reason: reason || 'Driver cancelled trip',
          refundAmount: b.totalAmount,
          penaltyAmount: 0,
          refundStatus: 'COMPLETED',
        };
        await b.save();

        // Release segment seats
        await SegmentEngine.releaseBookedSeats(ride._id, b.pickupIndex, b.dropIndex, b.seatsBooked);

        // Notify customer
        await NotificationService.notifyRideCancelledByDriver(b.customer, ride);
      }

      res.json({
        success: true,
        message: 'Ride cancelled and 100% refunds initiated to all passengers',
      });
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message });
    }
  }

  static async getEarnings(req: AuthRequest, res: Response): Promise<void> {
    try {
      const driver = await Driver.findOne({ user: req.user!._id });
      if (!driver) {
        res.status(404).json({ success: false, message: 'Driver profile not found' });
        return;
      }

      const rides = await Ride.find({ driver: req.user!._id }).select('_id');
      const rideIds = rides.map((r) => r._id);

      const completedBookings = await Booking.find({
        ride: { $in: rideIds },
        bookingStatus: 'COMPLETED',
      });

      let totalGross = 0;
      let totalCommission = 0;
      let netEarnings = 0;

      for (const b of completedBookings) {
        totalGross += b.totalAmount;
        totalCommission += b.platformCommission;
        netEarnings += b.driverEarnings;
      }

      res.json({
        success: true,
        earnings: {
          todayEarnings: driver.todayEarnings,
          totalEarnings: netEarnings || driver.totalEarnings,
          totalGross,
          totalCommission,
          completedRides: driver.totalRidesCompleted,
          ratingAverage: driver.ratingAverage,
          ratingCount: driver.ratingCount,
        },
      });
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message });
    }
  }
}
