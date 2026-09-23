import { Types } from 'mongoose';
import exifr from 'exifr';

import env from '../config/env';
import Place, { IPlace, PlacePauseReason, PlaceStatus } from '../models/Place';
import PlaceMedia, { IPlaceMedia, MediaKind, MediaRejectCode, MediaSource } from '../models/PlaceMedia';
import { PlaceCategory } from '../models/PartnerApplication';
import Sting from '../models/Sting';
import User from '../models/User';
import { IHive } from '../models/Hive';
import { BboxQuery, GeoPoint } from '../types/sting';
import { EMPTY_SOCIAL_LINKS, UserSocialLinks } from '../types/profile-user';
import { HiveStage } from '../utils/activation';
import { AppError } from '../utils/AppError';
import { bboxToGeoBox, haversineDistanceM } from '../utils/geo';
import { mergeSocialLinks, serializeSocialLinks } from '../utils/social-links';
import { assertPlacePhotoSize, processPlacePhoto } from './image.service';
import { validatePhotoModeration } from './moderation.service';
import { deleteStoredImage, uploadPlaceImages } from './storage.service';

export interface PlaceSummary {
  id: string;
  name: string;
  category: PlaceCategory;
  center: GeoPoint;
  radiusM: number;
  coverThumbnailUrl: string | null;
  hiveId: string | null;
  hiveStage: HiveStage | null;
  activeGuestStingsCount: number;
  status: 'live';
}

export interface PublicPlaceMedia {
  id: string;
  placeId: string;
  kind: MediaKind;
  source: MediaSource;
  imageUrl: string;
  thumbnailUrl: string;
  width: number;
  height: number;
  sortOrder: number;
  moderation: 'approved' | 'rejected';
  rejectCode: MediaRejectCode | null;
  createdAt: string;
}

export interface PublicPlace {
  id: string;
  ownerId: string;
  name: string;
  category: PlaceCategory;
  description: string | null;
  address: {
    formatted: string;
    city: string | null;
    country: string | null;
  };
  center: GeoPoint;
  radiusM: number;
  cover: PublicPlaceMedia | null;
  gallery: PublicPlaceMedia[];
  socialLinks: UserSocialLinks;
  hiveId: string | null;
  hiveStage: HiveStage | null;
  activeGuestStingsCount: number;
  status: PlaceStatus;
  pauseReason: PlacePauseReason;
  verifiedAt: string | null;
  phone: string | null;
  hidden: boolean;
  createdAt: string;
  updatedAt: string;
}

const PLACE_NEARBY_LIMIT = 100;

function centerOf(place: IPlace): GeoPoint {
  return { lat: place.center.coordinates[1], lng: place.center.coordinates[0] };
}

function toPublicMedia(media: IPlaceMedia, includeReject: boolean): PublicPlaceMedia {
  return {
    id: media.id,
    placeId: String(media.placeId),
    kind: media.kind,
    source: media.source,
    imageUrl: media.imageUrl,
    thumbnailUrl: media.thumbnailUrl,
    width: media.width,
    height: media.height,
    sortOrder: media.sortOrder,
    moderation: media.moderation,
    rejectCode: includeReject ? media.rejectCode : null,
    createdAt: media.createdAt.toISOString(),
  };
}

export function toPlaceSummary(place: IPlace): PlaceSummary {
  return {
    id: place.id,
    name: place.name,
    category: place.category,
    center: centerOf(place),
    radiusM: place.radiusM,
    coverThumbnailUrl: place.coverThumbnailUrl,
    hiveId: place.hiveId ? String(place.hiveId) : null,
    hiveStage: place.hiveStage,
    activeGuestStingsCount: place.activeGuestStingsCount,
    status: 'live',
  };
}

export async function attachPlaceSummaries<T extends { placeId?: string | null; place?: PlaceSummary | null }>(
  placeIds: Array<Types.ObjectId | null | undefined>,
  items: T[],
): Promise<T[]> {
  const ids = placeIds.filter((id): id is Types.ObjectId => id != null);
  if (ids.length === 0) {
    return items.map((item) => ({ ...item, placeId: item.placeId ?? null, place: item.place ?? null }));
  }

  const places = await Place.find({ _id: { $in: ids }, status: 'live', coverThumbnailUrl: { $ne: null } });
  const byId = new Map(places.map((place) => [place.id, toPlaceSummary(place)]));

  return items.map((item, index) => {
    const rawId = placeIds[index];
    const placeId = rawId ? String(rawId) : null;
    return {
      ...item,
      placeId,
      place: placeId ? (byId.get(placeId) ?? null) : null,
    };
  });
}

