import { NextFunction, Request, Response } from 'express';
import multer from 'multer';
import { AppError } from '../utils/AppError';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype === 'image/jpeg') {
      cb(null, true);
      return;
    }
    cb(new AppError(422, 'VALIDATION_ERROR', 'Допустим только JPEG'));
  },
});

export const uploadStingPhoto = upload.single('photo');

export function handleStingPhotoUpload(req: Request, res: Response, next: NextFunction): void {
  uploadStingPhoto(req, res, (err) => {
    if (err) {
      next(err);
      return;
    }
    next();
  });
}
