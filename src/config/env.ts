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

const env = {
  port,
  mongoUri: required('MONGO_URI'),
  jwtAccessSecret: required('JWT_ACCESS_SECRET'),
  jwtAccessTtl: process.env.JWT_ACCESS_TTL || '15m',
  jwtRefreshTtl: process.env.JWT_REFRESH_TTL || '30d',
  baseUrl: process.env.BASE_URL || `http://localhost:${port}`,
  stingTtlHours: Number(process.env.STING_TTL_HOURS) || 4,
  uploadDir: process.env.UPLOAD_DIR || path.join(process.cwd(), 'uploads'),
} as const;

export default env;
