import env from '../config/env';
import Hive, { IHive } from '../models/Hive';
import Sting, { ISting } from '../models/Sting';
import User, { AccountType } from '../models/User';
import {
  emitHiveUpdated,
  emitStingCreated,
  emitStingReaction,
} from '../sockets/realtime';
import { PublicAward, PublicEchoCell, NearbyQueryOptions } from '../types/growth';
import { PublicContributor } from '../types/growth';
import {
  BboxQuery,
  CreateStingInput,
  PublicHive,
  PublicSting,
  ReactionResult,
  ReactionType,
} from '../types/sting';
import { AppError } from '../utils/AppError';
import {
  bboxCenter,
  bboxFromCenterRadius,
  bboxRadiusM,
  expandBbox,
  NEARBY_DEFAULT_MAX_RADIUS_M,
  NEARBY_EXPAND_MAX_STEPS,
  NEAREST_MAX_DISTANCE_M,
} from '../utils/bbox';
import { bboxToGeoBox, coordinatesToGeoPoint } from '../utils/geo';
import { echoCellIdFromLatLng, overviewCellIdFromZone, zoneIdFromLatLng } from '../utils/h3';
import { mapPublicStings, toPublicHive } from '../utils/sting.mapper';
import {
  combineTtlSec,
  expiresAtFromTtl,
  HARD_DELETE_AFTER_EXPIRY_MS,
  hiveTtlBonusSec,
} from '../utils/ttl';
import { grantHiveAwards, grantZoneAwards } from './awards.service';
import { findActiveCampaignBonus } from './campaigns.service';
import { assignStingToHive } from './clustering.service';
import { findEchoesInBbox } from './echoes.service';
import { areChangeStreamsActive, notifyStingRemoved, syncHiveDocument } from './hive-cleanup.service';
import { processStingPhoto } from './image.service';
import { grantInviteBonusAfterFirstSting } from './invites.service';
import { validatePhotoModeration } from './moderation.service';
import { notifyInviteAccepted, notifyNearbyActivity, notifyStingReaction } from './push.service';
import {
  createReaction,
  deleteReaction,
  deleteReactionsForSting,
  getLikedStingIds,
  hasUserLikedSting,
} from './reactions.service';
import { startOfUtcDay } from '../utils/cache';
import { deleteStingImages, uploadStingImages } from './storage.service';
import { validateStingSubmission } from './sting-validation.service';
import { loadAuthorSummaries } from './auth.service';
import { incrementZoneOnPublish, recordZoneVisit, recalculateZone } from './zones.service';

async function loadTopContributors(hiveIds: string[]): Promise<Map<string, PublicContributor[]>> {
  const result = new Map<string, PublicContributor[]>();
  if (hiveIds.length === 0) {
    return result;
  }

  const now = new Date();
  const stings = await Sting.find({
    hiveId: { $in: hiveIds },
    expiresAt: { $gt: now },
    mediaPurgedAt: null,
  })
    .sort({ createdAt: -1 })
    .select('hiveId authorId');

  const authorsByHive = new Map<string, string[]>();
  for (const sting of stings) {
    if (!sting.hiveId) {
      continue;
    }
    const hiveId = String(sting.hiveId);
    const authors = authorsByHive.get(hiveId) ?? [];
    const authorId = String(sting.authorId);
    if (!authors.includes(authorId)) {
      authors.push(authorId);
      authorsByHive.set(hiveId, authors);
    }
  }

  const allAuthorIds = [...new Set([...authorsByHive.values()].flat())];
  const authors = await loadAuthorSummaries(allAuthorIds);

  for (const [hiveId, authorIds] of authorsByHive) {
    result.set(
      hiveId,
      authorIds.slice(0, 5).map((authorId) => {
        const author = authors.get(authorId);
        return {
          userId: authorId,
          username: author?.username ?? 'User',
          avatarUrl: author?.avatarUrl ?? null,
        };
      }),
    );
  }

  return result;
}

async function mapHives(hives: IHive[]): Promise<PublicHive[]> {
  const contributors = await loadTopContributors(hives.map((hive) => hive.id));
  return hives.map((hive) => toPublicHive(hive, contributors.get(hive.id) ?? []));
}

async function emitCreateEvents(
  sting: ISting,
  hive: IHive | null,
): Promise<void> {
  if (hive) {
    const [publicHive] = await mapHives([hive]);
    emitHiveUpdated(publicHive);
    if (hive.stage === 'seed') {
      const [publicSting] = await mapPublicStings([sting], new Set());
      emitStingCreated(publicSting);
    }
    return;
  }

  const [publicSting] = await mapPublicStings([sting], new Set());
  emitStingCreated(publicSting);
}

