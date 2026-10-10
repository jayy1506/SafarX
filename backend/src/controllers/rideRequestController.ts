import { Response } from 'express';
import { AuthRequest } from '../middlewares/auth.js';
import { RideRequest } from '../models/RideRequest.js';
import { Route } from '../models/Route.js';
import { Driver } from '../models/Driver.js';
import { Vehicle } from '../models/Vehicle.js';
import { Booking } from '../models/Booking.js';
import { FareCalculator } from '../services/fareCalculator.js';

export class RideRequestController {
  
  // Passenger creates a new ride request
  static async createRequest(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { routeId, pickupStop, dropStop, timeSlot, seatsRequested = 1 } = req.body;

      if (!routeId || !pickupStop || !dropStop || !timeSlot) {
        res.status(400).json({ success: false, message: 'Missing required fields' });
        return;
      }

      const route = await Route.findById(routeId);
      if (!route) {
        res.status(404).json({ success: false, message: 'Route not found' });
        return;
      }

      const rideRequest = await RideRequest.create({
        customer: req.user!._id,
        route: routeId,
        pickupStop,
        dropStop,
        timeSlot,
        seatsRequested,
        status: 'PENDING'
      });

      // (Optional) Emit socket event to drivers online for this route

      res.status(201).json({
        success: true,
        message: 'Ride request created successfully. Waiting for drivers.',
        rideRequest
      });
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message });
    }
  }

  // Passenger checks status of their request
  static async getRequestStatus(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { requestId } = req.params;
      const rideRequest = await RideRequest.findById(requestId)
        .populate({
          path: 'acceptedByDriver',
          populate: { path: 'user', select: 'fullName phone profilePhoto' }
        });

      if (!rideRequest) {
        res.status(404).json({ success: false, message: 'Request not found' });
        return;
      }

      if (rideRequest.customer.toString() !== req.user!._id.toString()) {
        res.status(403).json({ success: false, message: 'Not authorized' });
        return;
      }

      let driverDetails = null;
      if (rideRequest.status === 'ACCEPTED' && rideRequest.acceptedByDriver) {
        const vehicle = await Vehicle.findOne({ driver: rideRequest.acceptedByDriver });
        const driverDoc: any = rideRequest.acceptedByDriver;
        driverDetails = {
          name: driverDoc.user.fullName,
          phone: driverDoc.user.phone,
          rating: driverDoc.ratingAverage,
          vehicle: vehicle ? `${vehicle.brand} ${vehicle.model} - ${vehicle.vehicleNumber}` : 'N/A',
          eta: '10 mins' // Mock ETA
        };
      }

      res.json({
        success: true,
        request: rideRequest,
        driverDetails
      });
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message });
    }
  }

  // Driver fetches available requests on their route
  static async getAvailableRequests(req: AuthRequest, res: Response): Promise<void> {
    try {
      // Find route based on driver's preference or just return all pending
      const requests = await RideRequest.find({ status: 'PENDING' })
        .populate('customer', 'fullName')
        .populate('route', 'name')
        .sort({ createdAt: -1 });

      res.json({ success: true, requests });
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message });
    }
  }

  // Driver accepts a request
  static async acceptRequest(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { requestId } = req.params;
      const driverProfile = await Driver.findOne({ user: req.user!._id });

      if (!driverProfile) {
        res.status(403).json({ success: false, message: 'Driver profile not found' });
        return;
      }

      const rideRequest = await RideRequest.findById(requestId);
      if (!rideRequest) {
        res.status(404).json({ success: false, message: 'Request not found' });
        return;
      }

      if (rideRequest.status !== 'PENDING') {
        res.status(400).json({ success: false, message: 'Request is no longer pending' });
        return;
      }

      rideRequest.status = 'ACCEPTED';
      rideRequest.acceptedByDriver = driverProfile._id;
      rideRequest.acceptedAt = new Date();
      await rideRequest.save();

      // (Optional) Emit socket event to the passenger

      res.json({
        success: true,
        message: 'Request accepted successfully. Proceed to pickup.',
        rideRequest
      });
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message });
    }
  }
}
