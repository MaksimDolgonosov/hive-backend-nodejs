import sharp from 'sharp';
import env from '../config/env';
import { AppError } from '../utils/AppError';

export interface ProcessedPhoto {
  original: Buffer;
  thumbnail: Buffer;
}

export async function processStingPhoto(buffer: Buffer): Promise<ProcessedPhoto> {
  try {
    // Не вызываем rotate(): клиент уже отдаёт правильно ориентированные пиксели с Orientation=1.
    const original = await sharp(buffer).jpeg({ quality: 90 }).toBuffer();
    const thumbnail = await sharp(buffer)
      .resize({ width: env.thumbnailWidth, withoutEnlargement: true })
      .jpeg({ quality: env.thumbnailQuality })
      .toBuffer();

    return { original, thumbnail };
  } catch {
    throw new AppError(422, 'VALIDATION_ERROR', 'Не удалось обработать изображение');
  }
}

export async function assertPlacePhotoSize(buffer: Buffer): Promise<{ width: number; height: number }> {
  try {
    const metadata = await sharp(buffer).metadata();
    const width = metadata.width ?? 0;
    const height = metadata.height ?? 0;
    if (Math.min(width, height) < env.placeMediaMinShortSide) {
      throw new AppError(422, 'MEDIA_TOO_SMALL', 'Фото слишком маленькое');
    }
    return { width, height };
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }
    throw new AppError(422, 'VALIDATION_ERROR', 'Не удалось обработать изображение');
  }
}

export async function processPlacePhoto(buffer: Buffer): Promise<ProcessedPhoto> {
  try {
    const original = await sharp(buffer).jpeg({ quality: 90 }).toBuffer();
    const thumbnail = await sharp(buffer)
      .resize({ width: env.thumbnailWidth, withoutEnlargement: true })
      .jpeg({ quality: env.thumbnailQuality })
      .toBuffer();
    return { original, thumbnail };
  } catch {
    throw new AppError(422, 'VALIDATION_ERROR', 'Не удалось обработать изображение');
  }
}

export async function processAvatar(buffer: Buffer): Promise<Buffer> {
  return sharp(buffer)
    .rotate()
    .resize({ width: env.avatarSize, height: env.avatarSize, fit: 'cover' })
    .jpeg({ quality: env.avatarQuality })
    .toBuffer();
}
