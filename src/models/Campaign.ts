import mongoose, { Document, Schema } from 'mongoose';

export type CampaignKind = 'hive_hour' | 'event';
export type CampaignRecurrence = 'none' | 'daily' | 'weekly';
export type CampaignGeoType = 'radius' | 'zones';

export interface ICampaign extends Document {
  kind: CampaignKind;
  title: string;
  i18nKey: string;
  geoType: CampaignGeoType;
  center: {
    type: 'Point';
    coordinates: [number, number];
  } | null;
  radiusM: number | null;
  zoneIds: string[];
  startsAt: Date;
  endsAt: Date;
  recurrence: CampaignRecurrence;
  ttlBonusSec: number;
  pushEnabled: boolean;
  lastStartedWindowAt: Date | null;
  lastEndedWindowAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const campaignSchema = new Schema<ICampaign>(
  {
    kind: { type: String, enum: ['hive_hour', 'event'], required: true },
    title: { type: String, required: true },
    i18nKey: { type: String, required: true },
    geoType: { type: String, enum: ['radius', 'zones'], required: true },
    center: {
      type: {
        type: String,
        enum: ['Point'],
      },
      coordinates: {
        type: [Number],
      },
      default: null,
    },
    radiusM: { type: Number, default: null },
    zoneIds: { type: [String], default: [] },
    startsAt: { type: Date, required: true },
    endsAt: { type: Date, required: true },
    recurrence: { type: String, enum: ['none', 'daily', 'weekly'], default: 'none' },
    ttlBonusSec: { type: Number, default: 0 },
    pushEnabled: { type: Boolean, default: true },
    lastStartedWindowAt: { type: Date, default: null },
    lastEndedWindowAt: { type: Date, default: null },
  },
  { timestamps: true },
);

campaignSchema.index({ startsAt: 1, endsAt: 1 });
campaignSchema.index({ zoneIds: 1 });
campaignSchema.index({ center: '2dsphere' }, { sparse: true });

export default mongoose.model<ICampaign>('Campaign', campaignSchema);
