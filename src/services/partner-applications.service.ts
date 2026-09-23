import exifr from 'exifr';

import env from '../config/env';
import PartnerApplication, {
  IListingUrls,
  IPartnerApplication,
  PlaceCategory,
} from '../models/PartnerApplication';
import Place from '../models/Place';
import User from '../models/User';
import { EMPTY_SOCIAL_LINKS } from '../types/profile-user';
import { AppError } from '../utils/AppError';
import { assertPlacePhotoSize, processPlacePhoto } from './image.service';
import { validatePhotoModeration } from './moderation.service';
import { deleteStoredImage, uploadOnsiteProof } from './storage.service';
import { validateStingSubmission } from './sting-validation.service';
import { assertNoPlaceOverlap, assertPlaceCapacity } from './places.service';

const LIBRARY_SOFTWARE = /google photos|screenshot|snapseed|photoshop|lightroom|instagram|whatsapp|telegram|picsart|canva/i;

export interface ApplicationInput {
  brandName?: string;
  category?: PlaceCategory;
  address?: {
    formatted?: string;
    city?: string | null;
    country?: string | null;
  };
  phone?: string | null;
  contactEmail?: string;
  listingUrls?: Partial<IListingUrls>;
}

export interface PublicApplication {
  id: string;
  userId: string;
  brandName: string;
  category: PlaceCategory;
  address: {
    formatted: string;
    city: string | null;
    country: string | null;
    lat: number | null;
    lng: number | null;
    source: 'declared' | 'onsite' | 'manual_admin';
  };
  phone: string | null;
  contactEmail: string;
  listingUrls: IListingUrls;
  onsite: {
    verifiedAt: string;
    lat: number;
    lng: number;
    accuracyM: number;
    distanceToAddressM: number;
  } | null;
  status: 'draft' | 'published';
  placeId: string | null;
  createdAt: string;
  updatedAt: string;
  publishedAt: string | null;
}

function emptyListings(): IListingUrls {
  return { instagram: null, website: null, ymaps: null, twogis: null };
}

export function toPublicApplication(application: IPartnerApplication): PublicApplication {
  return {
    id: application.id,
    userId: String(application.userId),
    brandName: application.brandName,
    category: application.category,
    address: {
      formatted: application.address.formatted,
      city: application.address.city,
      country: application.address.country,
      lat: application.address.lat,
      lng: application.address.lng,
      source: application.address.source,
    },
    phone: application.phone,
    contactEmail: application.contactEmail,
    listingUrls: {
      instagram: application.listingUrls?.instagram ?? null,
      website: application.listingUrls?.website ?? null,
      ymaps: application.listingUrls?.ymaps ?? null,
      twogis: application.listingUrls?.twogis ?? null,
    },
    onsite: application.onsite
      ? {
          verifiedAt: application.onsite.verifiedAt.toISOString(),
          lat: application.onsite.lat,
          lng: application.onsite.lng,
          accuracyM: application.onsite.accuracyM,
          distanceToAddressM: application.onsite.distanceToAddressM,
        }
      : null,
    status: application.status,
    placeId: application.placeId ? String(application.placeId) : null,
    createdAt: application.createdAt.toISOString(),
    updatedAt: application.updatedAt.toISOString(),
    publishedAt: application.publishedAt ? application.publishedAt.toISOString() : null,
  };
}

function applyPatch(application: IPartnerApplication, input: ApplicationInput): void {
  if (input.brandName != null) {
    application.brandName = input.brandName.trim();
  }
  if (input.category) {
    application.category = input.category;
  }
  if (input.address?.formatted != null) {
    application.address.formatted = input.address.formatted.trim();
    if (!application.onsite) {
      application.address.source = 'declared';
      application.address.lat = null;
      application.address.lng = null;
    }
  }
  if (input.address && 'city' in input.address) {
    application.address.city = input.address.city?.trim() ? input.address.city.trim() : null;
  }
  if (input.address && 'country' in input.address) {
    application.address.country = input.address.country?.trim() ? input.address.country.trim() : null;
  }
  if (input.phone !== undefined) {
    application.phone = input.phone;
  }
  if (input.contactEmail != null) {
    application.contactEmail = input.contactEmail.trim().toLowerCase();
  }
  if (input.listingUrls) {
    const current = application.listingUrls ?? emptyListings();
    application.listingUrls = {
      instagram: input.listingUrls.instagram !== undefined ? input.listingUrls.instagram : current.instagram,
      website: input.listingUrls.website !== undefined ? input.listingUrls.website : current.website,
      ymaps: input.listingUrls.ymaps !== undefined ? input.listingUrls.ymaps : current.ymaps,
      twogis: input.listingUrls.twogis !== undefined ? input.listingUrls.twogis : current.twogis,
    };
  }
}

