import { AdminSettings } from '../models/AdminSettings.js';
import { IBooking } from '../models/Booking.js';
import { IRide } from '../models/Ride.js';

export interface RefundCalculation {
  refundAmount: number;
  penaltyAmount: number;
  refundPercentage: number;
  reason: string;
}

export class RefundService {
  /**
   * Calculates refund for customer cancellation based on Admin cancellation policy tiers
   */
  static async calculateCustomerRefund(booking: IBooking, ride: IRide): Promise<RefundCalculation> {
    const settings = await AdminSettings.findOne({ key: 'GLOBAL_SETTINGS' });
    const tiers = settings?.customerCancellationTiers || [
      { minutesBeforeDeparture: 120, refundPercentage: 100, description: '>2h: 100% refund' },
      { minutesBeforeDeparture: 30, refundPercentage: 70, description: '30m-2h: 70% refund' },
      { minutesBeforeDeparture: 0, refundPercentage: 0, description: '<30m: 0% refund' },
    ];

    // Compute departure datetime
    const departureDateTime = new Date(`${ride.rideDate}T${ride.departureTime}:00`);
    const now = new Date();
    const diffMs = departureDateTime.getTime() - now.getTime();
    const diffMinutes = Math.floor(diffMs / (1000 * 60));

    // Sort tiers descending
    const sortedTiers = [...tiers].sort((a, b) => b.minutesBeforeDeparture - a.minutesBeforeDeparture);

    let appliedTier = sortedTiers[sortedTiers.length - 1]; // default lowest
    for (const tier of sortedTiers) {
      if (diffMinutes >= tier.minutesBeforeDeparture) {
        appliedTier = tier;
        break;
      }
    }

    const refundPercentage = appliedTier.refundPercentage;
    const refundAmount = Math.round((booking.totalAmount * refundPercentage) / 100);
    const penaltyAmount = booking.totalAmount - refundAmount;

    return {
      refundAmount,
      penaltyAmount,
      refundPercentage,
      reason: `Cancelled ${diffMinutes > 0 ? diffMinutes + 'm before departure' : 'after departure'}: ${appliedTier.description}`,
    };
  }

  /**
   * Full refund if driver or admin cancels
   */
  static calculateDriverCancelledRefund(booking: IBooking): RefundCalculation {
    return {
      refundAmount: booking.totalAmount,
      penaltyAmount: 0,
      refundPercentage: 100,
      reason: 'Driver cancelled ride. 100% full refund initiated to customer.',
    };
  }
}
