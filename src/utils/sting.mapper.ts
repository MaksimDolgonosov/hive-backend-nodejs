import env from '../config/env';
import { loadAuthorSummaries } from '../services/auth.service';
import { IHive } from '../models/Hive';
import { ISting } from '../models/Sting';
import { AccountType } from '../models/User';
import { PublicContributor } from '../types/growth';
import { PublicHive, PublicSting } from '../types/sting';
import { coordinatesToGeoPoint } from './geo';

type PublicStingOptions = {
  hasLiked?: boolean;
  authorUsername?: string;
  authorAvatarUrl?: string | null;
  authorAccountType?: AccountType;
  allowSharing?: boolean;
  stripHiveId?: boolean;
};

export function stingShareUrl(stingId: string, allowSharing: boolean): string | null {
  if (!allowSharing) {
    return null;
  }
  return `${env.publicAppUrl.replace(/\/$/, '')}/share/stings/${stingId}`;
}

export function toPublicSting(sting: ISting, options?: PublicStingOptions): PublicSting {
  const allowSharing = options?.allowSharing ?? true;
  return {
    id: sting.id,
    authorId: String(sting.authorId),
    authorUsername: options?.authorUsername ?? 'User',
    authorAvatarUrl: options?.authorAvatarUrl ?? null,
    authorAccountType: options?.authorAccountType ?? 'personal',
    imageUrl: sting.imageUrl,
    thumbnailUrl: sting.thumbnailUrl,
    location: coordinatesToGeoPoint(sting.location.coordinates),
    hiveId: options?.stripHiveId ? null : sting.hiveId ? String(sting.hiveId) : null,
    createdAt: sting.createdAt.toISOString(),
    expiresAt: sting.expiresAt.toISOString(),
    reactionsCount: sting.reactionsCount,
    comment: sting.comment ?? null,
    shareUrl: stingShareUrl(sting.id, allowSharing),
    ...(options?.hasLiked !== undefined ? { hasLiked: options.hasLiked } : {}),
  };
}

export async function mapPublicStings(
  stings: ISting[],
  likedStingIds: Set<string>,
  options?: { stripHiveIdFor?: Set<string> },
): Promise<PublicSting[]> {
  const authorIds = [...new Set(stings.map((sting) => String(sting.authorId)))];
  const authors = await loadAuthorSummaries(authorIds);

  return stings.map((sting) => {
    const author = authors.get(String(sting.authorId));
    const stripHiveId = options?.stripHiveIdFor?.has(sting.id) ?? false;

    return toPublicSting(sting, {
      hasLiked: likedStingIds.has(sting.id),
      authorUsername: author?.username,
      authorAvatarUrl: author?.avatarUrl ?? null,
      authorAccountType: author?.accountType ?? 'personal',
      allowSharing: author?.allowSharing ?? true,
      stripHiveId,
    });
  });
}

export function toPublicHive(hive: IHive, topContributors: PublicContributor[] = []): PublicHive {
  return {
    id: hive.id,
    center: coordinatesToGeoPoint(hive.center.coordinates),
    radiusM: hive.radiusM,
    activeStingsCount: hive.activeStingsCount,
    activationCount: hive.activationCount,
    contributorsCount: hive.contributorsCount,
    stage: hive.stage ?? (hive.activeStingsCount >= env.hiveActivationThreshold ? 'hive' : 'seed'),
    topContributors,
    createdAt: hive.createdAt.toISOString(),
    updatedAt: hive.updatedAt.toISOString(),
  };
}
