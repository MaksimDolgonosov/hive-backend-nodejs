import { NextFunction, Request, Response } from 'express';
import multer from 'multer';
import { AppError } from '../utils/AppError';

const JPEG_MIMETYPE = 'image/jpeg';

function createJpegUpload(fieldName: string, maxFileSize: number) {
  return multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: maxFileSize },
    fileFilter: (_req, file, cb) => {
      if (file.mimetype === JPEG_MIMETYPE) {
        cb(null, true);
        return;
      }
      cb(new AppError(422, 'VALIDATION_ERROR', 'Допустим только JPEG'));
    },
  }).single(fieldName);
}

const uploadStingPhoto = createJpegUpload('photo', 10 * 1024 * 1024);
const uploadAvatarPhoto = createJpegUpload('avatar', 2 * 1024 * 1024);

function runUpload(
  uploadFn: (req: Request, res: Response, cb: (err: unknown) => void) => void,
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  uploadFn(req, res, (err) => {
    if (err) {
      next(err);
      return;
    }
    next();
  });
}

export function handleStingPhotoUpload(req: Request, res: Response, next: NextFunction): void {
  runUpload(uploadStingPhoto, req, res, next);
}

export function handleAvatarUpload(req: Request, res: Response, next: NextFunction): void {
  runUpload(uploadAvatarPhoto, req, res, next);
}
