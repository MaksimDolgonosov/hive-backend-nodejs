import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import multer from 'multer';
import env from '../config/env';
import { AppError } from '../utils/AppError';

if (!fs.existsSync(env.uploadDir)) {
  fs.mkdirSync(env.uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, env.uploadDir);
  },
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname) || '.jpg';
    cb(null, `${crypto.randomUUID()}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype === 'image/jpeg') {
      cb(null, true);
      return;
    }
    cb(new AppError(422, 'VALIDATION_ERROR', 'Допустим только JPEG'));
  },
});

import { NextFunction, Request, Response } from 'express';

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
