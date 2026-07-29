import env from '../config/env';
import Hive from '../models/Hive';
import Sting, { ISting } from '../models/Sting';
import {
  emitHiveUpdated,
  emitStingCreated,
  emitStingReaction,
} from '../sockets/realtime';
import { assignStingToHive } from './clustering.service';
import { areChangeStreamsActive, notifyStingRemoved } from './hive-cleanup.service';
import { processStingPhoto } from './image.service';
import { uploadStingImages } from './storage.service';
import { validateStingSubmission } from './sting-validation.service';
import {
  BboxQuery,
  CreateStingInput,
  PublicHive,
  PublicSting,
  ReactionType,
} from '../types/sting';
import { AppError } from '../utils/AppError';
import { bboxToGeoBox, coordinatesToGeoPoint } from '../utils/geo';
import { toPublicHive, toPublicSting } from '../utils/sting.mapper';

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

  emitStingCreated(toPublicSting(sting));
}

export async function findNearby(bbox: BboxQuery): Promise<{ stings: PublicSting[]; hives: PublicHive[] }> {
  const now = new Date();
  const box = bboxToGeoBox(bbox.swLng, bbox.swLat, bbox.neLng, bbox.neLat);

  const [stings, hives] = await Promise.all([
    Sting.find({
      location: { $geoWithin: { $box: box } },
      expiresAt: { $gt: now },
      hiveId: null,
    }).sort({ createdAt: -1 }),
    Hive.find({
      center: { $geoWithin: { $box: box } },
      activeStingsCount: { $gt: 0 },
    }),
  ]);

  return {
    stings: stings.map(toPublicSting),
    hives: hives.map(toPublicHive),
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
      return { sting: toPublicSting(existing) };
    }
  }

  await validateStingSubmission({
    lat: input.lat,
    lng: input.lng,
    accuracyM: input.accuracyM,
    capturedAt: input.capturedAt,
    photoBuffer: input.photoBuffer,
  });

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
    idempotencyKey: input.idempotencyKey ?? null,
  });

  const clustered = await assignStingToHive(sting);
  await emitCreateEvents(clustered);

  return { sting: toPublicSting(clustered) };
}

export async function getStingById(id: string): Promise<{ sting: PublicSting }> {
  const sting = await Sting.findOne({ _id: id, expiresAt: { $gt: new Date() } });
  if (!sting) {
    throw new AppError(404, 'STING_NOT_FOUND', 'Жало истекло или не существует');
  }
  return { sting: toPublicSting(sting) };
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

  await sting.deleteOne();

  if (!areChangeStreamsActive()) {
    await notifyStingRemoved(stingId, hiveId, lat, lng);
  }
}

export async function addReaction(
  id: string,
  _type: ReactionType,
): Promise<{ reactionsCount: number }> {
  const sting = await Sting.findOneAndUpdate(
    { _id: id, expiresAt: { $gt: new Date() } },
    { $inc: { reactionsCount: 1 } },
    { new: true },
  );

  if (!sting) {
    throw new AppError(404, 'STING_NOT_FOUND', 'Жало не найдено');
  }

  const location = coordinatesToGeoPoint(sting.location.coordinates);
  emitStingReaction(sting.id, sting.reactionsCount, location.lat, location.lng);

  return { reactionsCount: sting.reactionsCount };
}
