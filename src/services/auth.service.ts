import bcrypt from 'bcrypt';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import ms from 'ms';
import env from '../config/env';
import RefreshToken from '../models/RefreshToken';
import User, { IUser } from '../models/User';
import { processAvatar } from './image.service';
import { uploadAvatarImage, deleteAvatarImage } from './storage.service';
import { AppError } from '../utils/AppError';

const BCRYPT_ROUNDS = 12;

export interface PublicUser {
  id: string;
  username: string;
  avatarUrl: string | null;
  createdAt: string;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresAt: string;
}

export interface RegisterInput {
  email: string;
  password: string;
  username: string;
}

export interface LoginInput {
  email: string;
  password: string;
}

export interface AuthorSummary {
  username: string;
  avatarUrl: string | null;
}

function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function toPublicUser(user: IUser): PublicUser {
  return {
    id: user.id,
    username: user.username,
    avatarUrl: user.avatarUrl,
    createdAt: user.createdAt.toISOString(),
  };
}

async function issueTokens(userId: string): Promise<AuthTokens> {
  const accessToken = jwt.sign({ sub: userId }, env.jwtAccessSecret, {
    expiresIn: env.jwtAccessTtl,
  });

  const refreshTokenRaw = crypto.randomBytes(40).toString('hex');
  const refreshExpiresAt = new Date(Date.now() + ms(env.jwtRefreshTtl));

  await RefreshToken.create({
    userId,
    tokenHash: hashToken(refreshTokenRaw),
    expiresAt: refreshExpiresAt,
  });

  const accessExpiresAt = new Date(Date.now() + ms(env.jwtAccessTtl));

  return {
    accessToken,
    refreshToken: refreshTokenRaw,
    expiresAt: accessExpiresAt.toISOString(),
  };
}

export async function register(input: RegisterInput): Promise<{ user: PublicUser; tokens: AuthTokens }> {
  const normalizedEmail = input.email.toLowerCase();

  const existing = await User.findOne({
    $or: [{ email: normalizedEmail }, { username: input.username }],
  });
  if (existing) {
    throw new AppError(409, 'USER_ALREADY_EXISTS', 'Email или username уже заняты');
  }

  const passwordHash = await bcrypt.hash(input.password, BCRYPT_ROUNDS);
  const user = await User.create({
    email: normalizedEmail,
    username: input.username,
    passwordHash,
  });

  const tokens = await issueTokens(user.id);
  return { user: toPublicUser(user), tokens };
}

export async function login(input: LoginInput): Promise<{ user: PublicUser; tokens: AuthTokens }> {
  const user = await User.findOne({ email: input.email.toLowerCase() });

  if (!user || !(await bcrypt.compare(input.password, user.passwordHash))) {
    throw new AppError(401, 'INVALID_CREDENTIALS', 'Неверный email или пароль');
  }

  const tokens = await issueTokens(user.id);
  return { user: toPublicUser(user), tokens };
}

export async function refresh(refreshTokenRaw: string): Promise<{ tokens: AuthTokens }> {
  const tokenHash = hashToken(refreshTokenRaw);
  const stored = await RefreshToken.findOne({ tokenHash });

  if (!stored || stored.revokedAt || stored.expiresAt < new Date()) {
    throw new AppError(
      401,
      'INVALID_REFRESH_TOKEN',
      'Сессия истекла, требуется повторный вход',
    );
  }

  stored.revokedAt = new Date();
  await stored.save();

  const tokens = await issueTokens(String(stored.userId));
  return { tokens };
}

export async function logout(refreshTokenRaw: string): Promise<void> {
  const tokenHash = hashToken(refreshTokenRaw);
  await RefreshToken.updateOne(
    { tokenHash, revokedAt: null },
    { $set: { revokedAt: new Date() } },
  );
}

export async function getMe(userId: string): Promise<{ user: PublicUser }> {
  const user = await User.findById(userId);
  if (!user) {
    throw new AppError(404, 'USER_NOT_FOUND', 'Пользователь не найден');
  }
  return { user: toPublicUser(user) };
}

export async function updateAvatar(
  userId: string,
  photoBuffer: Buffer,
): Promise<{ user: PublicUser }> {
  const user = await User.findById(userId);
  if (!user) {
    throw new AppError(404, 'USER_NOT_FOUND', 'Пользователь не найден');
  }

  const processed = await processAvatar(photoBuffer);
  const baseUrl = await uploadAvatarImage(userId, processed);
  user.avatarUrl = `${baseUrl.split('?')[0]}?v=${Date.now()}`;
  await user.save();

  return { user: toPublicUser(user) };
}

export async function removeAvatar(userId: string): Promise<{ user: PublicUser }> {
  const user = await User.findById(userId);
  if (!user) {
    throw new AppError(404, 'USER_NOT_FOUND', 'Пользователь не найден');
  }

  if (user.avatarUrl) {
    await deleteAvatarImage(userId);
    user.avatarUrl = null;
    await user.save();
  }

  return { user: toPublicUser(user) };
}

export async function loadAuthorSummaries(
  userIds: string[],
): Promise<Map<string, AuthorSummary>> {
  if (userIds.length === 0) {
    return new Map();
  }

  const users = await User.find({ _id: { $in: userIds } }).select('username avatarUrl');
  return new Map(
    users.map((user) => [
      user.id,
      { username: user.username, avatarUrl: user.avatarUrl },
    ]),
  );
}
