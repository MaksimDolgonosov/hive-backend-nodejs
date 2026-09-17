import Campaign, { ICampaign } from '../models/Campaign';
import Sting from '../models/Sting';
import { PublicCampaign } from '../types/growth';
import { GeoPoint } from '../types/sting';
import { haversineDistanceM } from '../utils/geo';
import { zoneIdFromLatLng } from '../utils/h3';
import { emitCampaignEnded, emitCampaignStarted } from '../sockets/realtime';
import { notifyCampaignStarted } from './push.service';

const DAY_MS = 24 * 60 * 60 * 1000;

export interface CampaignWindow {
  startsAt: Date;
  endsAt: Date;
  active: boolean;
}

function durationMs(campaign: ICampaign): number {
  return Math.max(0, campaign.endsAt.getTime() - campaign.startsAt.getTime());
}

export function currentCampaignWindow(campaign: ICampaign, now: Date = new Date()): CampaignWindow {
  const duration = durationMs(campaign);

  if (campaign.recurrence === 'none') {
    return {
      startsAt: campaign.startsAt,
      endsAt: campaign.endsAt,
      active: now >= campaign.startsAt && now <= campaign.endsAt,
    };
  }

  const applyOffset = (base: Date): Date =>
    new Date(
      Date.UTC(
        base.getUTCFullYear(),
        base.getUTCMonth(),
        base.getUTCDate(),
        campaign.startsAt.getUTCHours(),
        campaign.startsAt.getUTCMinutes(),
        campaign.startsAt.getUTCSeconds(),
        campaign.startsAt.getUTCMilliseconds(),
      ),
    );

  const weekdayOk = (start: Date): boolean =>
    campaign.recurrence !== 'weekly' || start.getUTCDay() === campaign.startsAt.getUTCDay();

  const candidates = [-1, 0, 1].map((offset) => {
    const day = new Date(now.getTime() + offset * DAY_MS);
    return applyOffset(day);
  });

  for (const startsAt of candidates) {
    if (!weekdayOk(startsAt)) {
      continue;
    }
    const endsAt = new Date(startsAt.getTime() + duration);
    if (now >= startsAt && now <= endsAt) {
      return { startsAt, endsAt, active: true };
    }
  }

  const upcoming = candidates
    .filter((start) => weekdayOk(start) && start > now)
    .sort((a, b) => a.getTime() - b.getTime())[0];

  const startsAt = upcoming ?? applyOffset(new Date(now.getTime() + DAY_MS));
  return {
    startsAt,
    endsAt: new Date(startsAt.getTime() + duration),
    active: false,
  };
}

export function campaignMatchesPoint(campaign: ICampaign, lat: number, lng: number): boolean {
  if (campaign.geoType === 'zones') {
    const zoneId = zoneIdFromLatLng(lat, lng);
    return campaign.zoneIds.includes(zoneId);
  }

  if (!campaign.center || campaign.radiusM == null) {
    return false;
  }

  const center: GeoPoint = {
    lat: campaign.center.coordinates[1],
    lng: campaign.center.coordinates[0],
  };
  return haversineDistanceM(center, { lat, lng }) <= campaign.radiusM;
}

export async function findActiveCampaigns(lat: number, lng: number): Promise<PublicCampaign[]> {
  const now = new Date();
  const campaigns = await Campaign.find();
  const matched = campaigns.filter(
    (campaign) => campaignMatchesPoint(campaign, lat, lng) && currentCampaignWindow(campaign, now).active,
  );

  const result: PublicCampaign[] = [];
  for (const campaign of matched) {
    const window = currentCampaignWindow(campaign, now);
    const participantsCount = await Sting.countDocuments({
      campaignId: campaign._id,
      createdAt: { $gte: window.startsAt, $lte: window.endsAt },
    });
    result.push({
      id: campaign.id,
      kind: campaign.kind,
      title: campaign.title,
      i18nKey: campaign.i18nKey,
      startsAt: window.startsAt.toISOString(),
      endsAt: window.endsAt.toISOString(),
      ttlBonusSec: campaign.ttlBonusSec,
      participantsCount,
    });
  }

  return result;
}

export async function findActiveCampaignBonus(lat: number, lng: number): Promise<{
  campaignId: string | null;
  ttlBonusSec: number;
}> {
  const campaigns = await findActiveCampaigns(lat, lng);
  if (campaigns.length === 0) {
    return { campaignId: null, ttlBonusSec: 0 };
  }
  const best = campaigns.reduce((acc, campaign) =>
    campaign.ttlBonusSec > acc.ttlBonusSec ? campaign : acc,
  );
  return { campaignId: best.id, ttlBonusSec: best.ttlBonusSec };
}

export interface CreateCampaignInput {
  kind: 'hive_hour' | 'event';
  title: string;
  i18nKey: string;
  geo:
    | { type: 'radius'; center: GeoPoint; radiusM: number }
    | { type: 'zones'; zoneIds: string[] };
  startsAt: Date;
  endsAt: Date;
  recurrence: 'none' | 'daily' | 'weekly';
  ttlBonusSec: number;
  pushEnabled: boolean;
}

export async function createCampaign(input: CreateCampaignInput): Promise<ICampaign> {
  return Campaign.create({
    kind: input.kind,
    title: input.title,
    i18nKey: input.i18nKey,
    geoType: input.geo.type,
    center:
      input.geo.type === 'radius'
        ? { type: 'Point', coordinates: [input.geo.center.lng, input.geo.center.lat] }
        : null,
    radiusM: input.geo.type === 'radius' ? input.geo.radiusM : null,
    zoneIds: input.geo.type === 'zones' ? input.geo.zoneIds : [],
    startsAt: input.startsAt,
    endsAt: input.endsAt,
    recurrence: input.recurrence,
    ttlBonusSec: input.ttlBonusSec,
    pushEnabled: input.pushEnabled,
  });
}

function campaignBroadcastPoint(campaign: ICampaign): GeoPoint {
  if (campaign.center) {
    return { lat: campaign.center.coordinates[1], lng: campaign.center.coordinates[0] };
  }
  return { lat: 0, lng: 0 };
}

export async function tickCampaigns(now: Date = new Date()): Promise<void> {
  const campaigns = await Campaign.find();

  for (const campaign of campaigns) {
    const window = currentCampaignWindow(campaign, now);
    const windowKey = window.startsAt.toISOString();
    const lastStarted = campaign.lastStartedWindowAt?.toISOString() ?? null;
    const lastEnded = campaign.lastEndedWindowAt?.toISOString() ?? null;
    const point = campaignBroadcastPoint(campaign);

    if (window.active && lastStarted !== windowKey) {
      campaign.lastStartedWindowAt = window.startsAt;
      await campaign.save();
      emitCampaignStarted(
        {
          id: campaign.id,
          kind: campaign.kind,
          title: campaign.title,
          i18nKey: campaign.i18nKey,
          startsAt: window.startsAt.toISOString(),
          endsAt: window.endsAt.toISOString(),
          ttlBonusSec: campaign.ttlBonusSec,
          participantsCount: 0,
        },
        point.lat,
        point.lng,
        campaign.radiusM ?? 50_000,
      );
      if (campaign.pushEnabled) {
        void notifyCampaignStarted(campaign.id, campaign.zoneIds);
      }
    }

    if (!window.active && lastStarted && lastEnded !== lastStarted) {
      campaign.lastEndedWindowAt = campaign.lastStartedWindowAt;
      await campaign.save();
      emitCampaignEnded(campaign.id, point.lat, point.lng, campaign.radiusM ?? 50_000);
    }
  }
}
