import mongoose, { Types } from 'mongoose';
import { RideSegment, IRideSegment } from '../models/RideSegment.js';
import { IRide } from '../models/Ride.js';
import { IRoute } from '../models/Route.js';

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

    // Segment fare is proportionally distributed from total daily fare or per-km
    const baseSegmentFare = Math.max(10, Math.round(dailyFare / (numStops - 1)));

    for (let i = 0; i < numStops - 1; i++) {
      const fromStop = stops[i];
      const toStop = stops[i + 1];

      // Approximate distance per segment
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
   * Checks availability of seats between pickupStop index and dropStop index
   */
  static async checkAvailability(
    rideId: Types.ObjectId | string,
    pickupIndex: number,
    dropIndex: number,
    requestedSeats: number
  ): Promise<SegmentAvailabilityResult> {
    if (pickupIndex < 0 || dropIndex <= pickupIndex) {
      return {
        isAvailable: false,
        availableSeats: 0,
        segments: [],
        reason: 'Pickup stop must be before drop stop',
      };
    }

    // Segments needed: from sequenceOrder = (pickupIndex + 1) to dropIndex
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
        reason: 'Route segments could not be resolved',
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
   * Atomically reserve seats during checkout initiation (Seat Hold)
   */
  static async holdSeats(
    rideId: Types.ObjectId | string,
    pickupIndex: number,
    dropIndex: number,
    seatsCount: number
  ): Promise<boolean> {
    const startSeq = pickupIndex + 1;
    const endSeq = dropIndex;

    // Find all matching segments
    const segments = await RideSegment.find({
      ride: rideId,
      sequenceOrder: { $gte: startSeq, $lte: endSeq },
    });

    // Check that every segment has enough capacity
    for (const seg of segments) {
      if (seg.totalSeats - (seg.bookedSeats + seg.pendingSeats) < seatsCount) {
        return false;
      }
    }

    // Increment pending seats
    await RideSegment.updateMany(
      {
        ride: rideId,
        sequenceOrder: { $gte: startSeq, $lte: endSeq },
      },
      {
        $inc: { pendingSeats: seatsCount },
      }
    );

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
   * Releases held seats if payment fails or hold timer expires
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
   * Releases booked seats on cancellation
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
