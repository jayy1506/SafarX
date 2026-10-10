import mongoose, { Types } from 'mongoose';
import { RideSegment, IRideSegment } from '../models/RideSegment.js';
import { Booking } from '../models/Booking.js';
import { IRoute } from '../models/Route.js';
import { logger } from '../utils/logger.js';

export interface SegmentAvailabilityResult {
  isAvailable: boolean;
  availableSeats: number;
  segments: IRideSegment[];
  reason?: string;
}

export class SegmentEngine {
  /**
   * Initializes atomic consecutive segments for a new ride
   */
  static async createSegmentsForRide(
    rideId: Types.ObjectId | string,
    stops: string[],
    totalSeats: number,
    dailyFare: number,
    route: IRoute
  ): Promise<IRideSegment[]> {
    const segmentsData = [];
    const numStops = stops.length;

    if (numStops < 2) {
      throw new Error('A ride must have at least 2 stops to generate segments');
    }

    // Segment fare is proportionally distributed from total daily fare
    const baseSegmentFare = Math.max(10, Math.round(dailyFare / (numStops - 1)));

    for (let i = 0; i < numStops - 1; i++) {
      const fromStop = stops[i];
      const toStop = stops[i + 1];
      const approxDist = parseFloat((route.totalDistanceKm / (numStops - 1)).toFixed(1));

      segmentsData.push({
        ride: rideId,
        fromStop,
        toStop,
        sequenceOrder: i + 1,
        totalSeats,
        bookedSeats: 0,
        pendingSeats: 0,
        distanceKm: approxDist,
        segmentFare: baseSegmentFare,
      });
    }

    return (await RideSegment.insertMany(segmentsData)) as any;
  }

  /**
   * Releases all expired seat holds where payment was not completed within the timeout window
   */
  static async releaseExpiredHolds(): Promise<number> {
    try {
      const now = new Date();
      const expiredBookings = await Booking.find({
        bookingStatus: 'PENDING_PAYMENT',
        holdExpiresAt: { $lte: now },
      });

      if (expiredBookings.length === 0) return 0;

      let releasedCount = 0;
      for (const booking of expiredBookings) {
        // Atomically transition status to prevent double-reaping
        const updated = await Booking.findOneAndUpdate(
          {
            _id: booking._id,
            bookingStatus: 'PENDING_PAYMENT',
          },
          {
            bookingStatus: 'CANCELLED_BY_SYSTEM',
            'cancellation.cancelledAt': now,
            'cancellation.cancelledBy': 'SYSTEM',
            'cancellation.reason': 'Seat hold reservation expired without payment completion',
            'cancellation.refundStatus': 'NOT_APPLICABLE',
          }
        );

        if (updated) {
          await this.releaseHeldSeats(
            booking.ride,
            booking.pickupIndex,
            booking.dropIndex,
            booking.seatsBooked
          );
          releasedCount++;
          logger.info(
            { bookingId: booking._id, bookingNumber: booking.bookingNumber },
            '[SegmentEngine] Released expired seat hold safely'
          );
        }
      }

      return releasedCount;
    } catch (err: any) {
      logger.error({ error: err.message }, '[SegmentEngine] Error releasing expired holds');
      return 0;
    }
  }

  /**
   * Checks availability of seats between pickupStop index and dropStop index
   */
  static async checkAvailability(
    rideId: Types.ObjectId | string,
    pickupIndex: number,
    dropIndex: number,
    requestedSeats: number = 1
  ): Promise<SegmentAvailabilityResult> {
    if (pickupIndex < 0 || dropIndex <= pickupIndex) {
      return {
        isAvailable: false,
        availableSeats: 0,
        segments: [],
        reason: 'Pickup stop must be before drop stop in corridor sequence',
      };
    }

    // Release expired holds first to ensure accurate real-time capacity
    await this.releaseExpiredHolds();

    const startSeq = pickupIndex + 1;
    const endSeq = dropIndex;

    const segments = await RideSegment.find({
      ride: rideId,
      sequenceOrder: { $gte: startSeq, $lte: endSeq },
    }).sort({ sequenceOrder: 1 });

    if (segments.length !== endSeq - startSeq + 1) {
      return {
        isAvailable: false,
        availableSeats: 0,
        segments: [],
        reason: 'Corridor segments could not be resolved',
      };
    }

    let minAvailable = Infinity;
    for (const seg of segments) {
      const available = seg.totalSeats - (seg.bookedSeats + seg.pendingSeats);
      if (available < minAvailable) {
        minAvailable = available;
      }
    }

    const maxBookable = Math.max(0, minAvailable);
    const isAvailable = maxBookable >= requestedSeats;

    return {
      isAvailable,
      availableSeats: maxBookable,
      segments,
      reason: isAvailable ? undefined : `Only ${maxBookable} seats remaining for this segment span`,
    };
  }

