import { NextFunction, Request, Response } from 'express';
import * as invitesService from '../services/invites.service';
import * as zonesService from '../services/zones.service';
import { zoneIdFromLatLng } from '../utils/h3';

export async function create(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    let zoneId: string | null = null;
    if (req.body.lat != null && req.body.lng != null) {
      zoneId = zoneIdFromLatLng(Number(req.body.lat), Number(req.body.lng));
      await zonesService.getOrCreateZone(Number(req.body.lat), Number(req.body.lng));
    }
    const result = await invitesService.createInvite(req.user!.id, zoneId);
    res.status(201).json(result);
  } catch (err) {
    next(err);
  }
}

export async function me(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const result = await invitesService.listMyInvites(req.user!.id);
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
}

export async function getByCode(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const result = await invitesService.getPublicInvite(req.params.code);
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
}