async function queryNearbyBox(
  bbox: BboxQuery,
  includeSeeds: boolean,
): Promise<{ stings: ISting[]; hives: IHive[] }> {
  const now = new Date();
  const box = bboxToGeoBox(bbox.swLng, bbox.swLat, bbox.neLng, bbox.neLat);

  const hiveFilter: Record<string, unknown> = {
    center: { $geoWithin: { $box: box } },
  };
  if (!includeSeeds) {
    hiveFilter.stage = 'hive';
  }

  const [rawHives, orphanStings] = await Promise.all([
    Hive.find(hiveFilter),
    Sting.find({
      location: { $geoWithin: { $box: box } },
      expiresAt: { $gt: now },
      mediaPurgedAt: null,
      hiveId: null,
    }).sort({ createdAt: -1 }),
  ]);

  const syncedHives = (
    await Promise.all(rawHives.map((hive) => syncHiveDocument(hive, now)))
  ).filter((hive): hive is IHive => hive !== null);

  const visibleHives = includeSeeds
    ? syncedHives
    : syncedHives.filter((hive) => hive.stage === 'hive');

  let stings = orphanStings;
  if (!includeSeeds) {
    const seedHiveIds = syncedHives.filter((hive) => hive.stage === 'seed').map((hive) => hive._id);
    if (seedHiveIds.length > 0) {
      const seedStings = await Sting.find({
        hiveId: { $in: seedHiveIds },
        expiresAt: { $gt: now },
        mediaPurgedAt: null,
        location: { $geoWithin: { $box: box } },
      }).sort({ createdAt: -1 });
      stings = [...orphanStings, ...seedStings];
    }
  }

  return { stings, hives: visibleHives };
}

export async function findNearby(
  bbox: BboxQuery,
  userId: string,
  options: NearbyQueryOptions,
): Promise<{
  stings: PublicSting[];
  hives: PublicHive[];
  echoes?: PublicEchoCell[];
  appliedBounds: BboxQuery;
  expanded: boolean;
  appliedRadiusM: number;
}> {
  const center = bboxCenter(bbox);
  await recordZoneVisit(userId, center.lat, center.lng);

  let applied = bbox;
  let expanded = false;
  let result = await queryNearbyBox(applied, options.includeSeeds);
  let radius = bboxRadiusM(applied);
  let steps = 0;

  const minResults = Math.min(Math.max(options.minResults, 0), 50);
  const maxRadiusM = Math.min(
    Math.max(options.maxRadiusM || NEARBY_DEFAULT_MAX_RADIUS_M, 1),
    200_000,
  );

  while (
    minResults > 0 &&
    result.stings.length < minResults &&
    radius < maxRadiusM &&
    steps < NEARBY_EXPAND_MAX_STEPS
  ) {
    const next = expandBbox(applied, 2);
    const nextRadius = bboxRadiusM(next);
    applied =
      nextRadius > maxRadiusM ? bboxFromCenterRadius(center, maxRadiusM) : next;
    radius = bboxRadiusM(applied);
    result = await queryNearbyBox(applied, options.includeSeeds);
    expanded = true;
    steps += 1;
  }

  const seedStingIds = new Set(
    result.stings.filter((sting) => sting.hiveId).map((sting) => sting.id),
  );
  const likedStingIds = await getLikedStingIds(
    userId,
    result.stings.map((sting) => sting.id),
  );

  const payload: {
    stings: PublicSting[];
    hives: PublicHive[];
    echoes?: PublicEchoCell[];
    appliedBounds: BboxQuery;
    expanded: boolean;
    appliedRadiusM: number;
  } = {
    stings: await mapPublicStings(result.stings, likedStingIds, {
      stripHiveIdFor: options.includeSeeds ? undefined : seedStingIds,
    }),
    hives: await mapHives(result.hives),
    appliedBounds: applied,
    expanded,
    appliedRadiusM: Math.round(radius),
  };

  if (options.includeEchoes) {
    payload.echoes = await findEchoesInBbox(applied);
  }

  return payload;
}

export async function findNearest(
  lat: number,
  lng: number,
  limit: number,
): Promise<{ stings: PublicSting[]; distanceM: number | null }> {
  const now = new Date();
  const pageLimit = Math.min(Math.max(limit, 1), 10);

  const rows = await Sting.aggregate<ISting & { distanceM: number }>([
    {
      $geoNear: {
        near: { type: 'Point', coordinates: [lng, lat] },
        distanceField: 'distanceM',
        spherical: true,
        maxDistance: NEAREST_MAX_DISTANCE_M,
        query: { expiresAt: { $gt: now }, mediaPurgedAt: null },
      },
    },
    { $limit: pageLimit },
  ]);

  if (rows.length === 0) {
    return { stings: [], distanceM: null };
  }

  const ids = rows.map((row) => row._id);
  const found = await Sting.find({ _id: { $in: ids } });
  const byId = new Map(found.map((sting) => [sting.id, sting]));
  const stings = ids.map((id) => byId.get(String(id))).filter(Boolean) as typeof found;

  return {
    stings: await mapPublicStings(stings, new Set()),
    distanceM: Math.round(rows[0]!.distanceM),
  };
}