  /**
   * Atomically reserve seats during checkout initiation (Concurrent-Safe Seat Hold)
   * Prevents overbooking under high concurrency using atomic conditional document updates
   * and automatic rollback if any segment fails.
   */
  static async holdSeats(
    rideId: Types.ObjectId | string,
    pickupIndex: number,
    dropIndex: number,
    seatsCount: number
  ): Promise<boolean> {
    if (seatsCount < 1) return false;

    // Release any expired holds first
    await this.releaseExpiredHolds();

    const startSeq = pickupIndex + 1;
    const endSeq = dropIndex;

    const segments = await RideSegment.find({
      ride: rideId,
      sequenceOrder: { $gte: startSeq, $lte: endSeq },
    }).sort({ sequenceOrder: 1 });

    if (segments.length !== endSeq - startSeq + 1) {
      return false;
    }

    // Quick pre-check
    for (const seg of segments) {
      if (seg.totalSeats - (seg.bookedSeats + seg.pendingSeats) < seatsCount) {
        return false;
      }
    }

    // Atomic two-phase reservation: update segments conditionally one-by-one.
    // If any update fails due to a concurrent race condition, rollback previously touched segments.
    const successfullyHeldSegments: any[] = [];

    for (const seg of segments) {
      const updated = await RideSegment.findOneAndUpdate(
        {
          _id: seg._id,
          $expr: {
            $lte: [{ $add: ['$bookedSeats', '$pendingSeats', seatsCount] }, '$totalSeats'],
          },
        },
        {
          $inc: { pendingSeats: seatsCount },
        },
        { new: true }
      );

      if (!updated) {
        // Concurrency collision! Another customer acquired the last seat on this segment.
        // Rollback all previously updated segments in this batch.
        for (const rolledSeg of successfullyHeldSegments) {
          await RideSegment.updateOne(
            { _id: rolledSeg._id },
            { $inc: { pendingSeats: -seatsCount } }
          );
        }
        logger.warn(
          { rideId, sequenceOrder: seg.sequenceOrder },
          '[SegmentEngine] Concurrent hold collision averted. Rolled back reservation.'
        );
        return false;
      }

      successfullyHeldSegments.push(updated);
    }

    return true;
  }

  /**
   * Confirms held seats after successful payment capture
   */
  static async confirmHeldSeats(
    rideId: Types.ObjectId | string,
    pickupIndex: number,
    dropIndex: number,
    seatsCount: number
  ): Promise<void> {
    const startSeq = pickupIndex + 1;
    const endSeq = dropIndex;

    await RideSegment.updateMany(
      {
        ride: rideId,
        sequenceOrder: { $gte: startSeq, $lte: endSeq },
      },
      {
        $inc: { pendingSeats: -seatsCount, bookedSeats: seatsCount },
      }
    );
  }

  /**
   * Releases held seats if payment fails or checkout is cancelled
   */
  static async releaseHeldSeats(
    rideId: Types.ObjectId | string,
    pickupIndex: number,
    dropIndex: number,
    seatsCount: number
  ): Promise<void> {
    const startSeq = pickupIndex + 1;
    const endSeq = dropIndex;

    await RideSegment.updateMany(
      {
        ride: rideId,
        sequenceOrder: { $gte: startSeq, $lte: endSeq },
      },
      {
        $inc: { pendingSeats: -seatsCount },
      }
    );
  }

  /**
   * Releases booked seats on passenger or driver cancellation
   */
  static async releaseBookedSeats(
    rideId: Types.ObjectId | string,
    pickupIndex: number,
    dropIndex: number,
    seatsCount: number
  ): Promise<void> {
    const startSeq = pickupIndex + 1;
    const endSeq = dropIndex;

    await RideSegment.updateMany(
      {
        ride: rideId,
        sequenceOrder: { $gte: startSeq, $lte: endSeq },
      },
      {
        $inc: { bookedSeats: -seatsCount },
      }
    );
  }
}
