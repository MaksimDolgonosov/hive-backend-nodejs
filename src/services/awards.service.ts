import Award, { AwardType, IAward } from '../models/Award';
import { AccountType } from '../models/User';
import { PublicAward } from '../types/growth';
import { GeoPoint } from '../types/sting';
import env from '../config/env';
import { ZONE_REVIVAL_MS } from '../utils/ttl';
import { coordinatesToGeoPoint } from '../utils/geo';

const DEFAULT_PAGE_LIMIT = 20;
const MAX_PAGE_LIMIT = 50;

export function toPublicAward(award: IAward): PublicAward {
  return {
    id: award.id,
    type: award.type,
    zoneId: award.zoneId,
    stingId: String(award.stingId),
    hiveId: award.hiveId ? String(award.hiveId) : null,
    center: coordinatesToGeoPoint(award.center.coordinates),
    createdAt: award.createdAt.toISOString(),
  };
}

export function canReceiveAwards(input: {
  accountType: AccountType;
  accuracyM: number;
}): boolean {
  if (input.accountType !== 'personal') {
    return false;
  }
  return input.accuracyM <= env.awardMaxAccuracyM;
}

async function tryCreateAward(input: {
  userId: string;
  type: AwardType;
  zoneId: string;
  stingId: string;
  hiveId?: string | null;
  center: GeoPoint;
}): Promise<IAward | null> {
  try {
    return await Award.create({
      userId: input.userId,
      type: input.type,
      zoneId: input.zoneId,
      stingId: input.stingId,
      hiveId: input.hiveId ?? null,
      center: { type: 'Point', coordinates: [input.center.lng, input.center.lat] },
    });
  } catch (error) {
    if (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      (error as { code?: number }).code === 11000
    ) {
      return null;
    }
    throw error;
  }
}

export async function grantZoneAwards(input: {
  userId: string;
  accountType: AccountType;
  accuracyM: number;
  zoneId: string;
  stingId: string;
  center: GeoPoint;
  previousLifetime: number;
  previousLastStingAt: Date | null;
}): Promise<PublicAward[]> {
  if (!canReceiveAwards(input)) {
    return [];
  }

  const granted: IAward[] = [];
  const now = new Date();

  if (input.previousLifetime === 0) {
    const award = await tryCreateAward({ ...input, type: 'zone_first' });
    if (award) {
      granted.push(award);
    }
  } else if (
    input.previousLastStingAt &&
    now.getTime() - input.previousLastStingAt.getTime() >= ZONE_REVIVAL_MS
  ) {
    const recentRevival = await Award.findOne({
      type: 'zone_revival',
      zoneId: input.zoneId,
      createdAt: { $gte: new Date(now.getTime() - ZONE_REVIVAL_MS) },
    });
    if (!recentRevival) {
      const award = await tryCreateAward({ ...input, type: 'zone_revival' });
      if (award) {
        granted.push(award);
      }
    }
  }

  return granted.map(toPublicAward);
}

export async function grantHiveAwards(input: {
  igniterUserId: string;
  founderUserId: string | null;
  igniterAccountType: AccountType;
  founderAccountType: AccountType | null;
  accuracyM: number;
  zoneId: string;
  stingId: string;
  hiveId: string;
  center: GeoPoint;
}): Promise<PublicAward[]> {
  const granted: IAward[] = [];

  if (canReceiveAwards({ accountType: input.igniterAccountType, accuracyM: input.accuracyM })) {
    const ignited = await tryCreateAward({
      userId: input.igniterUserId,
      type: 'hive_ignited',
      zoneId: input.zoneId,
      stingId: input.stingId,
      hiveId: input.hiveId,
      center: input.center,
    });
    if (ignited) {
      granted.push(ignited);
    }
  }

  if (
    input.founderUserId &&
    input.founderAccountType &&
    canReceiveAwards({ accountType: input.founderAccountType, accuracyM: input.accuracyM })
  ) {
    const founder = await tryCreateAward({
      userId: input.founderUserId,
      type: 'hive_founder',
      zoneId: input.zoneId,
      stingId: input.stingId,
      hiveId: input.hiveId,
      center: input.center,
    });
    if (founder) {
      granted.push(founder);
    }
  }

  return granted.map(toPublicAward);
}

export async function listMyAwards(
  userId: string,
  cursor?: string,
  limit?: number,
): Promise<{ awards: PublicAward[]; nextCursor: string | null }> {
  const pageLimit = Math.min(Math.max(limit ?? DEFAULT_PAGE_LIMIT, 1), MAX_PAGE_LIMIT);
  const filter: Record<string, unknown> = { userId };

  if (cursor) {
    const cursorAward = await Award.findOne({ _id: cursor, userId });
    if (cursorAward) {
      filter.$or = [
        { createdAt: { $lt: cursorAward.createdAt } },
        { createdAt: cursorAward.createdAt, _id: { $lt: cursorAward._id } },
      ];
    }
  }

  const items = await Award.find(filter)
    .sort({ createdAt: -1, _id: -1 })
    .limit(pageLimit + 1);

  const hasMore = items.length > pageLimit;
  const page = hasMore ? items.slice(0, pageLimit) : items;

  return {
    awards: page.map(toPublicAward),
    nextCursor: hasMore ? page[page.length - 1].id : null,
  };
}

export async function countAwards(userId: string): Promise<number> {
  return Award.countDocuments({ userId });
}
