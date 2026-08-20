import { NextFunction, Request, Response } from 'express';
import * as stingsService from '../services/stings.service';
import { AppError } from '../utils/AppError';

export async function nearby(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const result = await stingsService.findNearby(
      {
        swLat: Number(req.query.swLat),
        swLng: Number(req.query.swLng),
        neLat: Number(req.query.neLat),
        neLng: Number(req.query.neLng),
      },
      req.user!.id,
    );
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
}

export async function create(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.file?.buffer) {
      throw new AppError(422, 'VALIDATION_ERROR', 'Поле photo обязательно');
    }

    const idempotencyKey = req.header('Idempotency-Key') ?? undefined;

    const rawComment = req.body.comment;
    const comment =
      typeof rawComment === 'string' && rawComment.trim().length > 0 ? rawComment.trim() : null;

    const result = await stingsService.createSting({
      authorId: req.user!.id,
      lat: Number(req.body.lat),
      lng: Number(req.body.lng),
      accuracyM: Number(req.body.accuracy),
      capturedAt: new Date(req.body.capturedAt),
      photoBuffer: req.file.buffer,
      comment,
      idempotencyKey,
    });

    res.status(201).json(result);
  } catch (err) {
    next(err);
  }
}

export async function getById(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const result = await stingsService.getStingById(req.params.id, req.user!.id);
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
}

export async function remove(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    await stingsService.deleteSting(req.params.id, req.user!.id);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
}

export async function react(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const result = await stingsService.toggleReaction(req.params.id, req.user!.id, req.body.type);
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
}