async function loadMedia(placeId: Types.ObjectId, ownerView: boolean): Promise<IPlaceMedia[]> {
  const filter: Record<string, unknown> = { placeId };
  if (!ownerView) {
    filter.moderation = 'approved';
  }
  return PlaceMedia.find(filter).sort({ kind: 1, sortOrder: 1, createdAt: 1 });
}

export async function serializePlace(place: IPlace, viewerId: string): Promise<PublicPlace> {
  const isOwner = String(place.ownerId) === viewerId;
  if (place.status === 'suspended' && !isOwner) {
    throw new AppError(404, 'PLACE_SUSPENDED', 'Место снято');
  }

  if (place.status === 'paused' && !isOwner) {
    return {
      id: place.id,
      ownerId: String(place.ownerId),
      name: place.name,
      category: place.category,
      description: null,
      address: { formatted: '', city: null, country: null },
      center: centerOf(place),
      radiusM: place.radiusM,
      cover: null,
      gallery: [],
      socialLinks: { ...EMPTY_SOCIAL_LINKS },
      hiveId: null,
      hiveStage: null,
      activeGuestStingsCount: 0,
      status: 'paused',
      pauseReason: null,
      verifiedAt: null,
      phone: null,
      hidden: true,
      createdAt: place.createdAt.toISOString(),
      updatedAt: place.updatedAt.toISOString(),
    };
  }

  const media = await loadMedia(place._id, isOwner);
  const coverDoc =
    media.find((item) => item.kind === 'cover' && item.moderation === 'approved') ??
    (isOwner ? media.find((item) => item.kind === 'cover') : undefined);
  const gallery = media
    .filter((item) => item.kind === 'gallery' && (isOwner || item.moderation === 'approved'))
    .map((item) => toPublicMedia(item, isOwner));

  return {
    id: place.id,
    ownerId: String(place.ownerId),
    name: place.name,
    category: place.category,
    description: place.description,
    address: {
      formatted: place.address.formatted,
      city: place.address.city,
      country: place.address.country,
    },
    center: centerOf(place),
    radiusM: place.radiusM,
    cover: coverDoc ? toPublicMedia(coverDoc, isOwner) : null,
    gallery,
    socialLinks: serializeSocialLinks(place.socialLinks),
    hiveId: place.hiveId ? String(place.hiveId) : null,
    hiveStage: place.hiveStage,
    activeGuestStingsCount: place.activeGuestStingsCount,
    status: place.status,
    pauseReason: isOwner ? place.pauseReason : null,
    verifiedAt: place.verifiedAt ? place.verifiedAt.toISOString() : null,
    phone: isOwner ? place.phone : null,
    hidden: false,
    createdAt: place.createdAt.toISOString(),
    updatedAt: place.updatedAt.toISOString(),
  };
}

export async function findContainingLivePlace(lat: number, lng: number): Promise<IPlace | null> {
  const candidates = await Place.find({
    status: 'live',
    center: {
      $near: {
        $geometry: { type: 'Point', coordinates: [lng, lat] },
        $maxDistance: env.placeRadiusMaxM,
      },
    },
  }).limit(8);

  let best: IPlace | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const place of candidates) {
    const distance = haversineDistanceM({ lat, lng }, centerOf(place));
    if (distance <= place.radiusM && distance < bestDistance) {
      best = place;
      bestDistance = distance;
    }
  }
  return best;
}

export async function assertNoPlaceOverlap(lat: number, lng: number, ownerId: string): Promise<void> {
  const candidates = await Place.find({
    status: { $in: ['live', 'draft'] },
    ownerId: { $ne: ownerId },
    center: {
      $near: {
        $geometry: { type: 'Point', coordinates: [lng, lat] },
        $maxDistance: env.placeOverlapMinM,
      },
    },
  }).limit(5);

  const overlap = candidates.find(
    (place) => haversineDistanceM({ lat, lng }, centerOf(place)) < env.placeOverlapMinM,
  );
  if (overlap) {
    throw new AppError(409, 'PLACE_OVERLAP', 'Рядом уже есть место', { placeId: overlap.id });
  }
}

export async function assertPlaceCapacity(ownerId: string): Promise<void> {
  const count = await Place.countDocuments({ ownerId });
  if (count >= env.placeMaxPerPartner) {
    throw new AppError(422, 'PLACE_LIMIT', 'Достигнут лимит мест');
  }
}

