export interface GeoPoint {
  lat: number;
  lng: number;
}

export interface PublicSting {
  id: string;
  authorId: string;
  imageUrl: string;
  thumbnailUrl: string;
  location: GeoPoint;
  hiveId: string | null;
  createdAt: string;
  expiresAt: string;
  reactionsCount: number;
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
  accuracyM: number | null;
  capturedAt: Date;
  imageFilename: string;
  idempotencyKey?: string;
}
