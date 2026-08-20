import { NextFunction, Request, Response } from 'express';
import * as profileService from '../services/profile.service';

export async function getById(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const result = await profileService.getPublicUserProfile(req.params.id);
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
}
