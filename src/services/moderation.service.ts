import * as tf from '@tensorflow/tfjs-node';
import * as nsfwjs from 'nsfwjs';

import env from '../config/env';
import { AppError } from '../utils/AppError';

type NsfwModel = Awaited<ReturnType<typeof nsfwjs.load>>;

let modelPromise: Promise<NsfwModel | null> | null = null;

async function loadModel(): Promise<NsfwModel | null> {
  if (!env.moderationEnabled) {
    return null;
  }

  try {
    return await nsfwjs.load();
  } catch (error) {
    console.error('[moderation] Failed to load NSFWJS model:', error);
    return null;
  }
}

export async function initModerationModel(): Promise<void> {
  if (!env.moderationEnabled) {
    console.log('[moderation] Disabled (MODERATION_ENABLED=false)');
    return;
  }

  modelPromise = loadModel();
  const model = await modelPromise;

  if (model) {
    console.log('[moderation] NSFWJS model loaded');
    return;
  }

  console.warn('[moderation] NSFWJS model is unavailable; photo uploads will be rejected');
}

async function getModel(): Promise<NsfwModel | null> {
  if (!env.moderationEnabled) {
    return null;
  }

  if (!modelPromise) {
    modelPromise = loadModel();
  }

  return modelPromise;
}

function getPredictionScore(
  predictions: Array<{ className: string; probability: number }>,
  className: string,
): number {
  return predictions.find((item) => item.className === className)?.probability ?? 0;
}

export async function validatePhotoModeration(photoBuffer: Buffer): Promise<void> {
  if (!env.moderationEnabled) {
    return;
  }

  const model = await getModel();
  if (!model) {
    throw new AppError(503, 'MODERATION_UNAVAILABLE', 'Сервис проверки фото временно недоступен');
  }

  let image: tf.Tensor3D | null = null;

  try {
    image = tf.node.decodeImage(photoBuffer, 3) as tf.Tensor3D;
    const predictions = await model.classify(image);

    const porn = getPredictionScore(predictions, 'Porn');
    const hentai = getPredictionScore(predictions, 'Hentai');
    const sexy = getPredictionScore(predictions, 'Sexy');

    const isBlocked =
      porn >= env.moderationPornThreshold ||
      hentai >= env.moderationHentaiThreshold ||
      sexy >= env.moderationSexyThreshold;

    if (isBlocked) {
      throw new AppError(
        422,
        'CONTENT_MODERATION_FAILED',
        'Фото не прошло проверку безопасности',
      );
    }
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }

    console.error('[moderation] Classification failed:', error);
    throw new AppError(503, 'MODERATION_UNAVAILABLE', 'Сервис проверки фото временно недоступен');
  } finally {
    image?.dispose();
  }
}
