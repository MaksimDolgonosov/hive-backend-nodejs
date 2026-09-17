import { AccountType } from '../models/User';
import { AwardType } from '../models/Award';
import { HiveStage } from '../utils/activation';
import { GeoPoint } from './sting';

export interface PublicContributor {
  userId: string;
  username: string;
  avatarUrl: string | null;
}

export interface PublicAward {
  id: string;
  type: AwardType;
  zoneId: string;
  stingId: string;
  hiveId: string | null;
  center: GeoPoint;
  createdAt: string;
}

export interface PublicZoneCurrent {
  id: string;
  status: 'open' | 'waitlist';
  ttlSec: number;
  activeStings: number;
  isFirstEver: boolean;
  waitlistCount: number;
  threshold: number;
}

export interface PublicEchoCell {
  cellId: string;
  center: GeoPoint;
  count: number;
  lastSeenAt: string;
}

export interface NearbyQueryOptions {
  includeEchoes: boolean;
  includeSeeds: boolean;
  minResults: number;
  maxRadiusM: number;
}

export interface BboxApplied {
  swLat: number;
  swLng: number;
  neLat: number;
  neLng: number;
}

export interface PublicCampaign {
  id: string;
  kind: 'hive_hour' | 'event';
  title: string;
  i18nKey: string;
  startsAt: string;
  endsAt: string;
  ttlBonusSec: number;
  participantsCount: number;
}

export interface PublicInvite {
  code: string;
  zoneId: string | null;
  usesLimit: number;
  usesCount: number;
  createdAt: string;
  expiresAt: string;
}

export { AccountType, AwardType, HiveStage };
