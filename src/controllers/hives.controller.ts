import { NextFunction, Request, Response } from 'express';
import * as hivesService from '../services/hives.service';

export async function getById(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const result = await hivesService.getHiveById(req.params.id);
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
}

export async function getStings(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const limit = req.query.limit != null ? Number(req.query.limit) : undefined;
    const result = await hivesService.getHiveStings(
      req.params.id,
      typeof req.query.cursor === 'string' ? req.query.cursor : undefined,
      limit,
    );
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
}
