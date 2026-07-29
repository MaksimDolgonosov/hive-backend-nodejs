import { PublicHive, PublicSting } from './sting';

export type ClientEventType = 'subscribe:region' | 'unsubscribe:region' | 'ping';

export type ServerEventType =
  | 'sting:created'
  | 'sting:expired'
  | 'hive:updated'
  | 'hive:dissolved'
  | 'sting:reaction'
  | 'pong';

export type RealtimeEventType = ClientEventType | ServerEventType;

export interface RealtimeEnvelope {
  type: RealtimeEventType;
  payload: unknown;
}

export interface StingCreatedPayload {
  sting: PublicSting;
}

export interface StingExpiredPayload {
  stingId: string;
  hiveId: string | null;
}

export interface HiveUpdatedPayload {
  hive: PublicHive;
}

export interface HiveDissolvedPayload {
  hiveId: string;
}

export interface StingReactionPayload {
  stingId: string;
  reactionsCount: number;
}
