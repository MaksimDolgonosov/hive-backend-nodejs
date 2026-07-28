import { NextFunction, Request, Response } from 'express';
import multer from 'multer';
import { AppError } from '../utils/AppError';

function errorMiddleware(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void {
  if (err instanceof AppError) {
    res.status(err.statusCode).json({
      error: { code: err.code, message: err.message, details: err.details },
    });
    return;
  }

  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      res.status(422).json({
        error: { code: 'VALIDATION_ERROR', message: 'Файл слишком большой (максимум 10 МБ)' },
      });
      return;
    }
    res.status(422).json({
      error: { code: 'VALIDATION_ERROR', message: err.message },
    });
    return;
  }

  if (err instanceof Error && err.name === 'ValidationError') {
    res.status(422).json({
      error: { code: 'VALIDATION_ERROR', message: err.message },
    });
    return;
  }

  if (
    typeof err === 'object' &&
    err !== null &&
    'code' in err &&
    (err as { code: unknown }).code === 11000
  ) {
    res.status(409).json({
      error: { code: 'CONFLICT', message: 'Запись с такими данными уже существует' },
    });
    return;
  }

  console.error(err);
  res.status(500).json({
    error: { code: 'INTERNAL_ERROR', message: 'Внутренняя ошибка сервера' },
  });
}

export default errorMiddleware;
