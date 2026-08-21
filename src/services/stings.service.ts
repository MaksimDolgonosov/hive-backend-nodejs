import env from '../config/env';
import Hive from '../models/Hive';
import Sting, { ISting } from '../models/Sting';
import {
  emitHiveUpdated,
  emitStingCreated,
  emitStingReaction,
} from '../sockets/realtime';
import { assignStingToHive } from './clustering.service';
import { areChangeStreamsActive, notifyStingRemoved, syncHiveDocument } from './hive-cleanup.service';
import { processStingPhoto } from './image.service';
import { validatePhotoModeration } from './moderation.service';
import { deleteStingImages, uploadStingImages } from './storage.service';
import { validateStingSubmission } from './sting-validation.service';
import {
  BboxQuery,
  CreateStingInput,
  PublicHive,
  PublicSting,
  ReactionResult,
  ReactionType,
} from '../types/sting';
import { AppError } from '../utils/AppError';
import { bboxToGeoBox, coordinatesToGeoPoint } from '../utils/geo';
import { mapPublicStings, toPublicHive } from '../utils/sting.mapper';
import {
  createReaction,
  deleteReaction,
  deleteReactionsForSting,
  getLikedStingIds,
  hasUserLikedSting,
} from './reactions.service';

function buildExpiresAt(createdAt: Date): Date {
  return new Date(createdAt.getTime() + env.stingTtlHours * 60 * 60 * 1000);
}

async function emitCreateEvents(sting: ISting): Promise<void> {
  if (sting.hiveId) {
    const hive = await Hive.findById(sting.hiveId);
    if (hive) {
      emitHiveUpdated(toPublicHive(hive));
    }
    return;
  }

  const [publicSting] = await mapPublicStings([sting], new Set());
  emitStingCreated(publicSting);
}

export async function findNearby(
  bbox: BboxQuery,
  userId: string,
): Promise<{ stings: PublicSting[]; hives: PublicHive[] }> {
  const now = new Date();
  const box = bboxToGeoBox(bbox.swLng, bbox.swLat, bbox.neLng, bbox.neLat);

  const [stings, rawHives] = await Promise.all([
    Sting.find({
      location: { $geoWithin: { $box: box } },
      expiresAt: { $gt: now },
      hiveId: null,
    }).sort({ createdAt: -1 }),
    Hive.find({
      center: { $geoWithin: { $box: box } },
      activeStingsCount: { $gte: env.hiveActivationThreshold },
    }),
  ]);

  const syncedHives = (
    await Promise.all(rawHives.map((hive) => syncHiveDocument(hive, now)))
  ).filter((hive): hive is NonNullable<typeof hive> => hive !== null);

  const likedStingIds = await getLikedStingIds(
    userId,
    stings.map((sting) => sting.id),
  );

  return {
    stings: await mapPublicStings(stings, likedStingIds),
    hives: syncedHives.map(toPublicHive),
  };
}

export async function createSting(input: CreateStingInput): Promise<{ sting: PublicSting }> {
  if (input.idempotencyKey) {
    const existing = await Sting.findOne({
      authorId: input.authorId,
      idempotencyKey: input.idempotencyKey,
      expiresAt: { $gt: new Date() },
    });
    if (existing) {
      const [sting] = await mapPublicStings([existing], new Set());
      return { sting };
    }
  }

  await validateStingSubmission({
    lat: input.lat,
    lng: input.lng,
    accuracyM: input.accuracyM,
    capturedAt: input.capturedAt,
    photoBuffer: input.photoBuffer,
  });

  await validatePhotoModeration(input.photoBuffer);

  const processed = await processStingPhoto(input.photoBuffer);
  const { imageUrl, thumbnailUrl } = await uploadStingImages(processed.original, processed.thumbnail);
  const createdAt = new Date();

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
    expiresAt: buildExpiresAt(createdAt),
    comment: input.comment ?? null,
    idempotencyKey: input.idempotencyKey ?? null,
  });

  const clustered = await assignStingToHive(sting);
  await emitCreateEvents(clustered);

  const [publicSting] = await mapPublicStings([clustered], new Set());
  return { sting: publicSting };
}

export async function getStingById(id: string, userId: string): Promise<{ sting: PublicSting }> {
  const sting = await Sting.findOne({ _id: id, expiresAt: { $gt: new Date() } });
  if (!sting) {
    throw new AppError(404, 'STING_NOT_FOUND', 'Жало истекло или не существует');
  }

  const hasLiked = await hasUserLikedSting(id, userId);
  const [publicSting] = await mapPublicStings([sting], new Set(hasLiked ? [id] : []));
  return { sting: publicSting };
}

export async function deleteSting(id: string, userId: string): Promise<void> {
  const sting = await Sting.findOne({ _id: id, expiresAt: { $gt: new Date() } });
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
  const sting = await Sting.findOne({ _id: id, expiresAt: { $gt: new Date() } });
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

  return { reactionsCount, hasLiked: true };
}