async function assertDailyStingQuota(userId: string, accountType: AccountType): Promise<void> {
  if (accountType === 'personal') {
    return;
  }
  const cap =
    accountType === 'official' ? env.officialDailyStingLimit : env.partnerDailyStingLimit;
  const count = await Sting.countDocuments({
    authorId: userId,
    createdAt: { $gte: startOfUtcDay() },
  });
  if (count >= cap) {
    throw new AppError(429, 'RATE_LIMITED', 'Слишком много публикаций, попробуйте позже');
  }
}

export async function createSting(input: CreateStingInput): Promise<{
  sting: PublicSting;
  ttlSec: number;
  zone: { id: string; status: 'open' | 'waitlist'; ttlSec: number };
  awards?: PublicAward[];
}> {
  if (input.idempotencyKey) {
    const existing = await Sting.findOne({
      authorId: input.authorId,
      idempotencyKey: input.idempotencyKey,
      expiresAt: { $gt: new Date() },
      mediaPurgedAt: null,
    });
    if (existing) {
      const [sting] = await mapPublicStings([existing], new Set());
      const ttlSec = Math.max(
        1,
        Math.round((existing.expiresAt.getTime() - existing.createdAt.getTime()) / 1000),
      );
      return {
        sting,
        ttlSec,
        zone: {
          id: existing.zoneId ?? zoneIdFromLatLng(input.lat, input.lng),
          status: 'open',
          ttlSec,
        },
      };
    }
  }

  const author = await User.findById(input.authorId).select('accountType');
  const accountType = author?.accountType ?? 'personal';
  await assertDailyStingQuota(input.authorId, accountType);

  await validateStingSubmission({
    lat: input.lat,
    lng: input.lng,
    accuracyM: input.accuracyM,
    capturedAt: input.capturedAt,
    photoBuffer: input.photoBuffer,
  });

  const processed = await processStingPhoto(input.photoBuffer);
  await validatePhotoModeration(processed.thumbnail);

  const { imageUrl, thumbnailUrl } = await uploadStingImages(processed.original, processed.thumbnail);
  const createdAt = new Date();
  const zoneId = zoneIdFromLatLng(input.lat, input.lng);
  const { zone, previousLifetime, previousLastStingAt } = await incrementZoneOnPublish(zoneId, {
    lat: input.lat,
    lng: input.lng,
  });

  const campaign = await findActiveCampaignBonus(input.lat, input.lng);
  const baseTtl = zone.ttlSec || env.stingTtlHours * 3600;
  let ttlSec = combineTtlSec({ baseSec: baseTtl, campaignBonusSec: campaign.ttlBonusSec });

  const sting = await Sting.create({
    authorId: input.authorId,
    imageUrl,
    thumbnailUrl,
    location: {
      type: 'Point',
      coordinates: [input.lng, input.lat],
    },
    accuracyM: input.accuracyM,
    capturedAt: input.capturedAt,
    expiresAt: expiresAtFromTtl(createdAt, ttlSec),
    comment: input.comment ?? null,
    idempotencyKey: input.idempotencyKey ?? null,
    zoneId,
    overviewCellId: overviewCellIdFromZone(zoneId),
    echoCellId: echoCellIdFromLatLng(input.lat, input.lng),
    campaignId: campaign.campaignId,
    hardDeleteAt: new Date(expiresAtFromTtl(createdAt, ttlSec).getTime() + HARD_DELETE_AFTER_EXPIRY_MS),
  });

  const clustered = await assignStingToHive(sting);

  if (clustered.hive?.stage === 'hive') {
    const bonus = hiveTtlBonusSec(baseTtl, env.hiveTtlBonusSec);
    ttlSec = combineTtlSec({
      baseSec: baseTtl,
      campaignBonusSec: campaign.ttlBonusSec,
      hiveBonusSec: bonus,
    });
    clustered.sting.expiresAt = expiresAtFromTtl(createdAt, ttlSec);
    clustered.sting.hardDeleteAt = new Date(
      clustered.sting.expiresAt.getTime() + HARD_DELETE_AFTER_EXPIRY_MS,
    );
    await clustered.sting.save();
  }

  const awards = [
    ...(await grantZoneAwards({
      userId: input.authorId,
      accountType,
      accuracyM: input.accuracyM,
      zoneId,
      stingId: clustered.sting.id,
      center: { lat: input.lat, lng: input.lng },
      previousLifetime,
      previousLastStingAt,
    })),
  ];

  if (clustered.ignited && clustered.hive) {
    const founder = clustered.hive.founderUserId
      ? await User.findById(clustered.hive.founderUserId).select('accountType')
      : null;
    awards.push(
      ...(await grantHiveAwards({
        igniterUserId: input.authorId,
        founderUserId: clustered.hive.founderUserId
          ? String(clustered.hive.founderUserId)
          : null,
        igniterAccountType: accountType,
        founderAccountType: founder?.accountType ?? null,
        accuracyM: input.accuracyM,
        zoneId,
        stingId: clustered.sting.id,
        hiveId: clustered.hive.id,
        center: { lat: input.lat, lng: input.lng },
      })),
    );
    await notifyNearbyActivity(zoneId, clustered.hive.id);
  }

  const inviterId = await grantInviteBonusAfterFirstSting(input.authorId);
  if (inviterId) {
    await notifyInviteAccepted(inviterId, input.authorId);
  }

  await emitCreateEvents(clustered.sting, clustered.hive);
  void recalculateZone(zoneId);

  const [publicSting] = await mapPublicStings([clustered.sting], new Set());
  return {
    sting: publicSting,
    ttlSec,
    zone: {
      id: zone.id,
      status: env.waitlistEnabled ? zone.status : 'open',
      ttlSec: zone.ttlSec,
    },
    ...(awards.length > 0 ? { awards } : {}),
  };
}

