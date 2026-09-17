export const TTL_4H_SEC = 14_400;
export const TTL_8H_SEC = 28_800;
export const TTL_24H_SEC = 86_400;
export const TTL_72H_SEC = 259_200;

export function ttlSecFromStings24h(stings24h: number): number {
  if (stings24h >= 60) {
    return TTL_4H_SEC;
  }
  if (stings24h >= 20) {
    return TTL_8H_SEC;
  }
  if (stings24h >= 5) {
    return TTL_24H_SEC;
  }
  return TTL_72H_SEC;
}

export function capTtlSec(ttlSec: number): number {
  return Math.min(Math.max(ttlSec, 1), TTL_72H_SEC);
}

export function hiveTtlBonusSec(zoneTtlSec: number, configuredBonusSec: number | null): number {
  if (configuredBonusSec != null) {
    return Math.max(0, configuredBonusSec);
  }
  return Math.floor(zoneTtlSec * 0.5);
}

export function combineTtlSec(parts: {
  baseSec: number;
  campaignBonusSec?: number;
  hiveBonusSec?: number;
}): number {
  return capTtlSec(
    parts.baseSec + (parts.campaignBonusSec ?? 0) + (parts.hiveBonusSec ?? 0),
  );
}

export function expiresAtFromTtl(createdAt: Date, ttlSec: number): Date {
  return new Date(createdAt.getTime() + capTtlSec(ttlSec) * 1000);
}

export const HARD_DELETE_AFTER_EXPIRY_MS = 30 * 24 * 60 * 60 * 1000;
export const ECHO_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;
export const ZONE_REVIVAL_MS = 14 * 24 * 60 * 60 * 1000;
