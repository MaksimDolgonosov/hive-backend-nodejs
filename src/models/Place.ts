import mongoose, { Document, Schema, Types } from 'mongoose';

import { PlaceCategory } from './PartnerApplication';
import { UserSocialLinks } from '../types/profile-user';
import { HiveStage } from '../utils/activation';

export type PlaceStatus = 'draft' | 'live' | 'paused' | 'suspended';
export type PlacePauseReason = 'owner' | 'cover_missing' | 'reports' | null;

export interface IPlace extends Document {
  ownerId: Types.ObjectId;
  applicationId: Types.ObjectId | null;
  name: string;
  category: PlaceCategory;
  description: string | null;
  address: {
    formatted: string;
    city: string | null;
    country: string | null;
    lat: number | null;
    lng: number | null;
    source: 'declared' | 'onsite' | 'manual_admin';
  };
  phone: string | null;
  center: {
    type: 'Point';
    coordinates: [number, number];
  };
  radiusM: number;
  coverMediaId: Types.ObjectId | null;
  coverThumbnailUrl: string | null;
  socialLinks: UserSocialLinks;
  hiveId: Types.ObjectId | null;
  hiveStage: HiveStage | null;
  activeGuestStingsCount: number;
  status: PlaceStatus;
  pauseReason: PlacePauseReason;
  verifiedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const placeSchema = new Schema<IPlace>(
  {
    ownerId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    applicationId: { type: Schema.Types.ObjectId, ref: 'PartnerApplication', default: null },
    name: { type: String, required: true },
    category: { type: String, enum: ['cafe', 'bar', 'restaurant', 'other'], required: true },
    description: { type: String, default: null, maxlength: 280 },
    address: {
      formatted: { type: String, default: '' },
      city: { type: String, default: null },
      country: { type: String, default: null },
      lat: { type: Number, default: null },
      lng: { type: Number, default: null },
      source: { type: String, enum: ['declared', 'onsite', 'manual_admin'], required: true },
    },
    phone: { type: String, default: null },
    center: {
      type: {
        type: String,
        enum: ['Point'],
        required: true,
      },
      coordinates: { type: [Number], required: true },
    },
    radiusM: { type: Number, required: true },
    coverMediaId: { type: Schema.Types.ObjectId, ref: 'PlaceMedia', default: null },
    coverThumbnailUrl: { type: String, default: null },
    socialLinks: {
      instagram: { type: String, default: null },
      telegram: { type: String, default: null },
      tiktok: { type: String, default: null },
      youtube: { type: String, default: null },
      website: { type: String, default: null },
    },
    hiveId: { type: Schema.Types.ObjectId, ref: 'Hive', default: null },
    hiveStage: { type: String, enum: ['seed', 'hive'], default: null },
    activeGuestStingsCount: { type: Number, default: 0 },
    status: { type: String, enum: ['draft', 'live', 'paused', 'suspended'], default: 'draft' },
    pauseReason: { type: String, enum: ['owner', 'cover_missing', 'reports'], default: null },
    verifiedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

placeSchema.index({ ownerId: 1, createdAt: -1 });
placeSchema.index({ center: '2dsphere' });
placeSchema.index({ status: 1 });
placeSchema.index({ hiveId: 1 }, { sparse: true });

export default mongoose.model<IPlace>('Place', placeSchema);
