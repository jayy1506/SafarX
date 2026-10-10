import { Response } from 'express';
import { AuthRequest } from '../middlewares/auth.js';
import { Route } from '../models/Route.js';
import { Ride } from '../models/Ride.js';
import { RideSegment } from '../models/RideSegment.js';
import { Booking } from '../models/Booking.js';
import { Payment } from '../models/Payment.js';
import { Review } from '../models/Review.js';
import { Driver } from '../models/Driver.js';
import { SegmentEngine } from '../services/segmentEngine.js';
import { FareCalculator } from '../services/fareCalculator.js';
import { PaymentService } from '../services/paymentService.js';
import { RazorpayService } from '../services/razorpay.service.js';
import { RefundService } from '../services/refundService.js';
import { NotificationService } from '../services/notificationService.js';
import { logger } from '../utils/logger.js';

export class CustomerController {
  static async getRoutesAndStops(req: AuthRequest, res: Response): Promise<void> {
    try {
      const routes = await Route.find({ isActive: true });
      res.json({ success: true, routes });
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message });
    }
  }

  /**
   * Search available rides between pickup and drop on a specific date
   */
  static async searchRides(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { pickup, drop, date, seats = 1, minRating } = req.query;

      if (!pickup || !drop || !date) {
        res.status(400).json({ success: false, message: 'Pickup stop, drop stop, and date are required' });
        return;
      }

      const requestedSeats = parseInt(seats as string, 10) || 1;
      const rideDate = date as string;

      // Find rides on that date with status SCHEDULED
      const scheduledRides = await Ride.find({
        rideDate,
        status: 'SCHEDULED',
      })
        .populate('driver', 'fullName phone profilePhoto')
        .populate('vehicle', 'vehicleNumber model brand totalSeats color')
        .populate('route', 'name');

      const matchingRides = [];

      for (const ride of scheduledRides) {
        const pickupIdx = ride.stops.indexOf(pickup as string);
        const dropIdx = ride.stops.indexOf(drop as string);

        // Pickup must exist and occur BEFORE drop
        if (pickupIdx === -1 || dropIdx === -1 || pickupIdx >= dropIdx) {
          continue;
        }

        // Check segment availability
        const availability = await SegmentEngine.checkAvailability(
          ride._id,
          pickupIdx,
          dropIdx,
          requestedSeats
        );

        if (!availability.isAvailable) {
          continue;
        }

        // Calculate dynamic fare
        const fareInfo = await FareCalculator.calculateBookingFare(
          ride,
          pickupIdx,
          dropIdx,
          requestedSeats
        );

        // Fetch driver rating
        const driverProfile = await Driver.findOne({ user: (ride.driver as any)._id });
        const rating = driverProfile?.ratingAverage || 5.0;

        if (minRating && rating < parseFloat(minRating as string)) {
          continue;
        }

        matchingRides.push({
          rideId: ride._id,
          route: (ride.route as any)?.name,
          direction: ride.direction,
          originStop: ride.originStop,
          destinationStop: ride.destinationStop,
          pickupStop: pickup,
          pickupIndex: pickupIdx,
          dropStop: drop,
          dropIndex: dropIdx,
          departureTime: ride.departureTime,
          rideDate: ride.rideDate,
          driver: {
            id: (ride.driver as any)._id,
            fullName: (ride.driver as any).fullName,
            phone: (ride.driver as any).phone,
            rating,
            ridesCompleted: driverProfile?.totalRidesCompleted || 0,
          },
          vehicle: ride.vehicle,
          availableSeats: availability.availableSeats,
          requestedSeats,
          farePerSeat: fareInfo.farePerSeat,
          totalFare: fareInfo.totalAmount,
          stops: ride.stops,
        });
      }

      res.json({
        success: true,
        count: matchingRides.length,
        rides: matchingRides,
      });
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message });
    }
  }

  /**
   * Step 1: Initiate Booking & Seat Locking + Razorpay Order
   */
  static async initiateBooking(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { rideId, pickupStop, dropStop, seatsCount = 1 } = req.body;

      if (!rideId || !pickupStop || !dropStop) {
        res.status(400).json({ success: false, message: 'rideId, pickupStop, and dropStop are required' });
        return;
      }

      const seats = parseInt(seatsCount, 10) || 1;
      const ride = await Ride.findById(rideId);
      if (!ride || ride.status !== 'SCHEDULED') {
        res.status(400).json({ success: false, message: 'This ride is no longer available for booking' });
        return;
      }

      const pickupIdx = ride.stops.indexOf(pickupStop);
      const dropIdx = ride.stops.indexOf(dropStop);

      if (pickupIdx === -1 || dropIdx === -1 || pickupIdx >= dropIdx) {
        res.status(400).json({ success: false, message: 'Invalid pickup/drop sequence for this ride' });
        return;
      }

      // Check and hold seats atomically
      const seatHeld = await SegmentEngine.holdSeats(ride._id, pickupIdx, dropIdx, seats);
      if (!seatHeld) {
        res.status(400).json({ success: false, message: 'Sorry, the requested seats are no longer available' });
        return;
      }

      // Calculate server authority fare
      const fareInfo = await FareCalculator.calculateBookingFare(ride, pickupIdx, dropIdx, seats);

      const bookingNumber = `BK-${Date.now().toString().slice(-6)}-${Math.floor(10 + Math.random() * 90)}`;
      const holdExpiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 mins
      const boardingOtp = Math.floor(1000 + Math.random() * 9000).toString();

      const booking = await Booking.create({
        bookingNumber,
        customer: req.user!._id,
        ride: ride._id,
        pickupStop,
        pickupIndex: pickupIdx,
        dropStop,
        dropIndex: dropIdx,
        seatsBooked: seats,
        farePerSeat: fareInfo.farePerSeat,
        subtotal: fareInfo.subtotal,
        platformCommission: fareInfo.platformCommission,
        driverEarnings: fareInfo.driverEarnings,
        totalAmount: fareInfo.totalAmount,
        amountInPaise: Math.round(fareInfo.totalAmount * 100),
        bookingStatus: 'PENDING_PAYMENT',
        paymentStatus: 'PENDING',
        holdExpiresAt,
        boardingOtp,
      });

      // Generate Razorpay Order
      const paymentOrder = await RazorpayService.createOrder(booking);

      res.status(201).json({
        success: true,
        message: 'Booking initiated. Please complete Razorpay payment.',
        booking: {
          id: booking._id,
          bookingNumber: booking.bookingNumber,
          pickupStop,
          dropStop,
          seatsBooked: seats,
          totalAmount: booking.totalAmount,
          holdExpiresAt: booking.holdExpiresAt,
        },
        paymentOrder,
      });
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message });
    }
  }

  /**
   * Step 2: Verify Razorpay Payment & Confirm Booking
   */
  static async verifyPayment(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { bookingId, razorpayOrderId, razorpayPaymentId, razorpaySignature } = req.body;

      if (!bookingId || !razorpayOrderId || !razorpayPaymentId || !razorpaySignature) {
        res.status(400).json({
          success: false,
          message: 'bookingId, razorpayOrderId, razorpayPaymentId, and razorpaySignature are required',
        });
        return;
      }

      const booking = await Booking.findById(bookingId).populate('ride');
      if (!booking) {
        res.status(404).json({ success: false, message: 'Booking record not found' });
        return;
      }

      // Check ownership
      if (!booking.customer.equals(req.user!._id) && req.user!.role !== 'ADMIN') {
        res.status(403).json({ success: false, message: 'Forbidden. You do not own this booking.' });
        return;
      }

      if (booking.bookingStatus === 'CONFIRMED') {
        res.json({ success: true, message: 'Booking is already confirmed', booking });
        return;
      }

      // Cryptographic verification
      const verifyResult = await PaymentService.verifyAndCapturePayment(
        bookingId,
        razorpayOrderId,
        razorpayPaymentId,
        razorpaySignature
      );

      if (!verifyResult.success) {
        // Release held seats
        await SegmentEngine.releaseHeldSeats(
          booking.ride._id,
          booking.pickupIndex,
          booking.dropIndex,
          booking.seatsBooked
        );
        res.status(400).json({ success: false, message: 'Payment verification failed. Seat hold released.' });
        return;
      }

      // Mark permanently booked
      await SegmentEngine.confirmHeldSeats(
        booking.ride._id,
        booking.pickupIndex,
        booking.dropIndex,
        booking.seatsBooked
      );

      booking.bookingStatus = 'CONFIRMED';
      booking.paymentStatus = 'SUCCESS';
      booking.payment = (verifyResult.payment as any)._id;
      await booking.save();

      // Dispatch Notifications
      const ride = booking.ride as any;
      if (ride?.driver) {
        await NotificationService.notifyBookingConfirmed(req.user!._id, ride.driver, booking);
      }

      res.json({
        success: true,
        message: 'Payment verified! Booking confirmed 🎉',
        booking: {
          id: booking._id,
          bookingNumber: booking.bookingNumber,
          pickupStop: booking.pickupStop,
          dropStop: booking.dropStop,
          seatsBooked: booking.seatsBooked,
          totalAmount: booking.totalAmount,
          boardingOtp: booking.boardingOtp,
          bookingStatus: booking.bookingStatus,
          paymentStatus: booking.paymentStatus,
        },
      });
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message });
    }
  }

  /**
   * Cancel Booking with dynamic policy refund
   */
  static async cancelBooking(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { bookingId } = req.params;
      const { reason } = req.body;

      const booking = await Booking.findOne({ _id: bookingId, customer: req.user!._id }).populate('ride');
      if (!booking) {
        res.status(404).json({ success: false, message: 'Booking not found' });
        return;
      }

      if (!['CONFIRMED', 'PENDING_PAYMENT'].includes(booking.bookingStatus)) {
        res.status(400).json({ success: false, message: `Cannot cancel booking with status ${booking.bookingStatus}` });
        return;
      }

      const ride = booking.ride as any;

      // Calculate refund
      const refundCalc = await RefundService.calculateCustomerRefund(booking, ride);

      // Release seats
      if (booking.bookingStatus === 'CONFIRMED') {
        await SegmentEngine.releaseBookedSeats(
          ride._id,
          booking.pickupIndex,
          booking.dropIndex,
          booking.seatsBooked
        );
      } else {
        await SegmentEngine.releaseHeldSeats(
          ride._id,
          booking.pickupIndex,
          booking.dropIndex,
          booking.seatsBooked
        );
      }

      booking.bookingStatus = 'CANCELLED_BY_CUSTOMER';
      booking.paymentStatus = refundCalc.refundAmount > 0 ? 'REFUNDED' : 'SUCCESS';
      booking.cancellation = {
        cancelledAt: new Date(),
        cancelledBy: 'CUSTOMER',
        reason: reason || 'Customer requested cancellation',
        refundAmount: refundCalc.refundAmount,
        penaltyAmount: refundCalc.penaltyAmount,
        refundStatus: refundCalc.refundAmount > 0 ? 'INITIATED' : 'NOT_APPLICABLE',
      };

      // Execute gateway refund if booking was confirmed and refund is applicable
      if (booking.payment && refundCalc.refundAmount > 0) {
        try {
          const payment = await Payment.findById(booking.payment);
          if (payment && payment.status === 'CAPTURED') {
            await RazorpayService.processRefund(payment, refundCalc.refundAmount, {
              bookingNumber: booking.bookingNumber,
              reason: reason || 'Customer cancellation',
            });
            booking.cancellation.refundStatus = 'COMPLETED';
          }
        } catch (refundErr) {
          logger.warn({ error: (refundErr as any).message }, 'Gateway refund processing error during cancellation');
        }
      }

      await booking.save();

      // Notify Driver
      await NotificationService.sendNotification(
        ride.driver,
        'DRIVER',
        'Passenger Cancelled Booking',
        `Passenger cancelled booking for ${booking.seatsBooked} seat(s) on ${booking.pickupStop} → ${booking.dropStop}.`,
        'PASSENGER_CANCELLED'
      );

      res.json({
        success: true,
        message: 'Booking cancelled successfully',
        refundDetails: refundCalc,
      });
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message });
    }
  }

  static async getMyBookings(req: AuthRequest, res: Response): Promise<void> {
    try {
      const bookings = await Booking.find({ customer: req.user!._id })
        .populate({
          path: 'ride',
          populate: [
            { path: 'driver', select: 'fullName phone profilePhoto' },
            { path: 'vehicle', select: 'vehicleNumber model brand color' },
            { path: 'route', select: 'name' },
          ],
        })
        .sort({ createdAt: -1 });

      res.json({ success: true, bookings });
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message });
    }
  }

  static async submitReview(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { bookingId, rating, comment } = req.body;

      if (!bookingId || !rating) {
        res.status(400).json({ success: false, message: 'bookingId and rating are required' });
        return;
      }

      const booking = await Booking.findOne({ _id: bookingId, customer: req.user!._id }).populate('ride');
      if (!booking) {
        res.status(404).json({ success: false, message: 'Booking not found' });
        return;
      }

      if (booking.bookingStatus !== 'COMPLETED') {
        res.status(400).json({ success: false, message: 'You can only review completed rides' });
        return;
      }

      const ride = booking.ride as any;

      const review = await Review.create({
        booking: booking._id,
        ride: ride._id,
        reviewer: req.user!._id,
        reviewerRole: 'CUSTOMER',
        targetUser: ride.driver,
        rating: Number(rating),
        comment: comment || '',
      });

      // Update Driver aggregate rating
      const driver = await Driver.findOne({ user: ride.driver });
      if (driver) {
        const totalRatings = driver.ratingAverage * driver.ratingCount + Number(rating);
        driver.ratingCount += 1;
        driver.ratingAverage = parseFloat((totalRatings / driver.ratingCount).toFixed(1));
        await driver.save();
      }

      res.status(201).json({ success: true, message: 'Review submitted successfully', review });
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message });
    }
  }
}
