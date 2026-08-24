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

type NsfwClass = 'Drawing' | 'Hentai' | 'Neutral' | 'Porn' | 'Sexy';

type NsfwScores = Record<NsfwClass, number>;

function getPredictionScore(
  predictions: Array<{ className: string; probability: number }>,
  className: string,
): number {
  return predictions.find((item) => item.className === className)?.probability ?? 0;
}

function parseNsfwScores(
  predictions: Array<{ className: string; probability: number }>,
): NsfwScores {
  return {
    Drawing: getPredictionScore(predictions, 'Drawing'),
    Hentai: getPredictionScore(predictions, 'Hentai'),
    Neutral: getPredictionScore(predictions, 'Neutral'),
    Porn: getPredictionScore(predictions, 'Porn'),
    Sexy: getPredictionScore(predictions, 'Sexy'),
  };
}

function toPercent(value: number): number {
  return Math.round(value * 1000) / 10;
}

function toPercentRecord(scores: NsfwScores): Record<NsfwClass, number> {
  return {
    Drawing: toPercent(scores.Drawing),
    Hentai: toPercent(scores.Hentai),
    Neutral: toPercent(scores.Neutral),
    Porn: toPercent(scores.Porn),
    Sexy: toPercent(scores.Sexy),
  };
}

function getRiskScore(scores: NsfwScores): number {
  return Math.max(scores.Porn, scores.Hentai, scores.Sexy);
}

function getBlockedCategory(scores: NsfwScores): NsfwClass | null {
  if (scores.Porn >= env.moderationPornThreshold) {
    return 'Porn';
  }
  if (scores.Hentai >= env.moderationHentaiThreshold) {
    return 'Hentai';
  }
  if (scores.Sexy >= env.moderationSexyThreshold) {
    return 'Sexy';
  }
  return null;
}

function logModerationResult(scores: NsfwScores, passed: boolean): void {
  const riskScore = getRiskScore(scores);
  const passScore = 1 - riskScore;
  const blockedBy = passed ? null : getBlockedCategory(scores);

  console.info('[moderation] photo check', {
    passed,
    passScore: Number(passScore.toFixed(4)),
    passScorePct: toPercent(passScore),
    riskScore: Number(riskScore.toFixed(4)),
    riskScorePct: toPercent(riskScore),
    categoriesPct: toPercentRecord(scores),
    thresholdsPct: {
      porn: toPercent(env.moderationPornThreshold),
      hentai: toPercent(env.moderationHentaiThreshold),
      sexy: toPercent(env.moderationSexyThreshold),
    },
    blockedBy,
  });
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
    const scores = parseNsfwScores(predictions);
    const blockedBy = getBlockedCategory(scores);

    logModerationResult(scores, blockedBy === null);

    if (blockedBy !== null) {
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
