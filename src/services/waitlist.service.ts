import env from '../config/env';
import WaitlistEntry from '../models/WaitlistEntry';
import Zone from '../models/Zone';
import { AppError } from '../utils/AppError';
import { gridDisk } from 'h3-js';
import { getOrCreateZone, recalculateZone } from './zones.service';
import { notifyZoneOpened } from './push.service';

export async function submitWaitlist(input: {
  lat: number;
  lng: number;
  email: string;
  deviceId: string;
}): Promise<{
  zoneId: string;
  status: 'waitlist' | 'open';
  currentCount: number;
  threshold: number;
}> {
  if (!env.waitlistEnabled) {
    throw new AppError(404, 'FEATURE_DISABLED', 'Вейтлист выключен');
  }

  const zone = await getOrCreateZone(input.lat, input.lng);
  const email = input.email.trim().toLowerCase();

  try {
    await WaitlistEntry.create({
      email,
      deviceId: input.deviceId,
      zoneId: zone.id,
      lat: input.lat,
      lng: input.lng,
    });
  } catch (error) {
    if (
      !(
        typeof error === 'object' &&
        error !== null &&
        'code' in error &&
        (error as { code?: number }).code === 11000
      )
    ) {
      throw error;
    }
  }

  const neighborIds = gridDisk(zone.id, 1);
  const currentCount = await WaitlistEntry.countDocuments({
    zoneId: { $in: neighborIds },
  });

  zone.waitlistCount = await WaitlistEntry.countDocuments({ zoneId: zone.id });
  await zone.save();

  if (zone.status === 'waitlist' && currentCount >= env.waitlistThreshold) {
    await openZone(zone.id);
  }

  const fresh = await Zone.findById(zone.id);

  return {
    zoneId: zone.id,
    status: fresh?.status ?? zone.status,
    currentCount,
    threshold: env.waitlistThreshold,
  };
}

export async function openZone(zoneId: string): Promise<void> {
  const zone = await Zone.findByIdAndUpdate(zoneId, { $set: { status: 'open' } }, { new: true });
  if (!zone) {
    return;
  }

  const entries = await WaitlistEntry.find({ zoneId, notifiedAt: null });
  await notifyZoneOpened(
    zoneId,
    entries.map((entry) => entry.email),
  );
  await WaitlistEntry.updateMany({ zoneId, notifiedAt: null }, { $set: { notifiedAt: new Date() } });
  await recalculateZone(zoneId);
}
