import { NextFunction, Request, Response } from 'express';

import { PlaceCategory } from '../models/PartnerApplication';
import * as partnerService from '../services/partner-applications.service';
import { AppError } from '../utils/AppError';

function normalizePhone(value: unknown): string | null {
  if (value == null || value === '') {
    return null;
  }
  return String(value).trim().replace(/[\s()-]/g, '');
}

function nullableString(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function readApplicationBody(body: Request['body']) {
  const address = body.address ?? {};
  const listingUrls = body.listingUrls ?? {};
  return {
    brandName: typeof body.brandName === 'string' ? body.brandName : undefined,
    category: body.category as PlaceCategory | undefined,
    address: body.address
      ? {
          formatted: typeof address.formatted === 'string' ? address.formatted : undefined,
          city: 'city' in address ? nullableString(address.city) : undefined,
          country: 'country' in address ? nullableString(address.country) : undefined,
          lat: typeof address.lat === 'number' ? address.lat : undefined,
          lng: typeof address.lng === 'number' ? address.lng : undefined,
        }
      : undefined,
    phone: 'phone' in body ? normalizePhone(body.phone) : undefined,
    contactEmail: typeof body.contactEmail === 'string' ? body.contactEmail : undefined,
    listingUrls: body.listingUrls
      ? {
          instagram: 'instagram' in listingUrls ? nullableString(listingUrls.instagram) : undefined,
          website: 'website' in listingUrls ? nullableString(listingUrls.website) : undefined,
          ymaps: 'ymaps' in listingUrls ? nullableString(listingUrls.ymaps) : undefined,
          twogis: 'twogis' in listingUrls ? nullableString(listingUrls.twogis) : undefined,
        }
      : undefined,
  };
}

export async function create(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const application = await partnerService.createDraft(req.user!.id, readApplicationBody(req.body));
    res.status(201).json({ application });
  } catch (error) {
    next(error);
  }
}

export async function mine(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const applications = await partnerService.listMine(req.user!.id);
    res.status(200).json({ applications });
  } catch (error) {
    next(error);
  }
}

export async function update(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const application = await partnerService.updateDraft(
      req.params.id,
      req.user!.id,
      readApplicationBody(req.body),
    );
    res.status(200).json({ application });
  } catch (error) {
    next(error);
  }
}

export async function onsite(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.file?.buffer) {
      throw new AppError(422, 'VALIDATION_ERROR', 'Поле photo обязательно');
    }
    const application = await partnerService.saveOnsite({
      applicationId: req.params.id,
      userId: req.user!.id,
      lat: Number(req.body.lat),
      lng: Number(req.body.lng),
      accuracyM: Number(req.body.accuracy),
      capturedAt: new Date(req.body.capturedAt),
      photoBuffer: req.file.buffer,
    });
    res.status(200).json({ application });
  } catch (error) {
    next(error);
  }
}

export async function submit(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const result = await partnerService.submitApplication(req.params.id, req.user!.id, {
      lat: Number(req.body.lat),
      lng: Number(req.body.lng),
    });
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
}
