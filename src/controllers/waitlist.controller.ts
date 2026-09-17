import { NextFunction, Request, Response } from 'express';
import * as waitlistService from '../services/waitlist.service';
import { AppError } from '../utils/AppError';

export async function submit(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const deviceId =
      typeof req.body.deviceId === 'string'
        ? req.body.deviceId
        : typeof req.headers['x-device-id'] === 'string'
          ? req.headers['x-device-id']
          : '';
    if (!deviceId) {
      throw new AppError(422, 'VALIDATION_ERROR', 'deviceId обязателен');
    }

    const result = await waitlistService.submitWaitlist({
      lat: Number(req.body.lat),
      lng: Number(req.body.lng),
      email: req.body.email,
      deviceId,
    });
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
}
