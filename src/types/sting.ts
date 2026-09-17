import { AccountType } from '../models/User';
import { HiveStage } from '../utils/activation';
import { PublicContributor } from './growth';

export interface GeoPoint {
  lat: number;
  lng: number;
}

export interface PublicSting {
  id: string;
  authorId: string;
  authorUsername: string;
  authorAvatarUrl: string | null;
  authorAccountType: AccountType;
  imageUrl: string;
  thumbnailUrl: string;
  location: GeoPoint;
  hiveId: string | null;
  createdAt: string;
  expiresAt: string;
  reactionsCount: number;
  comment: string | null;
  shareUrl: string | null;
  hasLiked?: boolean;
}

export interface PublicHive {
  id: string;
  center: GeoPoint;
  radiusM: number;
  activeStingsCount: number;
  activationCount: number;
  contributorsCount: number;
  stage: HiveStage;
  topContributors: PublicContributor[];
  createdAt: string;
  updatedAt: string;
}

export interface BboxQuery {
  swLat: number;
  swLng: number;
  neLat: number;
  neLng: number;
}

export interface CreateStingInput {
  authorId: string;
  lat: number;
  lng: number;
  accuracyM: number;
  capturedAt: Date;
  photoBuffer: Buffer;
  comment?: string | null;
  idempotencyKey?: string;
}

export interface UploadedImageUrls {
  imageUrl: string;
  thumbnailUrl: string;
}

export type ReactionType = 'like';

export interface ReactionResult {
  reactionsCount: number;
  hasLiked: boolean;
}
