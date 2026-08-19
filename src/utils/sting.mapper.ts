import { IHive } from '../models/Hive';
import { ISting } from '../models/Sting';
import { PublicHive, PublicSting } from '../types/sting';
import { coordinatesToGeoPoint } from './geo';

type PublicStingOptions = {
  hasLiked?: boolean;
};

export function toPublicSting(sting: ISting, options?: PublicStingOptions): PublicSting {
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
    ...(options?.hasLiked !== undefined ? { hasLiked: options.hasLiked } : {}),
  };
}

export function mapPublicStings(
  stings: ISting[],
  likedStingIds: Set<string>,
): PublicSting[] {
  return stings.map((sting) =>
    toPublicSting(sting, { hasLiked: likedStingIds.has(sting.id) }),
  );
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
