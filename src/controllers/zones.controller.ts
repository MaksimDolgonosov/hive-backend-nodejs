import { NextFunction, Request, Response } from 'express';
import * as zonesService from '../services/zones.service';

export async function current(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const zone = await zonesService.getCurrentZone(Number(req.query.lat), Number(req.query.lng));
    res.status(200).json({ zone });
  } catch (err) {
    next(err);
  }
}
