import { NextFunction, Request, Response } from 'express';
import * as campaignsService from '../services/campaigns.service';

export async function active(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const campaigns = await campaignsService.findActiveCampaigns(
      Number(req.query.lat),
      Number(req.query.lng),
    );
    res.status(200).json({ campaigns });
  } catch (err) {
    next(err);
  }
}
