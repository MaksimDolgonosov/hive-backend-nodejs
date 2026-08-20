import { loadAuthorSummaries } from '../services/auth.service';
import { IHive } from '../models/Hive';
import { ISting } from '../models/Sting';
import { PublicHive, PublicSting } from '../types/sting';
import { coordinatesToGeoPoint } from './geo';

type PublicStingOptions = {
  hasLiked?: boolean;
  authorUsername?: string;
  authorAvatarUrl?: string | null;
};

export function toPublicSting(sting: ISting, options?: PublicStingOptions): PublicSting {
  return {
    id: sting.id,
    authorId: String(sting.authorId),
    authorUsername: options?.authorUsername ?? 'User',
    authorAvatarUrl: options?.authorAvatarUrl ?? null,
    imageUrl: sting.imageUrl,
    thumbnailUrl: sting.thumbnailUrl,
    location: coordinatesToGeoPoint(sting.location.coordinates),
    hiveId: sting.hiveId ? String(sting.hiveId) : null,
    createdAt: sting.createdAt.toISOString(),
    expiresAt: sting.expiresAt.toISOString(),
    reactionsCount: sting.reactionsCount,
    comment: sting.comment ?? null,
    ...(options?.hasLiked !== undefined ? { hasLiked: options.hasLiked } : {}),
  };
}

export async function mapPublicStings(
  stings: ISting[],
  likedStingIds: Set<string>,
): Promise<PublicSting[]> {
  const authorIds = [...new Set(stings.map((sting) => String(sting.authorId)))];
  const authors = await loadAuthorSummaries(authorIds);

  return stings.map((sting) => {
    const author = authors.get(String(sting.authorId));

    return toPublicSting(sting, {
      hasLiked: likedStingIds.has(sting.id),
      authorUsername: author?.username,
      authorAvatarUrl: author?.avatarUrl ?? null,
    });
  });
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
