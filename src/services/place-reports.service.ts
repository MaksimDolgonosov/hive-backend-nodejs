import { Types } from 'mongoose';

import env from '../config/env';
import PlaceReport, { PlaceReportReason } from '../models/PlaceReport';
import Place from '../models/Place';
import PlaceMedia from '../models/PlaceMedia';
import { AppError } from '../utils/AppError';
import { autoPauseForReports } from './places.service';

const REPORT_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;

async function assertCanReport(placeId: string, reporterId: string): Promise<void> {
  const place = await Place.findById(placeId).select('ownerId');
  if (!place) {
    throw new AppError(404, 'NOT_FOUND', 'Место не найдено');
  }
  if (String(place.ownerId) === reporterId) {
    throw new AppError(422, 'VALIDATION_ERROR', 'Нельзя пожаловаться на своё место');
  }
}

export async function reportPlace(input: {
  placeId: string;
  reporterId: string;
  reason: PlaceReportReason;
  comment?: string | null;
  mediaId?: string | null;
}): Promise<{ id: string }> {
  await assertCanReport(input.placeId, input.reporterId);

  if (input.mediaId) {
    const media = await PlaceMedia.findOne({ _id: input.mediaId, placeId: input.placeId });
    if (!media) {
      throw new AppError(404, 'NOT_FOUND', 'Фото не найдено');
    }
  }

  const report = await PlaceReport.create({
    placeId: input.placeId,
    mediaId: input.mediaId ?? null,
    reporterId: input.reporterId,
    reason: input.reason,
    comment: input.comment?.trim() ? input.comment.trim() : null,
    status: 'pending',
  });

  return { id: report.id };
}

export async function resolveReport(reportId: string, decision: 'accept' | 'dismiss'): Promise<void> {
  const report = await PlaceReport.findById(reportId);
  if (!report) {
    throw new AppError(404, 'NOT_FOUND', 'Жалоба не найдена');
  }
  if (report.status !== 'pending') {
    throw new AppError(422, 'VALIDATION_ERROR', 'Жалоба уже рассмотрена');
  }

  report.status = decision === 'accept' ? 'accepted' : 'dismissed';
  await report.save();

  if (decision !== 'accept') {
    return;
  }

  const since = new Date(Date.now() - REPORT_WINDOW_MS);
  const accepted = await PlaceReport.countDocuments({
    placeId: report.placeId,
    status: 'accepted',
    updatedAt: { $gte: since },
  });

  if (accepted >= env.placeReportPauseThreshold) {
    await autoPauseForReports(report.placeId as Types.ObjectId);
  }
}
