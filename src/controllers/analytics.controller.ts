import { NextFunction, Request, Response } from 'express';
import * as analyticsService from '../services/analytics.service';

export async function ingest(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const deviceId =
      typeof req.body.deviceId === 'string'
        ? req.body.deviceId
        : typeof req.headers['x-device-id'] === 'string'
          ? req.headers['x-device-id']
          : '';

    await analyticsService.ingestEvents({
      userId: req.user?.id,
      deviceId,
      events: req.body.events,
      rawSize: Number(req.headers['content-length'] ?? 0),
    });
    res.status(204).send();
  } catch (err) {
    next(err);
  }
}
