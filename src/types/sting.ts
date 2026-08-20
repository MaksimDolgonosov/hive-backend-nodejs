export interface GeoPoint {
  lat: number;
  lng: number;
}

export interface PublicSting {
  id: string;
  authorId: string;
  authorUsername: string;
  authorAvatarUrl: string | null;
  imageUrl: string;
  thumbnailUrl: string;
  location: GeoPoint;
  hiveId: string | null;
  createdAt: string;
  expiresAt: string;
  reactionsCount: number;
  comment: string | null;
  hasLiked?: boolean;
}

export interface PublicHive {
  id: string;
  center: GeoPoint;
  radiusM: number;
  activeStingsCount: number;
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
