import mongoose, { Document, Schema } from 'mongoose';

import { GeoPoint } from '../types/sting';

export type ZoneStatus = 'open' | 'waitlist';

export interface IZone extends Document {
  overviewCellId: string;
  center: {
    type: 'Point';
    coordinates: [number, number];
  };
  status: ZoneStatus;
  stings24h: number;
  activeStings: number;
  dau24h: number;
  ttlSec: number;
  waitlistCount: number;
  lifetimeStings: number;
  lastStingAt: Date | null;
  lastActivityAt: Date;
  label: string | null;
  updatedAt: Date;
  createdAt: Date;
}

const zoneSchema = new Schema(
  {
    _id: { type: String, required: true },
    overviewCellId: { type: String, required: true, index: true },
    center: {
      type: {
        type: String,
        enum: ['Point'],
        required: true,
      },
      coordinates: {
        type: [Number],
        required: true,
      },
    },
    status: { type: String, enum: ['open', 'waitlist'], default: 'open' },
    stings24h: { type: Number, default: 0 },
    activeStings: { type: Number, default: 0 },
    dau24h: { type: Number, default: 0 },
    ttlSec: { type: Number, default: 259_200 },
    waitlistCount: { type: Number, default: 0 },
    lifetimeStings: { type: Number, default: 0 },
    lastStingAt: { type: Date, default: null },
    lastActivityAt: { type: Date, default: () => new Date() },
    label: { type: String, default: null },
  },
  { timestamps: true },
);

zoneSchema.index({ updatedAt: 1 });
zoneSchema.index({ lastActivityAt: 1 });

export function zoneCenterPoint(zone: IZone): GeoPoint {
  return { lat: zone.center.coordinates[1], lng: zone.center.coordinates[0] };
}

export default mongoose.model<IZone>('Zone', zoneSchema);
