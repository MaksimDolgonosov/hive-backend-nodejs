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
import { mergeSocialLinks, serializeSocialLinks } from '../utils/social-links';
import { UpdateProfileInput, UserSocialLinks } from '../types/profile-user';
import { verifyGoogleIdToken } from './google-auth.service';

const BCRYPT_ROUNDS = 12;

export interface PublicUser {
  id: string;
  username: string;
  avatarUrl: string | null;
  bio: string | null;
  socialLinks: UserSocialLinks;
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

export interface GoogleLoginInput {
  idToken: string;
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
    bio: user.bio ?? null,
    socialLinks: serializeSocialLinks(user.socialLinks),
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

function normalizeUsernameSeed(email: string, name?: string | null): string {
  const fromName = name
    ?.trim()
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, '_')
    .replace(/^_+|_+$/g, '');

  if (fromName && fromName.length >= 3) {
    return fromName.slice(0, 30);
  }

  const fromEmail = email
    .split('@')[0]
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, '_')
    .replace(/^_+|_+$/g, '');

  if (fromEmail.length >= 3) {
    return fromEmail.slice(0, 30);
  }

  return 'hive_user';
}

async function ensureUniqueUsername(email: string, name?: string | null): Promise<string> {
  const base = normalizeUsernameSeed(email, name);
  let candidate = base;
  let suffix = 0;

  while (await User.exists({ username: candidate })) {
    suffix += 1;
    candidate = `${base.slice(0, Math.max(3, 30 - String(suffix).length))}${suffix}`;
  }

  return candidate;
}

async function findOrCreateGoogleUser(payload: {
  sub: string;
  email: string;
  name: string | null;
  picture: string | null;
}): Promise<IUser> {
  const byGoogleId = await User.findOne({ googleId: payload.sub });
  if (byGoogleId) {
    return byGoogleId;
  }

  const byEmail = await User.findOne({ email: payload.email });
  if (byEmail) {
    if (byEmail.googleId && byEmail.googleId !== payload.sub) {
      throw new AppError(
        409,
        'GOOGLE_ACCOUNT_CONFLICT',
        'Этот email уже привязан к другому Google-аккаунту',
      );
    }

    byEmail.googleId = payload.sub;
    if (!byEmail.avatarUrl && payload.picture) {
      byEmail.avatarUrl = payload.picture;
    }
    await byEmail.save();
    return byEmail;
  }

  return User.create({
    email: payload.email,
    username: await ensureUniqueUsername(payload.email, payload.name),
    googleId: payload.sub,
    avatarUrl: payload.picture,
    passwordHash: null,
  });
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

  if (!user?.passwordHash || !(await bcrypt.compare(input.password, user.passwordHash))) {
    throw new AppError(401, 'INVALID_CREDENTIALS', 'Неверный email или пароль');
  }

  const tokens = await issueTokens(user.id);
  return { user: toPublicUser(user), tokens };
}

export async function loginWithGoogle(
  input: GoogleLoginInput,
): Promise<{ user: PublicUser; tokens: AuthTokens }> {
  const payload = await verifyGoogleIdToken(input.idToken);
  const user = await findOrCreateGoogleUser(payload);
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

export async function updateProfile(
  userId: string,
  input: UpdateProfileInput,
): Promise<{ user: PublicUser }> {
  const user = await User.findById(userId);
  if (!user) {
    throw new AppError(404, 'USER_NOT_FOUND', 'Пользователь не найден');
  }

  if (input.bio !== undefined) {
    const trimmedBio = typeof input.bio === 'string' ? input.bio.trim() : '';
    user.bio = trimmedBio.length > 0 ? trimmedBio : null;
  }

  if (input.socialLinks !== undefined) {
    user.socialLinks = mergeSocialLinks(user.socialLinks, input.socialLinks);
    user.markModified('socialLinks');
  }

  await user.save();
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
