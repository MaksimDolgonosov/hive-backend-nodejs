import { NextFunction, Request, Response } from 'express';
import mongoose from 'mongoose';

import { PlaceCategory } from '../models/PartnerApplication';
import { MediaKind, MediaRejectCode, MediaSource } from '../models/PlaceMedia';
import { PlaceReportReason } from '../models/PlaceReport';
import Sting from '../models/Sting';
import * as placesService from '../services/places.service';
import * as reportsService from '../services/place-reports.service';
import { AppError } from '../utils/AppError';
import { mapPublicStings } from '../utils/sting.mapper';

function parseBool(value: unknown): boolean {
  return value === true || value === 'true' || value === '1';
}

function normalizePhone(value: unknown): string | null {
  if (value == null || value === '') {
    return null;
  }
  return String(value).trim().replace(/[\s()-]/g, '');
}

export async function getById(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const place = await placesService.getPlace(req.params.id, req.user!.id);
    res.status(200).json({ place, viewerIsOwner: place.ownerId === req.user!.id && !place.hidden });
  } catch (error) {
    next(error);
  }
}

export async function mine(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const places = await placesService.listMyPlaces(req.user!.id);
    res.status(200).json({ places });
  } catch (error) {
    next(error);
  }
}

export async function update(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const body = req.body as {
      name?: string;
      description?: string | null;
      category?: PlaceCategory;
      phone?: string | null;
      address?: { formatted?: string; city?: string | null; country?: string | null };
      socialLinks?: Record<string, string | null> | null;
    };
    const place = await placesService.updatePlace(req.params.id, req.user!.id, {
      name: body.name,
      description: body.description,
      category: body.category,
      phone: 'phone' in body ? normalizePhone(body.phone) : undefined,
      address: body.address,
      socialLinks: 'socialLinks' in body ? body.socialLinks : undefined,
    });
    res.status(200).json({ place });
  } catch (error) {
    next(error);
  }
}

export async function pause(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const place = await placesService.pausePlace(req.params.id, req.user!.id);
    res.status(200).json({ place });
  } catch (error) {
    next(error);
  }
}

export async function resume(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const place = await placesService.resumePlace(req.params.id, req.user!.id);
    res.status(200).json({ place });
  } catch (error) {
    next(error);
  }
}

export async function addMedia(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.file?.buffer) {
      throw new AppError(422, 'VALIDATION_ERROR', 'Поле photo обязательно');
    }
    const result = await placesService.addPlaceMedia({
      placeId: req.params.id,
      userId: req.user!.id,
      kind: req.body.kind as MediaKind,
      source: req.body.source as MediaSource,
      photoBuffer: req.file.buffer,
    });
    res.status(201).json(result);
  } catch (error) {
    next(error);
  }
}

export async function reorderMedia(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const place = await placesService.reorderGallery(req.params.id, req.user!.id, req.body.galleryIds as string[]);
    res.status(200).json({ place });
  } catch (error) {
    next(error);
  }
}

export async function removeMedia(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const place = await placesService.deletePlaceMedia(req.params.id, req.params.mediaId, req.user!.id);
    res.status(200).json({ place });
  } catch (error) {
    next(error);
  }
}

