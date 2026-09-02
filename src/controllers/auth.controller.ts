import { NextFunction, Request, Response } from 'express';
import * as authService from '../services/auth.service';
import * as profileService from '../services/profile.service';
import env from '../config/env';
import { AppError } from '../utils/AppError';
import { resolveLocale } from '../utils/otp';

function localeFromRequest(req: Request) {
  return resolveLocale({
    header: typeof req.headers['accept-language'] === 'string' ? req.headers['accept-language'] : undefined,
    query: typeof req.body?.locale === 'string' ? req.body.locale : undefined,
    defaultLocale: env.otpDefaultLocale,
  });
}

export async function register(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const result = await authService.register(req.body, localeFromRequest(req));
    res.status(201).json(result);
  } catch (err) {
    next(err);
  }
}

export async function login(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const result = await authService.login(req.body);
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
}

export async function loginWithGoogle(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const result = await authService.loginWithGoogle(req.body);
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
}

export async function verifyOtp(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const result = await authService.verifyRegisterOtp(req.body);
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
}

export async function resendOtp(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const result = await authService.resendOtp(req.body, localeFromRequest(req));
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
}

export async function forgotPassword(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const result = await authService.forgotPassword(req.body.email, localeFromRequest(req));
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
}

export async function resetPassword(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const result = await authService.resetPassword(req.body);
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
}

export async function refresh(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const result = await authService.refresh(req.body.refreshToken);
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
}

export async function logout(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    await authService.logout(req.body.refreshToken);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
}

export async function me(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const result = await authService.getMe(req.user!.id);
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
}

export async function meStats(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const result = await profileService.getActiveProfileOverview(req.user!.id);
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
}

function parseCollectionQuery(req: Request): { cursor?: string; limit?: number } {
  return {
    cursor: typeof req.query.cursor === 'string' ? req.query.cursor : undefined,
    limit: req.query.limit != null ? Number(req.query.limit) : undefined,
  };
}

export async function meStings(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { cursor, limit } = parseCollectionQuery(req);
    const result = await profileService.getMyStings(req.user!.id, cursor, limit);
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
}

export async function meHives(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { cursor, limit } = parseCollectionQuery(req);
    const result = await profileService.getMyHives(req.user!.id, cursor, limit);
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
}

export async function meLikedStings(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { cursor, limit } = parseCollectionQuery(req);
    const result = await profileService.getLikedStings(req.user!.id, cursor, limit);
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
}

export async function uploadAvatar(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.file?.buffer) {
      throw new AppError(422, 'VALIDATION_ERROR', 'Поле avatar обязательно');
    }

    const result = await authService.updateAvatar(req.user!.id, req.file.buffer);
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
}

export async function removeAvatar(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const result = await authService.removeAvatar(req.user!.id);
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
}

export async function updateProfile(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const result = await authService.updateProfile(req.user!.id, req.body);
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
}
