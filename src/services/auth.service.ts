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
import { EmailLocale, normalizeEmail } from '../utils/otp';
import { verifyGoogleIdToken } from './google-auth.service';
import { consumeValidOtp, issueOtpChallenge, OtpDispatchResult } from './otp.service';
import { OtpPurpose } from '../models/EmailOtpChallenge';

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
    byEmail.emailVerified = true;
    byEmail.status = 'active';
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
    emailVerified: true,
    status: 'active',
  });
}

function isEmailVerified(user: IUser): boolean {
  if (user.status === 'pending') {
    return false;
  }
  return user.emailVerified !== false;
}

async function assertUsernameAvailable(username: string, exceptUserId?: string): Promise<void> {
  const existing = await User.findOne({
    username,
    ...(exceptUserId ? { _id: { $ne: exceptUserId } } : {}),
  });
  if (existing) {
    throw new AppError(409, 'USER_ALREADY_EXISTS', 'Email или username уже заняты');
  }
}

async function revokeAllRefreshTokens(userId: string): Promise<void> {
  await RefreshToken.updateMany(
    { userId, revokedAt: null },
    { $set: { revokedAt: new Date() } },
  );
}

export async function register(
  input: RegisterInput,
  locale?: EmailLocale,
): Promise<OtpDispatchResult> {
  const normalizedEmail = normalizeEmail(input.email);
  const normalizedUsername = input.username.trim();
  const passwordHash = await bcrypt.hash(input.password, BCRYPT_ROUNDS);

  const existingByEmail = await User.findOne({ email: normalizedEmail });
  if (existingByEmail && isEmailVerified(existingByEmail)) {
    throw new AppError(409, 'USER_ALREADY_EXISTS', 'Email или username уже заняты');
  }

  if (existingByEmail) {
    await assertUsernameAvailable(normalizedUsername, existingByEmail.id);
    existingByEmail.passwordHash = passwordHash;
    existingByEmail.username = normalizedUsername;
    existingByEmail.status = 'pending';
    existingByEmail.emailVerified = false;
    await existingByEmail.save();

    return issueOtpChallenge({
      email: normalizedEmail,
      purpose: 'register',
      userId: existingByEmail.id,
      locale,
      status: 'otp_required',
      skipCooldown: true,
    });
  }

  await assertUsernameAvailable(normalizedUsername);

  const user = await User.create({
    email: normalizedEmail,
    username: normalizedUsername,
    passwordHash,
    emailVerified: false,
    status: 'pending',
  });

  return issueOtpChallenge({
    email: normalizedEmail,
    purpose: 'register',
    userId: user.id,
    locale,
    status: 'otp_required',
    skipCooldown: true,
  });
}

function assertAccountCanLogin(user: IUser): void {
  if (user.status === 'disabled') {
    throw new AppError(403, 'ACCOUNT_DISABLED', 'Аккаунт заблокирован');
  }

  if (!isEmailVerified(user) || user.status === 'pending') {
    throw new AppError(403, 'EMAIL_NOT_VERIFIED', 'Email is not verified', {
      email: user.email,
      purpose: 'register',
    });
  }
}

export async function login(input: LoginInput): Promise<{ user: PublicUser; tokens: AuthTokens }> {
  const user = await User.findOne({ email: normalizeEmail(input.email) });

  if (!user?.passwordHash || !(await bcrypt.compare(input.password, user.passwordHash))) {
    throw new AppError(401, 'INVALID_CREDENTIALS', 'Неверный email или пароль');
  }

  assertAccountCanLogin(user);

  const tokens = await issueTokens(user.id);
  return { user: toPublicUser(user), tokens };
}

export async function loginWithGoogle(
  input: GoogleLoginInput,
): Promise<{ user: PublicUser; tokens: AuthTokens }> {
  const payload = await verifyGoogleIdToken(input.idToken);
  const user = await findOrCreateGoogleUser(payload);
  if (user.status === 'disabled') {
    throw new AppError(403, 'ACCOUNT_DISABLED', 'Аккаунт заблокирован');
  }
  const tokens = await issueTokens(user.id);
  return { user: toPublicUser(user), tokens };
}

export async function verifyRegisterOtp(input: {
  email: string;
  code: string;
  purpose: OtpPurpose;
}): Promise<{ user: PublicUser; tokens: AuthTokens }> {
  if (input.purpose !== 'register') {
    throw new AppError(400, 'VALIDATION_ERROR', 'Для этого эндпоинта допустим только purpose=register');
  }

  const email = normalizeEmail(input.email);
  const { userId } = await consumeValidOtp({
    email,
    code: input.code,
    purpose: 'register',
  });

  const user = userId
    ? await User.findById(userId)
    : await User.findOne({ email, emailVerified: false });

  if (!user) {
    throw new AppError(404, 'OTP_NOT_FOUND', 'Активный код не найден');
  }

  user.emailVerified = true;
  user.status = 'active';
  await user.save();

  const tokens = await issueTokens(user.id);
  return { user: toPublicUser(user), tokens };
}

export async function resendOtp(
  input: { email: string; purpose: OtpPurpose },
  locale?: EmailLocale,
): Promise<OtpDispatchResult> {
  const email = normalizeEmail(input.email);
  const success = (): OtpDispatchResult => ({
    status: 'otp_sent',
    email,
    purpose: input.purpose,
    expiresInSec: env.otpTtlSec,
    resendAvailableInSec: env.otpResendCooldownSec,
  });

  if (input.purpose === 'password_reset') {
    const user = await User.findOne({ email, status: { $ne: 'disabled' } });
    const canReset = Boolean(user && isEmailVerified(user));
    return issueOtpChallenge({
      email,
      purpose: 'password_reset',
      userId: canReset ? user!.id : null,
      locale,
      sendEmail: canReset,
    });
  }

  const user = await User.findOne({ email, emailVerified: false, status: 'pending' });
  if (!user) {
    return success();
  }

  return issueOtpChallenge({
    email,
    purpose: 'register',
    userId: user.id,
    locale,
  });
}

export async function forgotPassword(
  emailRaw: string,
  locale?: EmailLocale,
): Promise<OtpDispatchResult> {
  const email = normalizeEmail(emailRaw);
  const user = await User.findOne({ email, status: { $ne: 'disabled' } });
  const canReset = Boolean(user && isEmailVerified(user));

  return issueOtpChallenge({
    email,
    purpose: 'password_reset',
    userId: canReset ? user!.id : null,
    locale,
    sendEmail: canReset,
  });
}

export async function resetPassword(input: {
  email: string;
  code: string;
  newPassword: string;
}): Promise<{ user: PublicUser; tokens: AuthTokens }> {
  const email = normalizeEmail(input.email);
  const { userId } = await consumeValidOtp({
    email,
    code: input.code,
    purpose: 'password_reset',
  });

  const user = userId
    ? await User.findById(userId)
    : await User.findOne({ email });

  if (!user || !isEmailVerified(user)) {
    throw new AppError(400, 'OTP_INVALID', 'Неверный код');
  }

  user.passwordHash = await bcrypt.hash(input.newPassword, BCRYPT_ROUNDS);
  await user.save();
  await revokeAllRefreshTokens(user.id);

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