async function requireDraft(id: string, userId: string): Promise<IPartnerApplication> {
  const application = await PartnerApplication.findOne({ _id: id, userId });
  if (!application) {
    throw new AppError(404, 'NOT_FOUND', 'Заявка не найдена');
  }
  if (application.status !== 'draft') {
    throw new AppError(422, 'APPLICATION_NOT_EDITABLE', 'Заявка уже опубликована');
  }
  return application;
}

export async function createDraft(userId: string, input: ApplicationInput): Promise<PublicApplication> {
  const existing = await PartnerApplication.findOne({ userId, status: 'draft' });
  if (existing) {
    applyPatch(existing, input);
    await existing.save();
    return toPublicApplication(existing);
  }

  await assertPlaceCapacity(userId);
  const application = await PartnerApplication.create({
    userId,
    brandName: input.brandName?.trim() ?? '',
    category: input.category ?? 'other',
    address: {
      formatted: input.address?.formatted?.trim() ?? '',
      city: input.address?.city?.trim() || null,
      country: input.address?.country?.trim() || null,
      lat: null,
      lng: null,
      source: 'declared',
    },
    phone: input.phone ?? null,
    contactEmail: input.contactEmail?.trim().toLowerCase() ?? '',
    listingUrls: {
      instagram: input.listingUrls?.instagram ?? null,
      website: input.listingUrls?.website ?? null,
      ymaps: input.listingUrls?.ymaps ?? null,
      twogis: input.listingUrls?.twogis ?? null,
    },
    status: 'draft',
  });
  return toPublicApplication(application);
}

export async function listMine(userId: string): Promise<PublicApplication[]> {
  const applications = await PartnerApplication.find({ userId }).sort({ updatedAt: -1 }).limit(20);
  return applications.map(toPublicApplication);
}

export async function updateDraft(id: string, userId: string, input: ApplicationInput): Promise<PublicApplication> {
  const application = await requireDraft(id, userId);
  applyPatch(application, input);
  await application.save();
  return toPublicApplication(application);
}

async function assertCameraFile(buffer: Buffer): Promise<void> {
  try {
    const data = await exifr.parse(buffer, { pick: ['Software'] });
    const software = typeof data?.Software === 'string' ? data.Software : '';
    if (software && LIBRARY_SOFTWARE.test(software)) {
      throw new AppError(422, 'ONSITE_VALIDATION_FAILED', 'Фото не прошло проверку подлинности', {
        reason: 'GALLERY_SOURCE',
      });
    }
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }
  }
}

export async function saveOnsite(input: {
  applicationId: string;
  userId: string;
  lat: number;
  lng: number;
  accuracyM: number;
  capturedAt: Date;
  photoBuffer: Buffer;
}): Promise<PublicApplication> {
  const application = await requireDraft(input.applicationId, input.userId);

  if (input.accuracyM > env.placeOnsiteAccuracyMaxM) {
    throw new AppError(422, 'ONSITE_LOW_ACCURACY', 'GPS слишком грубый для привязки места');
  }

  await assertCameraFile(input.photoBuffer);

  try {
    await validateStingSubmission({
      lat: input.lat,
      lng: input.lng,
      accuracyM: input.accuracyM,
      capturedAt: input.capturedAt,
      photoBuffer: input.photoBuffer,
    });
  } catch (error) {
    if (error instanceof AppError) {
      throw new AppError(422, 'ONSITE_VALIDATION_FAILED', 'Фото не прошло проверку подлинности', error.details);
    }
    throw error;
  }

  await assertPlacePhotoSize(input.photoBuffer).catch((error: unknown) => {
    if (error instanceof AppError && error.code === 'MEDIA_TOO_SMALL') {
      return;
    }
    throw error;
  });

  const processed = await processPlacePhoto(input.photoBuffer);
  await validatePhotoModeration(processed.thumbnail);
  const photoUrl = await uploadOnsiteProof(processed.original);

  if (application.onsite?.photoUrl) {
    await deleteStoredImage(application.onsite.photoUrl);
  }

  const verifiedAt = new Date();
  application.onsite = {
    verifiedAt,
    lat: input.lat,
    lng: input.lng,
    accuracyM: input.accuracyM,
    photoUrl,
    distanceToAddressM: 0,
  };
  application.address.lat = input.lat;
  application.address.lng = input.lng;
  application.address.source = 'onsite';
  await application.save();
  return toPublicApplication(application);
}

