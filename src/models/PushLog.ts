import mongoose, { Document, Schema, Types } from 'mongoose';

export type PushType =
  | 'sting_reaction'
  | 'nearby_activity'
  | 'campaign_started'
  | 'sting_expiring'
  | 'invite_accepted'
  | 'zone_opened';

export interface IPushLog extends Document {
  userId: Types.ObjectId;
  type: PushType;
  entityId: string;
  createdAt: Date;
}

const pushLogSchema = new Schema<IPushLog>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    type: { type: String, required: true },
    entityId: { type: String, required: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

pushLogSchema.index({ userId: 1, type: 1, entityId: 1, createdAt: -1 });
pushLogSchema.index({ createdAt: 1 }, { expireAfterSeconds: 48 * 60 * 60 });

export default mongoose.model<IPushLog>('PushLog', pushLogSchema);
