import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { DeleteObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import env, { isR2Configured } from '../config/env';
import { UploadedImageUrls } from '../types/sting';
import { AppError } from '../utils/AppError';

type ObjectPrefix = 'stings' | 'places' | 'onsite';

function buildObjectKey(prefix: ObjectPrefix, isThumbnail: boolean): string {
  const id = crypto.randomUUID();
  return isThumbnail ? `${prefix}/${id}_thumb.jpg` : `${prefix}/${id}.jpg`;
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
  const filePath = path.join(env.uploadDir, filename);
  await fs.promises.mkdir(path.dirname(filePath), { recursive: true });
  await fs.promises.writeFile(filePath, buffer);
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
    const imageKey = buildObjectKey('stings', false);
    const thumbnailKey = buildObjectKey('stings', true);
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

async function deleteFromLocal(relativePath: string): Promise<void> {
  const filePath = path.join(env.uploadDir, relativePath);
  if (fs.existsSync(filePath)) {
    await fs.promises.unlink(filePath);
  }
}

const STORED_PREFIX = /(?:stings|places|onsite)\/[^?#]+/;

function parseStoredObjectKey(url: string): string | null {
  if (!url) {
    return null;
  }

  const publicBase = env.r2PublicUrl.replace(/\/$/, '');
  if (publicBase && url.startsWith(`${publicBase}/`)) {
    return url.slice(publicBase.length + 1);
  }

  try {
    const pathname = decodeURIComponent(new URL(url).pathname).replace(/^\/+/, '');
    const stored = pathname.match(STORED_PREFIX);
    if (stored) {
      return stored[0];
    }
  } catch {
    // ignore invalid URLs, try regex fallback below
  }

  const match = url.match(STORED_PREFIX);
  return match?.[0] ?? null;
}

function parseLocalRelativePath(url: string): string | null {
  const marker = '/uploads/';
  const markerIndex = url.indexOf(marker);
  if (markerIndex === -1) {
    return null;
  }

  const relativePath = url.slice(markerIndex + marker.length);
  if (!relativePath || relativePath.includes('..')) {
    return null;
  }

  return relativePath;
}

async function uploadImagePair(
  prefix: ObjectPrefix,
  originalBuffer: Buffer,
  thumbnailBuffer: Buffer | null,
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
    const imageKey = buildObjectKey(prefix, false);
    const imageUrl = await uploadToR2(imageKey, originalBuffer);
    const thumbnailUrl = thumbnailBuffer
      ? await uploadToR2(buildObjectKey(prefix, true), thumbnailBuffer)
      : imageUrl;
    return { imageUrl, thumbnailUrl };
  }

  const id = crypto.randomUUID();
  const imageUrl = await uploadToLocal(`${prefix}/${id}.jpg`, originalBuffer);
  const thumbnailUrl = thumbnailBuffer
    ? await uploadToLocal(`${prefix}/${id}_thumb.jpg`, thumbnailBuffer)
    : imageUrl;
  return { imageUrl, thumbnailUrl };
}

export async function uploadPlaceImages(
  originalBuffer: Buffer,
  thumbnailBuffer: Buffer,
): Promise<UploadedImageUrls> {
  return uploadImagePair('places', originalBuffer, thumbnailBuffer);
}

const PRIVATE_SCHEME = 'private://';

function privateRoot(): string {
  return path.join(path.dirname(env.uploadDir), 'private-uploads');
}

export async function uploadOnsiteProof(buffer: Buffer): Promise<string> {
  if (env.storageDriver === 'r2') {
    const uploaded = await uploadImagePair('onsite', buffer, null);
    return uploaded.imageUrl;
  }

  const relative = `onsite/${crypto.randomUUID()}.jpg`;
  const filePath = path.join(privateRoot(), relative);
  await fs.promises.mkdir(path.dirname(filePath), { recursive: true });
  await fs.promises.writeFile(filePath, buffer);
  return `${PRIVATE_SCHEME}${relative}`;
}

async function deletePrivateFile(url: string): Promise<void> {
  const relative = url.slice(PRIVATE_SCHEME.length);
  if (!relative || relative.includes('..')) {
    return;
  }
  const filePath = path.join(privateRoot(), relative);
  if (fs.existsSync(filePath)) {
    await fs.promises.unlink(filePath);
  }
}

async function deleteStoredImageUrl(url: string): Promise<void> {
  if (url.startsWith(PRIVATE_SCHEME)) {
    try {
      await deletePrivateFile(url);
    } catch (error) {
      console.warn(`[storage] Failed to delete private file:`, error);
    }
    return;
  }

  const useR2 = env.storageDriver === 'r2';

  if (useR2) {
    if (!isR2Configured()) {
      console.warn('[storage] R2 selected but env is incomplete — sting file was not deleted from bucket');
      return;
    }

    const key = parseStoredObjectKey(url);
    if (!key) {
      console.warn(`[storage] Could not resolve R2 key for URL: ${url}`);
      return;
    }

    try {
      await deleteFromR2(key);
    } catch (error) {
      console.warn(`[storage] Failed to delete R2 object "${key}":`, error);
    }

    return;
  }

  const relativePath = parseLocalRelativePath(url);
  if (!relativePath) {
    return;
  }

  try {
    await deleteFromLocal(relativePath);
  } catch (error) {
    console.warn(`[storage] Failed to delete local file "${relativePath}":`, error);
  }
}

export async function deleteStingImages(imageUrl: string, thumbnailUrl: string): Promise<void> {
  await Promise.all([deleteStoredImageUrl(imageUrl), deleteStoredImageUrl(thumbnailUrl)]);
}

export async function deleteStoredImage(url: string): Promise<void> {
  await deleteStoredImageUrl(url);
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
