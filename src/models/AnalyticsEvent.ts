import mongoose, { Document, Schema, Types } from 'mongoose';

export const ANALYTICS_EVENT_NAMES = [
  'app_open',
  'session_start',
  'map_empty_shown',
  'empty_cta_tap',
  'nearest_sting_opened',
  'first_sting_published',
  'sting_published',
  'invite_created',
  'invite_accepted',
  'share_opened',
  'push_received',
  'push_opened',
  'campaign_banner_shown',
  'waitlist_submitted',
] as const;

export type AnalyticsEventName = (typeof ANALYTICS_EVENT_NAMES)[number];

export interface IAnalyticsEvent extends Document {
  idempotencyKey: string;
  userId: Types.ObjectId | null;
  deviceId: string;
  name: string;
  occurredAt: Date;
  zoneId: string | null;
  props: Record<string, unknown>;
  createdAt: Date;
}

const analyticsEventSchema = new Schema<IAnalyticsEvent>(
  {
    idempotencyKey: { type: String, required: true, unique: true },
    userId: { type: Schema.Types.ObjectId, ref: 'User', default: null, index: true },
    deviceId: { type: String, required: true, index: true },
    name: { type: String, required: true },
    occurredAt: { type: Date, required: true },
    zoneId: { type: String, default: null, index: true },
    props: { type: Schema.Types.Mixed, default: {} },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

analyticsEventSchema.index({ zoneId: 1, name: 1, occurredAt: -1 });
analyticsEventSchema.index({ occurredAt: 1 });

export default mongoose.model<IAnalyticsEvent>('AnalyticsEvent', analyticsEventSchema);
