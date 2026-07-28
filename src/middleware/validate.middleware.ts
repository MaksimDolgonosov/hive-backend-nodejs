import { NextFunction, Request, Response } from 'express';
import { validationResult } from 'express-validator';
import { AppError } from '../utils/AppError';

function handleValidation(req: Request, _res: Response, next: NextFunction): void {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    next(
      new AppError(422, 'VALIDATION_ERROR', 'Ошибка валидации входных данных', {
        fields: errors.array(),
      }),
    );
    return;
  }
  next();
}

export default handleValidation;
