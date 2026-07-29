import { IHive } from '../models/Hive';
import { ISting } from '../models/Sting';
import { PublicHive, PublicSting } from '../types/sting';
import { coordinatesToGeoPoint } from './geo';

export function toPublicSting(sting: ISting): PublicSting {
  return {
    id: sting.id,
    authorId: String(sting.authorId),
    imageUrl: sting.imageUrl,
    thumbnailUrl: sting.thumbnailUrl,
    location: coordinatesToGeoPoint(sting.location.coordinates),
    hiveId: sting.hiveId ? String(sting.hiveId) : null,
    createdAt: sting.createdAt.toISOString(),
    expiresAt: sting.expiresAt.toISOString(),
    reactionsCount: sting.reactionsCount,
  };
}

export function toPublicHive(hive: IHive): PublicHive {
  return {
    id: hive.id,
    center: coordinatesToGeoPoint(hive.center.coordinates),
    radiusM: hive.radiusM,
    activeStingsCount: hive.activeStingsCount,
    createdAt: hive.createdAt.toISOString(),
    updatedAt: hive.updatedAt.toISOString(),
  };
}
