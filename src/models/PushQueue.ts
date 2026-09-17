import mongoose, { Document, Schema, Types } from 'mongoose';

export type PushType =
  | 'sting_reaction'
  | 'nearby_activity'
  | 'campaign_started'
  | 'sting_expiring'
  | 'invite_accepted'
  | 'zone_opened';

export interface IPushQueue extends Document {
  userId: Types.ObjectId;
  type: PushType;
  entityId: string;
  title: string;
  body: string;
  deeplink: string;
  sendAfter: Date;
  sentAt: Date | null;
  createdAt: Date;
}

const pushQueueSchema = new Schema<IPushQueue>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    type: { type: String, required: true },
    entityId: { type: String, required: true },
    title: { type: String, required: true },
    body: { type: String, required: true },
    deeplink: { type: String, required: true },
    sendAfter: { type: Date, required: true, index: true },
    sentAt: { type: Date, default: null },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

pushQueueSchema.index({ userId: 1, type: 1, entityId: 1 });
pushQueueSchema.index({ createdAt: 1 }, { expireAfterSeconds: 7 * 24 * 60 * 60 });

export default mongoose.model<IPushQueue>('PushQueue', pushQueueSchema);