function missingFields(application: IPartnerApplication): string[] {
  const missing: string[] = [];
  if (application.brandName.trim().length < 2) {
    missing.push('brandName');
  }
  if (!application.category) {
    missing.push('category');
  }
  if (application.address.formatted.trim().length < 4) {
    missing.push('address.formatted');
  }
  if (!application.contactEmail.includes('@')) {
    missing.push('contactEmail');
  }
  if (!application.onsite) {
    missing.push('onsite');
  }
  return missing;
}

export async function submitApplication(id: string, userId: string): Promise<{ application: PublicApplication; placeId: string }> {
  const application = await requireDraft(id, userId);
  const missing = missingFields(application);
  if (missing.length > 0 || !application.onsite) {
    throw new AppError(422, 'APPLICATION_INCOMPLETE', 'Заявка заполнена не до конца', { missing });
  }

  const user = await User.findById(userId);
  if (!user) {
    throw new AppError(404, 'USER_NOT_FOUND', 'Пользователь не найден');
  }

  await assertPlaceCapacity(userId);
  await assertNoPlaceOverlap(application.onsite.lat, application.onsite.lng, userId);

  const place = await Place.create({
    ownerId: user._id,
    applicationId: application._id,
    name: application.brandName.trim(),
    category: application.category,
    description: null,
    address: {
      formatted: application.address.formatted.trim(),
      city: application.address.city,
      country: application.address.country,
      lat: application.onsite.lat,
      lng: application.onsite.lng,
      source: 'onsite',
    },
    phone: application.phone,
    center: {
      type: 'Point',
      coordinates: [application.onsite.lng, application.onsite.lat],
    },
    radiusM: env.placeRadiusM,
    socialLinks: {
      ...EMPTY_SOCIAL_LINKS,
      instagram: application.listingUrls?.instagram ?? null,
      website: application.listingUrls?.website ?? null,
    },
    status: 'draft',
    verifiedAt: null,
  });

  try {
    application.status = 'published';
    application.placeId = place._id;
    application.publishedAt = new Date();
    await application.save();
    if (user.accountType === 'personal') {
      user.accountType = 'partner';
      await user.save();
    }
  } catch (error) {
    await place.deleteOne();
    throw error;
  }

  return { application: toPublicApplication(application), placeId: place.id };
}

export async function anonymizeApplications(userId: string): Promise<void> {
  const purgeAt = new Date(Date.now() + env.placeOnsiteRetainDays * 24 * 60 * 60 * 1000);
  const applications = await PartnerApplication.find({ userId });
  for (const application of applications) {
    application.phone = null;
    application.contactEmail = '';
    application.listingUrls = emptyListings();
    application.brandName = '';
    application.address.formatted = '';
    application.onsitePurgeAt = application.onsite ? purgeAt : null;
    await application.save();
  }
}

export async function purgeDueOnsiteProofs(now = new Date()): Promise<void> {
  const due = await PartnerApplication.find({
    onsitePurgeAt: { $lte: now },
    'onsite.photoUrl': { $type: 'string' },
  }).limit(50);

  for (const application of due) {
    if (application.onsite?.photoUrl) {
      await deleteStoredImage(application.onsite.photoUrl);
      application.onsite = null;
    }
    application.onsitePurgeAt = null;
    await application.save();
  }
}
