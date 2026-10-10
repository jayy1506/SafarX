import { AdminSettings, IAdminSettings } from '../models/AdminSettings.js';
import { IRide } from '../models/Ride.js';
import { IRoute } from '../models/Route.js';

export interface FareBreakdown {
  farePerSeat: number;
  subtotal: number;
  platformCommission: number;
  driverEarnings: number;
  totalAmount: number;
  segmentCount: number;
}

export class FareCalculator {
  static async getActiveAdminSettings(): Promise<IAdminSettings> {
    let settings = await AdminSettings.findOne({ key: 'GLOBAL_SETTINGS' });
    if (!settings) {
      settings = await AdminSettings.create({
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
      });
    }
    return settings;
  }

  /**
   * Calculates dynamic server fare for a span of stops
   */
  static async calculateBookingFare(
    ride: IRide,
    pickupIndex: number,
    dropIndex: number,
    seatsCount: number
  ): Promise<FareBreakdown> {
    const settings = await this.getActiveAdminSettings();
    const totalSegments = ride.stops.length - 1;
    const requestedSegments = Math.max(1, dropIndex - pickupIndex);

    // Bounded daily fare
    let effectiveDailyFare = ride.dailyFare;
    if (effectiveDailyFare < settings.minFare) effectiveDailyFare = settings.minFare;
    if (effectiveDailyFare > settings.maxFare) effectiveDailyFare = settings.maxFare;

    // Segment fare ratio
    const segmentRatio = requestedSegments / totalSegments;
    let farePerSeat = Math.max(settings.minFare, Math.round(effectiveDailyFare * segmentRatio));

    // Subtotal
    const subtotal = farePerSeat * seatsCount;

    // Commission
    let platformCommission = 0;
    if (settings.commissionType === 'PERCENTAGE') {
      platformCommission = Math.round((subtotal * settings.commissionValue) / 100);
    } else {
      platformCommission = Math.min(subtotal, settings.commissionValue * seatsCount);
    }

    const driverEarnings = Math.max(0, subtotal - platformCommission);
    const totalAmount = subtotal;

    return {
      farePerSeat,
      subtotal,
      platformCommission,
      driverEarnings,
      totalAmount,
      segmentCount: requestedSegments,
    };
  }
}
