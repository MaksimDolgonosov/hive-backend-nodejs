import env from '../config/env';
import Zone, { IZone, zoneCenterPoint } from '../models/Zone';
import ZoneDau from '../models/ZoneDau';
import Sting from '../models/Sting';
import WaitlistEntry from '../models/WaitlistEntry';
import User from '../models/User';
import { PublicZoneCurrent } from '../types/growth';
import { GeoPoint } from '../types/sting';
import { startOfUtcDay } from '../utils/cache';
import { cellCenter, overviewCellIdFromZone, zoneIdFromLatLng } from '../utils/h3';
import { ttlSecFromStings24h } from '../utils/ttl';

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

export async function getOrCreateZone(lat: number, lng: number): Promise<IZone> {
  const zoneId = zoneIdFromLatLng(lat, lng);
  const existing = await Zone.findById(zoneId);
  if (existing) {
    existing.lastActivityAt = new Date();
    await existing.save();
    return existing;
  }

  const center = cellCenter(zoneId);
  return Zone.create({
    _id: zoneId,
    overviewCellId: overviewCellIdFromZone(zoneId),
    center: { type: 'Point', coordinates: [center.lng, center.lat] },
    status: env.waitlistEnabled ? 'waitlist' : 'open',
    ttlSec: ttlSecFromStings24h(0),
    lastActivityAt: new Date(),
  });
}

export async function getZoneById(zoneId: string): Promise<IZone | null> {
  return Zone.findById(zoneId);
}

export function toPublicZoneCurrent(zone: IZone | null, zoneId: string): PublicZoneCurrent {
  const threshold = env.waitlistThreshold;
  if (!zone) {
    return {
      id: zoneId,
      status: env.waitlistEnabled ? 'waitlist' : 'open',
      ttlSec: ttlSecFromStings24h(0),
      activeStings: 0,
      isFirstEver: true,
      waitlistCount: 0,
      threshold,
    };
  }

  return {
    id: zone.id,
    status: env.waitlistEnabled ? zone.status : 'open',
    ttlSec: zone.ttlSec || ttlSecFromStings24h(zone.stings24h),
    activeStings: zone.activeStings,
    isFirstEver: zone.lifetimeStings === 0,
    waitlistCount: env.waitlistEnabled ? zone.waitlistCount : 0,
    threshold,
  };
}

export async function getCurrentZone(lat: number, lng: number): Promise<PublicZoneCurrent> {
  const zoneId = zoneIdFromLatLng(lat, lng);
  const zone = await Zone.findById(zoneId);
  if (!zone) {
    return toPublicZoneCurrent(null, zoneId);
  }
  return toPublicZoneCurrent(zone, zoneId);
}

export async function recordZoneVisit(userId: string, lat: number, lng: number): Promise<string> {
  const zone = await getOrCreateZone(lat, lng);
  const day = startOfUtcDay();

  await ZoneDau.updateOne(
    { zoneId: zone.id, userId, day },
    { $setOnInsert: { createdAt: new Date() } },
    { upsert: true },
  );

  await User.updateOne(
    { _id: userId, signupZoneId: null },
    { $set: { signupZoneId: zone.id } },
  );

  return zone.id;
}

export async function incrementZoneOnPublish(
  zoneId: string,
  center: GeoPoint,
): Promise<{ zone: IZone; previousLifetime: number; previousLastStingAt: Date | null }> {
  const now = new Date();
  const previous = await Zone.findById(zoneId);
  const previousLifetime = previous?.lifetimeStings ?? 0;
  const previousLastStingAt = previous?.lastStingAt ?? null;

  const zone = await Zone.findOneAndUpdate(
    { _id: zoneId },
    {
      $inc: { lifetimeStings: 1 },
      $set: {
        lastStingAt: now,
        lastActivityAt: now,
        overviewCellId: previous?.overviewCellId ?? overviewCellIdFromZone(zoneId),
        center: previous?.center ?? {
          type: 'Point',
          coordinates: [center.lng, center.lat],
        },
      },
      $setOnInsert: {
        status: env.waitlistEnabled ? 'waitlist' : 'open',
        ttlSec: ttlSecFromStings24h(0),
        stings24h: 0,
        activeStings: 0,
        dau24h: 0,
        waitlistCount: 0,
        label: null,
      },
    },
    { upsert: true, new: true },
  );

  return { zone: zone!, previousLifetime, previousLastStingAt };
}

export async function recalculateZone(zoneId: string): Promise<IZone | null> {
  const now = new Date();
  const since24h = new Date(now.getTime() - DAY_MS);
  const day = startOfUtcDay(now);

  const [stings24h, activeStings, dau24h, waitlistCount] = await Promise.all([
    Sting.countDocuments({ zoneId, createdAt: { $gte: since24h } }),
    Sting.countDocuments({
      zoneId,
      expiresAt: { $gt: now },
      mediaPurgedAt: null,
    }),
    ZoneDau.countDocuments({ zoneId, day }),
    env.waitlistEnabled ? WaitlistEntry.countDocuments({ zoneId }) : 0,
  ]);

  const ttlSec = ttlSecFromStings24h(stings24h);
  const zone = await Zone.findByIdAndUpdate(
    zoneId,
    {
      $set: {
        stings24h,
        activeStings,
        dau24h,
        ttlSec,
        waitlistCount,
        updatedAt: now,
      },
    },
    { new: true },
  );

  return zone;
}

export async function recalculateActiveZones(now: Date = new Date()): Promise<void> {
  const activeSince = new Date(now.getTime() - DAY_MS);
  const zones = await Zone.find({ lastActivityAt: { $gte: activeSince } }).select('_id');
  await Promise.all(zones.map((zone) => recalculateZone(zone.id)));
}

export async function recalculateIdleZones(now: Date = new Date()): Promise<void> {
  const activeSince = new Date(now.getTime() - DAY_MS);
  const zones = await Zone.find({ lastActivityAt: { $lt: activeSince } }).select('_id');
  await Promise.all(zones.map((zone) => recalculateZone(zone.id)));
}

export function zonePoint(zone: IZone): GeoPoint {
  return zoneCenterPoint(zone);
}