export async function refreshPlaceGuestCount(placeId: Types.ObjectId | null | undefined): Promise<void> {
  if (!placeId) {
    return;
  }

  const now = new Date();
  const stings = await Sting.find({
    placeId,
    expiresAt: { $gt: now },
    mediaPurgedAt: null,
  }).select('authorId');

  if (stings.length === 0) {
    await Place.updateOne({ _id: placeId }, { $set: { activeGuestStingsCount: 0 } });
    return;
  }

  const authorIds = [...new Set(stings.map((sting) => String(sting.authorId)))];
  const personalAuthors = await User.find({
    _id: { $in: authorIds },
    accountType: 'personal',
  }).select('_id');
  const personalIds = new Set(personalAuthors.map((user) => user.id));
  const count = stings.filter((sting) => personalIds.has(String(sting.authorId))).length;
  await Place.updateOne({ _id: placeId }, { $set: { activeGuestStingsCount: count } });
}

export async function syncHivePlace(hive: IHive): Promise<void> {
  const [lng, lat] = hive.center.coordinates;
  const place = await findContainingLivePlace(lat, lng);
  hive.placeId = place ? place._id : null;
  await hive.save();

  await Place.updateMany(
    place ? { hiveId: hive._id, _id: { $ne: place._id } } : { hiveId: hive._id },
    { $set: { hiveId: null, hiveStage: null } },
  );

  if (place) {
    place.hiveId = hive._id;
    place.hiveStage = hive.stage;
    await place.save();
  }
}

export async function clearHiveFromPlaces(hiveId: Types.ObjectId): Promise<void> {
  await Place.updateMany({ hiveId }, { $set: { hiveId: null, hiveStage: null } });
}

export async function findPlaceSummariesInBbox(bbox: BboxQuery): Promise<PlaceSummary[]> {
  const box = bboxToGeoBox(bbox.swLng, bbox.swLat, bbox.neLng, bbox.neLat);
  const places = await Place.find({
    status: 'live',
    coverThumbnailUrl: { $ne: null },
    center: { $geoWithin: { $box: box } },
  }).limit(300);

  const center = {
    lat: (bbox.swLat + bbox.neLat) / 2,
    lng: (bbox.swLng + bbox.neLng) / 2,
  };

  return places
    .sort((left, right) => haversineDistanceM(center, centerOf(left)) - haversineDistanceM(center, centerOf(right)))
    .slice(0, PLACE_NEARBY_LIMIT)
    .map(toPlaceSummary);
}

async function requireOwnedPlace(placeId: string, userId: string): Promise<IPlace> {
  const place = await Place.findById(placeId);
  if (!place) {
    throw new AppError(404, 'NOT_FOUND', 'Место не найдено');
  }
  if (String(place.ownerId) !== userId) {
    throw new AppError(403, 'MEDIA_NOT_OWNER', 'Место принадлежит другому аккаунту');
  }
  if (place.status === 'suspended') {
    throw new AppError(403, 'PLACE_SUSPENDED', 'Место снято');
  }
  return place;
}

async function requirePartner(userId: string): Promise<void> {
  const user = await User.findById(userId).select('accountType');
  if (!user || (user.accountType !== 'partner' && user.accountType !== 'official')) {
    throw new AppError(403, 'NOT_PARTNER', 'Публикация места доступна заведению');
  }
}

export async function getPlace(placeId: string, viewerId: string): Promise<PublicPlace> {
  const place = await Place.findById(placeId);
  if (!place || (place.status === 'draft' && String(place.ownerId) !== viewerId)) {
    throw new AppError(404, 'NOT_FOUND', 'Место не найдено');
  }
  return serializePlace(place, viewerId);
}

export async function listMyPlaces(userId: string): Promise<PublicPlace[]> {
  const places = await Place.find({ ownerId: userId }).sort({ createdAt: -1 });
  return Promise.all(places.map((place) => serializePlace(place, userId)));
}

export interface UpdatePlaceInput {
  name?: string;
  description?: string | null;
  category?: PlaceCategory;
  socialLinks?: Partial<UserSocialLinks> | null;
  phone?: string | null;
  address?: {
    formatted?: string;
    city?: string | null;
    country?: string | null;
  };
}

