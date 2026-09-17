import { NextFunction, Request, Response } from 'express';
import * as devicesService from '../services/devices.service';

export async function register(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    await devicesService.upsertDevice({
      userId: req.user!.id,
      expoPushToken: req.body.expoPushToken,
      platform: req.body.platform,
      deviceId: req.body.deviceId,
      locale: req.body.locale === 'en' ? 'en' : 'ru',
      timezone: req.body.timezone,
    });
    res.status(204).send();
  } catch (err) {
    next(err);
  }
}

export async function remove(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    await devicesService.deleteDevice(req.user!.id, req.params.deviceId);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
}
