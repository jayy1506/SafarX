import mongoose, { Schema, Document } from 'mongoose';

export interface IRouteStop {
  _id?: string;
  name: string;
  landmark?: string;
  sequenceOrder: number;
  distanceFromStartKm: number;
  isActive: boolean;
}

export interface IRoute extends Document {
  name: string;
  origin: string;
  destination: string;
  stops: IRouteStop[];
  estimatedDurationMinutes: number;
  totalDistanceKm: number;
  baseFare: number;
  farePerKm: number;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
  getStopsForDirection(direction: 'FORWARD' | 'REVERSE'): IRouteStop[];
}

const RouteStopSchema = new Schema<IRouteStop>(
  {
    name: { type: String, required: true, trim: true },
    landmark: { type: String, default: '' },
    sequenceOrder: { type: Number, required: true },
    distanceFromStartKm: { type: Number, required: true, default: 0 },
    isActive: { type: Boolean, default: true },
  },
  { _id: true }
);

const RouteSchema = new Schema<IRoute>(
  {
    name: { type: String, required: true, unique: true, trim: true },
    origin: { type: String, required: true, trim: true },
    destination: { type: String, required: true, trim: true },
    stops: [RouteStopSchema],
    estimatedDurationMinutes: { type: Number, default: 30 },
    totalDistanceKm: { type: Number, required: true, default: 12 },
    baseFare: { type: Number, default: 20 },
    farePerKm: { type: Number, default: 3 },
    isActive: { type: Boolean, default: true, index: true },
  },
  { timestamps: true }
);

RouteSchema.methods.getStopsForDirection = function (direction: 'FORWARD' | 'REVERSE'): IRouteStop[] {
  const activeStops = this.stops.filter((s: IRouteStop) => s.isActive);
  const sorted = [...activeStops].sort((a, b) => a.sequenceOrder - b.sequenceOrder);
  if (direction === 'REVERSE') {
    return sorted.reverse().map((stop, index) => ({
      ...stop.toObject ? stop.toObject() : stop,
      sequenceOrder: index + 1,
    }));
  }
  return sorted;
};

RouteSchema.index({ origin: 1, destination: 1, isActive: 1 });

export const Route = mongoose.model<IRoute>('Route', RouteSchema);

