import { NextFunction, Request, Response } from 'express';
import * as devicesService from '../services/devices.service';

export async function getSettings(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const settings = await devicesService.getNotificationSettings(req.user!.id);
    res.status(200).json({ settings });
  } catch (err) {
    next(err);
  }
}

export async function patchSettings(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const settings = await devicesService.patchNotificationSettings(req.user!.id, req.body);
    res.status(200).json({ settings });
  } catch (err) {
    next(err);
  }
}