export async function stings(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const place = await placesService.getPlace(req.params.id, req.user!.id);
    if (place.hidden) {
      res.status(200).json({ stings: [], nextCursor: null });
      return;
    }

    const includePartner = parseBool(req.query.includePartner);
    const limit = Math.min(Math.max(Number(req.query.limit ?? 20), 1), 50);
    const now = new Date();
    const pipeline: mongoose.PipelineStage[] = [
      {
        $match: {
          placeId: new mongoose.Types.ObjectId(req.params.id),
          expiresAt: { $gt: now },
          mediaPurgedAt: null,
        },
      },
      {
        $lookup: {
          from: 'users',
          localField: 'authorId',
          foreignField: '_id',
          as: 'author',
        },
      },
      { $unwind: '$author' },
    ];

    if (!includePartner) {
      pipeline.push({ $match: { 'author.accountType': 'personal' } });
    }

    if (req.query.cursor) {
      const cursorSting = await Sting.findOne({ _id: String(req.query.cursor), placeId: req.params.id });
      if (!cursorSting) {
        throw new AppError(422, 'INVALID_CURSOR', 'Некорректный cursor');
      }
      pipeline.push({
        $match: {
          $or: [
            { createdAt: { $lt: cursorSting.createdAt } },
            { createdAt: cursorSting.createdAt, _id: { $lt: cursorSting._id } },
          ],
        },
      });
    }

    pipeline.push({ $sort: { createdAt: -1, _id: -1 } }, { $limit: limit + 1 }, { $project: { _id: 1 } });

    const rows = await Sting.aggregate<{ _id: mongoose.Types.ObjectId }>(pipeline);
    const page = rows.slice(0, limit);
    const ids = page.map((row) => String(row._id));
    const docs = await Sting.find({ _id: { $in: ids } });
    const byId = new Map(docs.map((sting) => [sting.id, sting]));
    const ordered = ids
      .map((id) => byId.get(id))
      .filter((sting): sting is NonNullable<typeof sting> => Boolean(sting));
    const nextCursor = rows.length > limit ? (ids[ids.length - 1] ?? null) : null;
    res.status(200).json({ stings: await mapPublicStings(ordered, new Set()), nextCursor });
  } catch (error) {
    next(error);
  }
}

export async function report(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const result = await reportsService.reportPlace({
      placeId: req.params.id,
      reporterId: req.user!.id,
      reason: req.body.reason as PlaceReportReason,
      comment: typeof req.body.comment === 'string' ? req.body.comment : null,
      mediaId: req.params.mediaId,
    });
    res.status(201).json(result);
  } catch (error) {
    next(error);
  }
}

export async function adminCreate(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const place = await placesService.createOfficialPlace({
      ownerId: req.body.ownerId,
      name: String(req.body.name).trim(),
      category: req.body.category as PlaceCategory,
      formatted: String(req.body.address.formatted).trim(),
      city: req.body.address.city ? String(req.body.address.city).trim() : null,
      country: req.body.address.country ? String(req.body.address.country).trim() : null,
      lat: Number(req.body.center.lat),
      lng: Number(req.body.center.lng),
      phone: req.body.phone ? normalizePhone(req.body.phone) : null,
      description: req.body.description ? String(req.body.description).trim() : null,
    });
    res.status(201).json({ place: await placesService.getPlace(place.id, req.user!.id) });
  } catch (error) {
    next(error);
  }
}

export async function adminSuspend(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    await placesService.suspendPlace(req.params.id, String(req.body.reason));
    res.status(200).json({ status: 'suspended' });
  } catch (error) {
    next(error);
  }
}

export async function adminUnsuspend(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    await placesService.unsuspendPlace(req.params.id);
    res.status(200).json({ status: 'paused' });
  } catch (error) {
    next(error);
  }
}

export async function adminTransfer(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    await placesService.transferPlace(req.params.id, req.body.newOwnerId);
    res.status(200).json({ ownerId: req.body.newOwnerId });
  } catch (error) {
    next(error);
  }
}

export async function adminMoveCenter(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    await placesService.movePlaceCenter(req.params.id, Number(req.body.lat), Number(req.body.lng));
    res.status(200).json({ lat: Number(req.body.lat), lng: Number(req.body.lng) });
  } catch (error) {
    next(error);
  }
}

export async function adminReviewMedia(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const rejectCode = (req.body.rejectCode ?? 'other') as MediaRejectCode;
    await placesService.rejectPlaceMedia(req.params.id, rejectCode);
    res.status(200).json({ moderation: 'rejected', rejectCode });
  } catch (error) {
    next(error);
  }
}

export async function adminResolveReport(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    await reportsService.resolveReport(req.params.id, req.body.decision);
    res.status(200).json({ status: req.body.decision === 'accept' ? 'accepted' : 'dismissed' });
  } catch (error) {
    next(error);
  }
}