export async function getStingById(id: string, userId: string): Promise<{ sting: PublicSting }> {
  const sting = await Sting.findOne({
    _id: id,
    expiresAt: { $gt: new Date() },
    mediaPurgedAt: null,
  });
  if (!sting) {
    throw new AppError(404, 'STING_NOT_FOUND', 'Жало истекло или не существует');
  }

  const hasLiked = await hasUserLikedSting(id, userId);
  const [publicSting] = await mapPublicStings([sting], new Set(hasLiked ? [id] : []));
  return { sting: publicSting };
}

export async function deleteSting(id: string, userId: string): Promise<void> {
  const sting = await Sting.findOne({
    _id: id,
    expiresAt: { $gt: new Date() },
    mediaPurgedAt: null,
  });
  if (!sting) {
    throw new AppError(404, 'STING_NOT_FOUND', 'Жало не найдено');
  }
  if (String(sting.authorId) !== userId) {
    throw new AppError(403, 'FORBIDDEN', 'Нельзя удалить чужое жало');
  }

  const [lng, lat] = sting.location.coordinates;
  const hiveId = sting.hiveId;
  const stingId = sting.id;

  await deleteStingImages(sting.imageUrl, sting.thumbnailUrl);
  await sting.deleteOne();
  await deleteReactionsForSting(stingId);

  if (!areChangeStreamsActive()) {
    await notifyStingRemoved(stingId, hiveId, lat, lng);
  }
}

export async function toggleReaction(
  id: string,
  userId: string,
  type: ReactionType,
): Promise<ReactionResult> {
  const sting = await Sting.findOne({
    _id: id,
    expiresAt: { $gt: new Date() },
    mediaPurgedAt: null,
  });
  if (!sting) {
    throw new AppError(404, 'STING_NOT_FOUND', 'Жало не найдено');
  }

  const location = coordinatesToGeoPoint(sting.location.coordinates);
  const removed = await deleteReaction(id, userId);

  if (removed) {
    const updated = await Sting.findOneAndUpdate(
      { _id: id, reactionsCount: { $gt: 0 } },
      { $inc: { reactionsCount: -1 } },
      { new: true },
    );

    const reactionsCount = updated?.reactionsCount ?? Math.max(0, sting.reactionsCount - 1);
    emitStingReaction(id, reactionsCount, location.lat, location.lng);

    return { reactionsCount, hasLiked: false };
  }

  const created = await createReaction(id, userId, type, sting.expiresAt);
  if (!created) {
    return {
      reactionsCount: sting.reactionsCount,
      hasLiked: true,
    };
  }

  const updated = await Sting.findByIdAndUpdate(
    id,
    { $inc: { reactionsCount: 1 } },
    { new: true },
  );

  const reactionsCount = updated?.reactionsCount ?? sting.reactionsCount + 1;
  emitStingReaction(id, reactionsCount, location.lat, location.lng);
  await notifyStingReaction(String(sting.authorId), id, userId);

  return { reactionsCount, hasLiked: true };
}
