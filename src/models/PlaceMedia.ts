import mongoose, { Document, Schema, Types } from 'mongoose';

export type MediaKind = 'cover' | 'gallery';
export type MediaSource = 'library' | 'camera';
export type MediaModeration = 'approved' | 'rejected';
export type MediaRejectCode = 'quality' | 'not_this_place' | 'people_sensitive' | 'stolen' | 'other';

export interface IPlaceMedia extends Document {
  placeId: Types.ObjectId;
  kind: MediaKind;
  source: MediaSource;
  imageUrl: string;
  thumbnailUrl: string;
  width: number;
  height: number;
  sortOrder: number;
  moderation: MediaModeration;
  rejectCode: MediaRejectCode | null;
  exifGps: { lat: number; lng: number } | null;
  exifCapturedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const placeMediaSchema = new Schema<IPlaceMedia>(
  {
    placeId: { type: Schema.Types.ObjectId, ref: 'Place', required: true },
    kind: { type: String, enum: ['cover', 'gallery'], required: true },
    source: { type: String, enum: ['library', 'camera'], required: true },
    imageUrl: { type: String, required: true },
    thumbnailUrl: { type: String, required: true },
    width: { type: Number, required: true },
    height: { type: Number, required: true },
    sortOrder: { type: Number, default: 0 },
    moderation: { type: String, enum: ['approved', 'rejected'], default: 'approved' },
    rejectCode: {
      type: String,
      enum: ['quality', 'not_this_place', 'people_sensitive', 'stolen', 'other', null],
      default: null,
    },
    exifGps: {
      lat: { type: Number },
      lng: { type: Number },
    },
    exifCapturedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

placeMediaSchema.index({ placeId: 1, kind: 1, sortOrder: 1 });

export default mongoose.model<IPlaceMedia>('PlaceMedia', placeMediaSchema);
