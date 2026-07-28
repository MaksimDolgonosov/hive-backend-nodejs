import env from '../config/env';
import Hive, { IHive } from '../models/Hive';
import Sting, { ISting } from '../models/Sting';
import {
  BboxQuery,
  CreateStingInput,
  PublicHive,
  PublicSting,
} from '../types/sting';
import { AppError } from '../utils/AppError';
import { bboxToGeoBox, coordinatesToGeoPoint } from '../utils/geo';

function toPublicSting(sting: ISting): PublicSting {
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

function toPublicHive(hive: IHive): PublicHive {
  return {
    id: hive.id,
    center: coordinatesToGeoPoint(hive.center.coordinates),
    radiusM: hive.radiusM,
    activeStingsCount: hive.activeStingsCount,
    createdAt: hive.createdAt.toISOString(),
    updatedAt: hive.updatedAt.toISOString(),
  };
}

function buildImageUrl(filename: string): string {
  return `${env.baseUrl}/uploads/${filename}`;
}

function buildExpiresAt(createdAt: Date): Date {
  return new Date(createdAt.getTime() + env.stingTtlHours * 60 * 60 * 1000);
}

export async function findNearby(bbox: BboxQuery): Promise<{ stings: PublicSting[]; hives: PublicHive[] }> {
  const now = new Date();
  const box = bboxToGeoBox(bbox.swLng, bbox.swLat, bbox.neLng, bbox.neLat);

  const [stings, hives] = await Promise.all([
    Sting.find({
      location: { $geoWithin: { $box: box } },
      expiresAt: { $gt: now },
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

  const imageUrl = buildImageUrl(input.imageFilename);
  const createdAt = new Date();

  const sting = await Sting.create({
    authorId: input.authorId,
    imageUrl,
    thumbnailUrl: imageUrl,
    location: {
      type: 'Point',
      coordinates: [input.lng, input.lat],
    },
    accuracyM: input.accuracyM,
    capturedAt: input.capturedAt,
    expiresAt: buildExpiresAt(createdAt),
    idempotencyKey: input.idempotencyKey ?? null,
  });

  return { sting: toPublicSting(sting) };
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
  await sting.deleteOne();
}
