import { NextFunction, Request, Response } from 'express';
import { AppError } from '../utils/AppError';

function requireAdmin(req: Request, _res: Response, next: NextFunction): void {
  if (!req.user || req.user.role !== 'admin') {
    next(new AppError(403, 'FORBIDDEN', 'Недостаточно прав'));
    return;
  }
  next();
}

export default requireAdmin;
