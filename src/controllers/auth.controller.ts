import { NextFunction, Request, Response } from 'express';
import * as authService from '../services/auth.service';
import * as profileService from '../services/profile.service';
import { AppError } from '../utils/AppError';

export async function register(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const result = await authService.register(req.body);
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