export async function updatePlace(placeId: string, userId: string, input: UpdatePlaceInput): Promise<PublicPlace> {
  await requirePartner(userId);
  const place = await requireOwnedPlace(placeId, userId);

  if (input.name != null) {
    place.name = input.name.trim();
  }
  if (input.description !== undefined) {
    place.description = input.description?.trim() ? input.description.trim() : null;
  }
  if (input.category) {
    place.category = input.category;
  }
  if (input.socialLinks !== undefined) {
    place.socialLinks = mergeSocialLinks(place.socialLinks, input.socialLinks);
  }
  if (input.phone !== undefined) {
    place.phone = input.phone;
  }
  if (input.address?.formatted != null) {
    place.address.formatted = input.address.formatted.trim();
  }
  if (input.address && 'city' in input.address) {
    place.address.city = input.address.city?.trim() ? input.address.city.trim() : null;
  }
  if (input.address && 'country' in input.address) {
    place.address.country = input.address.country?.trim() ? input.address.country.trim() : null;
  }

  await place.save();
  return serializePlace(place, userId);
}

export async function pausePlace(placeId: string, userId: string): Promise<PublicPlace> {
  const place = await requireOwnedPlace(placeId, userId);
  if (place.status !== 'live') {
    throw new AppError(422, 'PLACE_NOT_LIVE', 'Пауза доступна только опубликованному месту');
  }
  place.status = 'paused';
  place.pauseReason = 'owner';
  await place.save();
  if (place.hiveId) {
    await clearHiveFromPlaces(place.hiveId);
    place.hiveId = null;
    place.hiveStage = null;
    await place.save();
  }
  return serializePlace(place, userId);
}

export async function resumePlace(placeId: string, userId: string): Promise<PublicPlace> {
  await requirePartner(userId);
  const place = await requireOwnedPlace(placeId, userId);
  if (place.status !== 'paused') {
    throw new AppError(422, 'VALIDATION_ERROR', 'Возобновить можно только скрытое место');
  }
  if (!place.coverMediaId || !place.coverThumbnailUrl) {
    throw new AppError(422, 'PLACE_RESUME_NEEDS_COVER', 'Нужна обложка, чтобы снова показать место');
  }
  place.status = 'live';
  place.pauseReason = null;
  await place.save();
  return serializePlace(place, userId);
}

async function readExif(buffer: Buffer): Promise<{
  gps: { lat: number; lng: number } | null;
  capturedAt: Date | null;
}> {
  try {
    const data = await exifr.parse(buffer, {
      gps: true,
      reviveValues: true,
      pick: ['latitude', 'longitude', 'DateTimeOriginal', 'CreateDate'],
    });
    if (!data || typeof data !== 'object') {
      return { gps: null, capturedAt: null };
    }
    const record = data as Record<string, unknown>;
    const capturedAt =
      record.DateTimeOriginal instanceof Date
        ? record.DateTimeOriginal
        : record.CreateDate instanceof Date
          ? record.CreateDate
          : null;
    const gps =
      typeof record.latitude === 'number' && typeof record.longitude === 'number'
        ? { lat: record.latitude, lng: record.longitude }
        : null;
    return { gps, capturedAt };
  } catch {
    return { gps: null, capturedAt: null };
  }
}

async function promoteDraftIfCover(place: IPlace): Promise<boolean> {
  if (place.status !== 'draft' || !place.coverMediaId) {
    return false;
  }
  const owner = await User.findById(place.ownerId).select('accountType');
  if (!owner || (owner.accountType !== 'partner' && owner.accountType !== 'official')) {
    return false;
  }
  place.status = 'live';
  place.pauseReason = null;
  await place.save();
  return true;
}

