import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { DeleteObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import env, { isR2Configured } from '../config/env';
import { UploadedImageUrls } from '../types/sting';
import { AppError } from '../utils/AppError';

function buildObjectKey(isThumbnail: boolean): string {
  const id = crypto.randomUUID();
  return isThumbnail ? `stings/${id}_thumb.jpg` : `stings/${id}.jpg`;
}

function buildLocalUrl(filename: string): string {
  return `${env.baseUrl}/uploads/${filename}`;
}

function buildR2Url(key: string): string {
  return `${env.r2PublicUrl.replace(/\/$/, '')}/${key}`;
}

let r2Client: S3Client | null = null;

function getR2Client(): S3Client {
  if (!r2Client) {
    r2Client = new S3Client({
      region: 'auto',
      endpoint: `https://${env.r2AccountId}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: env.r2AccessKeyId,
        secretAccessKey: env.r2SecretAccessKey,
      },
    });
  }
  return r2Client;
}

async function uploadToR2(key: string, buffer: Buffer): Promise<string> {
  await getR2Client().send(
    new PutObjectCommand({
      Bucket: env.r2BucketName,
      Key: key,
      Body: buffer,
      ContentType: 'image/jpeg',
    }),
  );
  return buildR2Url(key);
}

async function uploadToLocal(filename: string, buffer: Buffer): Promise<string> {
  if (!fs.existsSync(env.uploadDir)) {
    fs.mkdirSync(env.uploadDir, { recursive: true });
  }
  await fs.promises.writeFile(path.join(env.uploadDir, filename), buffer);
  return buildLocalUrl(filename);
}

export async function uploadStingImages(
  originalBuffer: Buffer,
  thumbnailBuffer: Buffer,
): Promise<UploadedImageUrls> {
  const useR2 = env.storageDriver === 'r2';

  if (useR2 && !isR2Configured()) {
    throw new AppError(
      500,
      'STORAGE_NOT_CONFIGURED',
      'R2 storage выбран, но переменные окружения не заданы',
    );
  }

  if (useR2) {
    const imageKey = buildObjectKey(false);
    const thumbnailKey = buildObjectKey(true);
    const [imageUrl, thumbnailUrl] = await Promise.all([
      uploadToR2(imageKey, originalBuffer),
      uploadToR2(thumbnailKey, thumbnailBuffer),
    ]);
    return { imageUrl, thumbnailUrl };
  }

  const id = crypto.randomUUID();
  const [imageUrl, thumbnailUrl] = await Promise.all([
    uploadToLocal(`${id}.jpg`, originalBuffer),
    uploadToLocal(`${id}_thumb.jpg`, thumbnailBuffer),
  ]);
  return { imageUrl, thumbnailUrl };
}

function buildAvatarKey(userId: string): string {
  return `avatars/${userId}.jpg`;
}

function buildLocalAvatarFilename(userId: string): string {
  return `avatars/${userId}.jpg`;
}

export async function uploadAvatarImage(userId: string, buffer: Buffer): Promise<string> {
  const useR2 = env.storageDriver === 'r2';

  if (useR2 && !isR2Configured()) {
    throw new AppError(
      500,
      'STORAGE_NOT_CONFIGURED',
      'R2 storage выбран, но переменные окружения не заданы',
    );
  }

  if (useR2) {
    return uploadToR2(buildAvatarKey(userId), buffer);
  }

  return uploadToLocal(buildLocalAvatarFilename(userId), buffer);
}

async function deleteFromR2(key: string): Promise<void> {
  await getR2Client().send(
    new DeleteObjectCommand({
      Bucket: env.r2BucketName,
      Key: key,
    }),
  );
}

async function deleteFromLocal(filename: string): Promise<void> {
  const filePath = path.join(env.uploadDir, filename);
  if (fs.existsSync(filePath)) {
    await fs.promises.unlink(filePath);
  }
}

export async function deleteAvatarImage(userId: string): Promise<void> {
  const useR2 = env.storageDriver === 'r2';

  if (useR2) {
    if (!isR2Configured()) {
      return;
    }
    await deleteFromR2(buildAvatarKey(userId));
    return;
  }

  await deleteFromLocal(buildLocalAvatarFilename(userId));
}
