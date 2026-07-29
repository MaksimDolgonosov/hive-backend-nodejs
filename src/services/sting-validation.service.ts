import exifr from 'exifr';
import env from '../config/env';
import { AppError } from '../utils/AppError';
import { haversineDistanceM } from '../utils/geo';

export type StingValidationReason =
  | 'CAPTURED_AT_MISMATCH'
  | 'SUSPICIOUS_GPS'
  | 'EXIF_MISMATCH'
  | 'EXIF_GPS_MISMATCH';

export interface ValidateStingInput {
  lat: number;
  lng: number;
  accuracyM: number;
  capturedAt: Date;
  photoBuffer: Buffer;
  receivedAt?: Date;
}

interface ParsedExif {
  latitude?: number;
  longitude?: number;
  capturedAt?: Date;
}

async function parseExif(buffer: Buffer): Promise<ParsedExif | null> {
  try {
    const data = await exifr.parse(buffer, {
      gps: true,
      reviveValues: true,
      pick: ['latitude', 'longitude', 'DateTimeOriginal', 'CreateDate'],
    });

    if (!data || typeof data !== 'object') {
      return null;
    }

    const record = data as Record<string, unknown>;
    const capturedAt =
      record.DateTimeOriginal instanceof Date
        ? record.DateTimeOriginal
        : record.CreateDate instanceof Date
          ? record.CreateDate
          : undefined;

    return {
      latitude: typeof record.latitude === 'number' ? record.latitude : undefined,
      longitude: typeof record.longitude === 'number' ? record.longitude : undefined,
      capturedAt,
    };
  } catch {
    return null;
  }
}

function validateCapturedAtWindow(capturedAt: Date, receivedAt: Date): void {
  const deltaMs = Math.abs(receivedAt.getTime() - capturedAt.getTime());
  if (deltaMs > env.stingCapturedAtToleranceMs) {
    throw new AppError(422, 'STING_VALIDATION_FAILED', 'Фото не прошло проверку подлинности', {
      reason: 'CAPTURED_AT_MISMATCH' satisfies StingValidationReason,
    });
  }
}

function validateGps(lat: number, lng: number, accuracyM: number): void {
  if (lat === 0 && lng === 0) {
    throw new AppError(422, 'STING_VALIDATION_FAILED', 'Фото не прошло проверку подлинности', {
      reason: 'SUSPICIOUS_GPS' satisfies StingValidationReason,
    });
  }

  if (accuracyM < env.stingMinGpsAccuracyM) {
    throw new AppError(422, 'STING_VALIDATION_FAILED', 'Фото не прошло проверку подлинности', {
      reason: 'SUSPICIOUS_GPS' satisfies StingValidationReason,
    });
  }

  if (accuracyM > env.stingMaxGpsAccuracyM) {
    throw new AppError(422, 'STING_VALIDATION_FAILED', 'Фото не прошло проверку подлинности', {
      reason: 'SUSPICIOUS_GPS' satisfies StingValidationReason,
    });
  }
}

function validateExif(
  exif: ParsedExif,
  lat: number,
  lng: number,
  capturedAt: Date,
  accuracyM: number,
): void {
  if (exif.capturedAt) {
    const deltaMs = Math.abs(exif.capturedAt.getTime() - capturedAt.getTime());
    if (deltaMs > env.stingCapturedAtToleranceMs) {
      throw new AppError(422, 'STING_VALIDATION_FAILED', 'Фото не прошло проверку подлинности', {
        reason: 'EXIF_MISMATCH' satisfies StingValidationReason,
      });
    }
  }

  if (exif.latitude != null && exif.longitude != null) {
    const distanceM = haversineDistanceM(
      { lat, lng },
      { lat: exif.latitude, lng: exif.longitude },
    );
    const toleranceM = Math.max(env.stingExifGpsToleranceM, accuracyM);

    if (distanceM > toleranceM) {
      throw new AppError(422, 'STING_VALIDATION_FAILED', 'Координаты фото не совпадают с метаданными', {
        reason: 'EXIF_GPS_MISMATCH' satisfies StingValidationReason,
      });
    }
  }
}

export async function validateStingSubmission(input: ValidateStingInput): Promise<void> {
  const receivedAt = input.receivedAt ?? new Date();

  validateGps(input.lat, input.lng, input.accuracyM);
  validateCapturedAtWindow(input.capturedAt, receivedAt);

  const exif = await parseExif(input.photoBuffer);
  if (exif) {
    validateExif(exif, input.lat, input.lng, input.capturedAt, input.accuracyM);
  }
}