export async function addPlaceMedia(input: {
  placeId: string;
  userId: string;
  kind: MediaKind;
  source: MediaSource;
  photoBuffer: Buffer;
}): Promise<{ place: PublicPlace; wentLive: boolean }> {
  await requirePartner(input.userId);
  const place = await requireOwnedPlace(input.placeId, input.userId);
  const { width, height } = await assertPlacePhotoSize(input.photoBuffer);

  if (input.kind === 'gallery') {
    const galleryCount = await PlaceMedia.countDocuments({ placeId: place._id, kind: 'gallery' });
    if (galleryCount >= env.placeGalleryMax) {
      throw new AppError(422, 'MEDIA_LIMIT', 'Галерея места заполнена');
    }
  }

  const exif = await readExif(input.photoBuffer);
  const processed = await processPlacePhoto(input.photoBuffer);
  await validatePhotoModeration(processed.thumbnail);
  const uploaded = await uploadPlaceImages(processed.original, processed.thumbnail);

  const sortOrder =
    input.kind === 'gallery'
      ? await PlaceMedia.countDocuments({ placeId: place._id, kind: 'gallery' })
      : 0;

  const media = await PlaceMedia.create({
    placeId: place._id,
    kind: input.kind,
    source: input.source,
    imageUrl: uploaded.imageUrl,
    thumbnailUrl: uploaded.thumbnailUrl,
    width,
    height,
    sortOrder,
    moderation: 'approved',
    rejectCode: null,
    exifGps: exif.gps,
    exifCapturedAt: exif.capturedAt,
  });

  if (input.kind === 'cover') {
    const previousId = place.coverMediaId;
    place.coverMediaId = media._id;
    place.coverThumbnailUrl = media.thumbnailUrl;
    await place.save();
    if (previousId && String(previousId) !== media.id) {
      const previous = await PlaceMedia.findById(previousId);
      if (previous) {
        await deleteStoredImage(previous.imageUrl);
        await deleteStoredImage(previous.thumbnailUrl);
        await previous.deleteOne();
      }
    }
  }

  const wentLive = await promoteDraftIfCover(place);
  return { place: await serializePlace(place, input.userId), wentLive };
}

export async function reorderGallery(
  placeId: string,
  userId: string,
  galleryIds: string[],
): Promise<PublicPlace> {
  const place = await requireOwnedPlace(placeId, userId);
  const gallery = await PlaceMedia.find({ placeId: place._id, kind: 'gallery' });
  const currentIds = new Set(gallery.map((item) => item.id));
  if (galleryIds.length !== gallery.length || galleryIds.some((id) => !currentIds.has(id))) {
    throw new AppError(422, 'VALIDATION_ERROR', 'Порядок галереи должен содержать все кадры');
  }

  await Promise.all(
    galleryIds.map((id, index) => PlaceMedia.updateOne({ _id: id, placeId: place._id }, { $set: { sortOrder: index } })),
  );
  return serializePlace(place, userId);
}

async function pauseForMissingCover(place: IPlace): Promise<void> {
  if (place.status !== 'live') {
    place.coverMediaId = null;
    place.coverThumbnailUrl = null;
    await place.save();
    return;
  }
  place.status = 'paused';
  place.pauseReason = 'cover_missing';
  place.coverMediaId = null;
  place.coverThumbnailUrl = null;
  if (place.hiveId) {
    await clearHiveFromPlaces(place.hiveId);
    place.hiveId = null;
    place.hiveStage = null;
  }
  await place.save();
}

export async function deletePlaceMedia(placeId: string, mediaId: string, userId: string): Promise<PublicPlace> {
  const place = await requireOwnedPlace(placeId, userId);
  const media = await PlaceMedia.findOne({ _id: mediaId, placeId: place._id });
  if (!media) {
    throw new AppError(404, 'NOT_FOUND', 'Фото не найдено');
  }

  await deleteStoredImage(media.imageUrl);
  await deleteStoredImage(media.thumbnailUrl);
  await media.deleteOne();

  if (media.kind === 'cover' || String(place.coverMediaId) === media.id) {
    await pauseForMissingCover(place);
  }

  return serializePlace(place, userId);
}

export async function suspendPlace(placeId: string, reason: string): Promise<void> {
  const place = await Place.findById(placeId);
  if (!place) {
    throw new AppError(404, 'NOT_FOUND', 'Место не найдено');
  }
  place.status = 'suspended';
  place.pauseReason = null;
  if (place.hiveId) {
    await clearHiveFromPlaces(place.hiveId);
    place.hiveId = null;
    place.hiveStage = null;
  }
  await place.save();
}

export async function unsuspendPlace(placeId: string): Promise<void> {
  const place = await Place.findById(placeId);
  if (!place) {
    throw new AppError(404, 'NOT_FOUND', 'Место не найдено');
  }
  place.status = 'paused';
  place.pauseReason = 'owner';
  await place.save();
}

export async function transferPlace(placeId: string, newOwnerId: string): Promise<void> {
  const place = await Place.findById(placeId);
  if (!place) {
    throw new AppError(404, 'NOT_FOUND', 'Место не найдено');
  }
  const [current, next] = await Promise.all([
    User.findById(place.ownerId).select('accountType'),
    User.findById(newOwnerId).select('accountType'),
  ]);
  if (!current || !next) {
    throw new AppError(404, 'USER_NOT_FOUND', 'Пользователь не найден');
  }
  if (
    (current.accountType !== 'partner' && current.accountType !== 'official') ||
    (next.accountType !== 'partner' && next.accountType !== 'official')
  ) {
    throw new AppError(422, 'NOT_PARTNER', 'Оба аккаунта должны быть заведениями');
  }
  await assertPlaceCapacity(newOwnerId);
  place.ownerId = next._id;
  await place.save();
}

