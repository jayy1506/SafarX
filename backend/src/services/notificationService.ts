import { Notification } from '../models/Notification.js';
import { Types } from 'mongoose';

export class NotificationService {
  static async sendNotification(
    recipientId: Types.ObjectId | string,
    recipientRole: 'ADMIN' | 'DRIVER' | 'CUSTOMER',
    title: string,
    message: string,
    type: string,
    data: Record<string, any> = {}
  ) {
    try {
      const notification = await Notification.create({
        recipient: recipientId,
        recipientRole,
        title,
        message,
        type,
        data,
        isRead: false,
      });

      console.log(`[Notification to ${recipientRole} ${recipientId}]: [${title}] ${message}`);
      return notification;
    } catch (err) {
      console.error('[Notification Dispatch Error]', err);
    }
  }

  static async notifyBookingConfirmed(customerId: Types.ObjectId | string, driverId: Types.ObjectId | string, booking: any) {
    // Notify Customer
    await this.sendNotification(
      customerId,
      'CUSTOMER',
      'Booking Confirmed! 🎉',
      `Your ride from ${booking.pickupStop} to ${booking.dropStop} is confirmed. Boarding OTP: ${booking.boardingOtp}`,
      'BOOKING_CONFIRMED',
      { bookingId: booking._id }
    );

    // Notify Driver
    await this.sendNotification(
      driverId,
      'DRIVER',
      'New Passenger Booked! 🚗',
      `New passenger booked ${booking.seatsBooked} seat(s) from ${booking.pickupStop} to ${booking.dropStop}.`,
      'DRIVER_NEW_PASSENGER',
      { bookingId: booking._id }
    );
  }

  static async notifyRideCancelledByDriver(customerId: Types.ObjectId | string, ride: any) {
    await this.sendNotification(
      customerId,
      'CUSTOMER',
      'Ride Cancelled by Driver ⚠️',
      `Your ride on ${ride.rideDate} (${ride.originStop} → ${ride.destinationStop}) was cancelled by driver. Full refund has been initiated.`,
      'RIDE_CANCELLED_DRIVER',
      { rideId: ride._id }
    );
  }
}
