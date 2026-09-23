import env from '../config/env';
import { recalculateActiveZones, recalculateIdleZones } from './zones.service';
import { tickCampaigns } from './campaigns.service';
import { purgeDueOnsiteProofs } from './partner-applications.service';
import {
  enqueueExpiringStingPushes,
  flushPushQueue,
  processPushReceipts,
} from './push.service';

let activeTimer: ReturnType<typeof setInterval> | null = null;
let idleTimer: ReturnType<typeof setInterval> | null = null;
let campaignTimer: ReturnType<typeof setInterval> | null = null;
let pushTimer: ReturnType<typeof setInterval> | null = null;

export function startGrowthWorkers(): void {
  void recalculateActiveZones().catch((error: Error) => {
    console.warn('[zones] active recalc failed', error.message);
  });

  activeTimer = setInterval(() => {
    void recalculateActiveZones().catch((error: Error) => {
      console.warn('[zones] active recalc failed', error.message);
    });
  }, env.zoneRecalcActiveMs);

  idleTimer = setInterval(() => {
    void recalculateIdleZones().catch((error: Error) => {
      console.warn('[zones] idle recalc failed', error.message);
    });
    void purgeDueOnsiteProofs().catch((error: Error) => {
      console.warn('[places] onsite purge failed', error.message);
    });
  }, env.zoneRecalcIdleMs);

  campaignTimer = setInterval(() => {
    void tickCampaigns().catch((error: Error) => {
      console.warn('[campaigns] tick failed', error.message);
    });
  }, env.campaignTickMs);

  pushTimer = setInterval(() => {
    void enqueueExpiringStingPushes().catch((error: Error) => {
      console.warn('[push] expiring failed', error.message);
    });
    void flushPushQueue().catch((error: Error) => {
      console.warn('[push] flush failed', error.message);
    });
    void processPushReceipts().catch((error: Error) => {
      console.warn('[push] receipts failed', error.message);
    });
  }, env.pushTickMs);

  console.log('Growth workers started');
}

export function stopGrowthWorkers(): void {
  if (activeTimer) clearInterval(activeTimer);
  if (idleTimer) clearInterval(idleTimer);
  if (campaignTimer) clearInterval(campaignTimer);
  if (pushTimer) clearInterval(pushTimer);
}