export async function rejectPlaceMedia(mediaId: string, rejectCode: MediaRejectCode): Promise<void> {
  const media = await PlaceMedia.findById(mediaId);
  if (!media) {
    throw new AppError(404, 'NOT_FOUND', 'Фото не найдено');
  }
  media.moderation = 'rejected';
  media.rejectCode = rejectCode;
  await media.save();

  const place = await Place.findById(media.placeId);
  if (!place) {
    return;
  }
  if (media.kind === 'cover' || String(place.coverMediaId) === media.id) {
    await pauseForMissingCover(place);
  }
}

export async function createOfficialPlace(input: {
  ownerId: string;
  name: string;
  category: PlaceCategory;
  formatted: string;
  city: string | null;
  country: string | null;
  lat: number;
  lng: number;
  phone: string | null;
  description: string | null;
}): Promise<IPlace> {
  const owner = await User.findById(input.ownerId).select('accountType');
  if (!owner || owner.accountType !== 'official') {
    throw new AppError(422, 'NOT_PARTNER', 'Место без заявки создаётся только для official');
  }
  await assertPlaceCapacity(input.ownerId);
  await assertNoPlaceOverlap(input.lat, input.lng, input.ownerId);

  return Place.create({
    ownerId: owner._id,
    applicationId: null,
    name: input.name,
    category: input.category,
    description: input.description,
    address: {
      formatted: input.formatted,
      city: input.city,
      country: input.country,
      lat: input.lat,
      lng: input.lng,
      source: 'manual_admin',
    },
    phone: input.phone,
    center: { type: 'Point', coordinates: [input.lng, input.lat] },
    radiusM: env.placeRadiusM,
    socialLinks: { ...EMPTY_SOCIAL_LINKS },
    status: 'draft',
    verifiedAt: null,
  });
}

export async function movePlaceCenter(placeId: string, lat: number, lng: number): Promise<void> {
  const place = await Place.findById(placeId);
  if (!place) {
    throw new AppError(404, 'NOT_FOUND', 'Место не найдено');
  }
  const distance = haversineDistanceM({ lat, lng }, centerOf(place));
  if (distance > env.placeClaimRadiusM) {
    throw new AppError(422, 'VALIDATION_ERROR', 'Центр можно сдвинуть только в пределах допустимого радиуса');
  }
  place.center = { type: 'Point', coordinates: [lng, lat] };
  place.address.lat = lat;
  place.address.lng = lng;
  place.address.source = 'manual_admin';
  await place.save();
}

export async function suspendLivePlaces(ownerId: string): Promise<void> {
  const places = await Place.find({ ownerId, status: 'live' });
  for (const place of places) {
    place.status = 'suspended';
    if (place.hiveId) {
      await clearHiveFromPlaces(place.hiveId);
      place.hiveId = null;
      place.hiveStage = null;
    }
    await place.save();
  }
}

export async function suspendPlacesOnAccountDeletion(ownerId: string): Promise<void> {
  const places = await Place.find({ ownerId });
  for (const place of places) {
    const media = await PlaceMedia.find({ placeId: place._id });
    await Promise.all(
      media.flatMap((item) => [deleteStoredImage(item.imageUrl), deleteStoredImage(item.thumbnailUrl)]),
    );
    await PlaceMedia.deleteMany({ placeId: place._id });
    place.status = 'suspended';
    place.coverMediaId = null;
    place.coverThumbnailUrl = null;
    place.phone = null;
    if (place.hiveId) {
      await clearHiveFromPlaces(place.hiveId);
      place.hiveId = null;
      place.hiveStage = null;
    }
    await place.save();
  }
}

export async function autoPauseForReports(placeId: Types.ObjectId): Promise<void> {
  const place = await Place.findById(placeId);
  if (!place || place.status !== 'live') {
    return;
  }
  place.status = 'paused';
  place.pauseReason = 'reports';
  if (place.hiveId) {
    await clearHiveFromPlaces(place.hiveId);
    place.hiveId = null;
    place.hiveStage = null;
  }
  await place.save();
}

export function clampRadius(radiusM: number): number {
  return Math.min(env.placeRadiusMaxM, Math.max(env.placeRadiusMinM, radiusM));
}
