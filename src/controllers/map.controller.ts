import { NextFunction, Request, Response } from 'express';
import * as overviewService from '../services/overview.service';

export async function overview(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const result = await overviewService.getMapOverview(
      {
        swLat: Number(req.query.swLat),
        swLng: Number(req.query.swLng),
        neLat: Number(req.query.neLat),
        neLng: Number(req.query.neLng),
      },
      Number(req.query.zoom),
    );
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
}
