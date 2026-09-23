import { NextFunction, Request, Response } from 'express';
import * as shareService from '../services/share.service';

export async function sting(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const result = await shareService.renderStingSharePage(req.params.id);
    res.status(result.status).type('html').send(result.html);
  } catch (err) {
    next(err);
  }
}

export async function place(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const result = await shareService.renderPlaceSharePage(req.params.id);
    res.status(result.status).type('html').send(result.html);
  } catch (err) {
    next(err);
  }
}
