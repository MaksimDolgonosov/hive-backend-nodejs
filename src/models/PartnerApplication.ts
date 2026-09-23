import mongoose, { Document, Schema, Types } from 'mongoose';

export type PlaceCategory = 'cafe' | 'bar' | 'restaurant' | 'other';
export type ApplicationStatus = 'draft' | 'published';
export type AddressSource = 'declared' | 'onsite' | 'manual_admin';

export interface IPlaceAddress {
  formatted: string;
  city: string | null;
  country: string | null;
  lat: number | null;
  lng: number | null;
  source: AddressSource;
}

export interface IOnsiteVerification {
  verifiedAt: Date;
  lat: number;
  lng: number;
  accuracyM: number;
  photoUrl: string;
  distanceToAddressM: number;
}

export interface IListingUrls {
  instagram: string | null;
  website: string | null;
  ymaps: string | null;
  twogis: string | null;
}

export interface IPartnerApplication extends Document {
  userId: Types.ObjectId;
  brandName: string;
  category: PlaceCategory;
  address: IPlaceAddress;
  phone: string | null;
  contactEmail: string;
  listingUrls: IListingUrls;
  onsite: IOnsiteVerification | null;
  status: ApplicationStatus;
  placeId: Types.ObjectId | null;
  publishedAt: Date | null;
  onsitePurgeAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const addressSchema = new Schema<IPlaceAddress>(
  {
    formatted: { type: String, default: '' },
    city: { type: String, default: null },
    country: { type: String, default: null },
    lat: { type: Number, default: null },
    lng: { type: Number, default: null },
    source: { type: String, enum: ['declared', 'onsite', 'manual_admin'], default: 'declared' },
  },
  { _id: false },
);

const onsiteSchema = new Schema<IOnsiteVerification>(
  {
    verifiedAt: { type: Date, required: true },
    lat: { type: Number, required: true },
    lng: { type: Number, required: true },
    accuracyM: { type: Number, required: true },
    photoUrl: { type: String, required: true },
    distanceToAddressM: { type: Number, default: 0 },
  },
  { _id: false },
);

const listingSchema = new Schema<IListingUrls>(
  {
    instagram: { type: String, default: null },
    website: { type: String, default: null },
    ymaps: { type: String, default: null },
    twogis: { type: String, default: null },
  },
  { _id: false },
);

const partnerApplicationSchema = new Schema<IPartnerApplication>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    brandName: { type: String, default: '' },
    category: { type: String, enum: ['cafe', 'bar', 'restaurant', 'other'], default: 'other' },
    address: { type: addressSchema, default: () => ({}) },
    phone: { type: String, default: null },
    contactEmail: { type: String, default: '' },
    listingUrls: { type: listingSchema, default: () => ({}) },
    onsite: { type: onsiteSchema, default: null },
    status: { type: String, enum: ['draft', 'published'], default: 'draft' },
    placeId: { type: Schema.Types.ObjectId, ref: 'Place', default: null },
    publishedAt: { type: Date, default: null },
    onsitePurgeAt: { type: Date, default: null },
  },
  { timestamps: true },
);

partnerApplicationSchema.index({ userId: 1, updatedAt: -1 });
partnerApplicationSchema.index(
  { userId: 1 },
  { unique: true, partialFilterExpression: { status: 'draft' } },
);
partnerApplicationSchema.index({ onsitePurgeAt: 1 }, { sparse: true });

export default mongoose.model<IPartnerApplication>('PartnerApplication', partnerApplicationSchema);
