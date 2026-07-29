import dotenv from 'dotenv';
import path from 'path';

dotenv.config();

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Отсутствует обязательная переменная окружения: ${name}`);
  }
  return value;
}

const port = Number(process.env.PORT) || 3000;
const storageDriver = process.env.STORAGE_DRIVER === 'r2' ? 'r2' : 'local';

const env = {
  port,
  mongoUri: required('MONGO_URI'),
  jwtAccessSecret: required('JWT_ACCESS_SECRET'),
  jwtAccessTtl: process.env.JWT_ACCESS_TTL || '15m',
  jwtRefreshTtl: process.env.JWT_REFRESH_TTL || '30d',
  baseUrl: process.env.BASE_URL || `http://localhost:${port}`,
  stingTtlHours: Number(process.env.STING_TTL_HOURS) || 4,
  uploadDir: process.env.UPLOAD_DIR || path.join(process.cwd(), 'uploads'),
  storageDriver,
  r2AccountId: process.env.R2_ACCOUNT_ID || '',
  r2AccessKeyId: process.env.R2_ACCESS_KEY_ID || '',
  r2SecretAccessKey: process.env.R2_SECRET_ACCESS_KEY || '',
  r2BucketName: process.env.R2_BUCKET_NAME || '',
  r2PublicUrl: process.env.R2_PUBLIC_URL || '',
  hiveRadiusM: Number(process.env.HIVE_RADIUS_M) || 150,
  hiveActivationThreshold: Number(process.env.HIVE_ACTIVATION_THRESHOLD) || 3,
  hiveCleanupIntervalMs: Number(process.env.HIVE_CLEANUP_INTERVAL_MS) || 60_000,
  thumbnailWidth: Number(process.env.THUMBNAIL_WIDTH) || 400,
  thumbnailQuality: Number(process.env.THUMBNAIL_QUALITY) || 80,
  stingCapturedAtToleranceMs: Number(process.env.STING_CAPTURED_AT_TOLERANCE_MS) || 120_000,
  stingExifGpsToleranceM: Number(process.env.STING_EXIF_GPS_TOLERANCE_M) || 100,
  stingMaxGpsAccuracyM: Number(process.env.STING_MAX_GPS_ACCURACY_M) || 150,
  stingMinGpsAccuracyM: Number(process.env.STING_MIN_GPS_ACCURACY_M) || 1,
  stingRateLimitMax: Number(process.env.STING_RATE_LIMIT_MAX) || 10,
  stingRateLimitWindowMs: Number(process.env.STING_RATE_LIMIT_WINDOW_MS) || 3_600_000,
  avatarSize: Number(process.env.AVATAR_SIZE) || 256,
  avatarQuality: Number(process.env.AVATAR_QUALITY) || 85,
} as const;

export default env;

export function isR2Configured(): boolean {
  return Boolean(
    env.r2AccountId &&
      env.r2AccessKeyId &&
      env.r2SecretAccessKey &&
      env.r2BucketName &&
      env.r2PublicUrl,
  );
}
