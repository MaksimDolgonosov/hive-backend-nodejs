import { NextFunction, Request, Response } from 'express';
import User from '../models/User';
import * as analyticsService from '../services/analytics.service';
import * as campaignsService from '../services/campaigns.service';
import { suspendLivePlaces } from '../services/places.service';
import { AppError } from '../utils/AppError';

export async function createCampaign(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const campaign = await campaignsService.createCampaign({
      kind: req.body.kind,
      title: req.body.title,
      i18nKey: req.body.i18nKey,
      geo: req.body.geo,
      startsAt: new Date(req.body.startsAt),
      endsAt: new Date(req.body.endsAt),
      recurrence: req.body.recurrence ?? 'none',
      ttlBonusSec: Number(req.body.ttlBonusSec ?? 0),
      pushEnabled: req.body.pushEnabled !== false,
    });
    res.status(201).json({ campaign: { id: campaign.id } });
  } catch (err) {
    next(err);
  }
}

export async function setAccountType(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const user = await User.findByIdAndUpdate(
      req.params.id,
      { $set: { accountType: req.body.accountType } },
      { new: true },
    );
    if (!user) {
      throw new AppError(404, 'USER_NOT_FOUND', 'Пользователь не найден');
    }
    if (user.accountType === 'personal') {
      await suspendLivePlaces(user.id);
    }
    res.status(200).json({ id: user.id, accountType: user.accountType });
  } catch (err) {
    next(err);
  }
}

export async function density(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const result = await analyticsService.getDensityMetrics({
      zoneId: String(req.query.zoneId),
      from: new Date(String(req.query.from)),
      to: new Date(String(req.query.to)),
    });
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
}

export async function retention(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const result = await analyticsService.getRetentionMetrics({
      zoneId: String(req.query.zoneId),
      cohort: String(req.query.cohort),
    });
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
}

export async function growth(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const result = await analyticsService.getGrowthMetrics({
      from: new Date(String(req.query.from)),
      to: new Date(String(req.query.to)),
    });
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
}
