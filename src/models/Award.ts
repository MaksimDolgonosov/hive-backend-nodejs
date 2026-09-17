import mongoose, { Document, Schema, Types } from 'mongoose';

export type AwardType = 'zone_first' | 'zone_revival' | 'hive_ignited' | 'hive_founder';

export interface IAward extends Document {
  userId: Types.ObjectId;
  type: AwardType;
  zoneId: string;
  stingId: Types.ObjectId;
  hiveId: Types.ObjectId | null;
  center: {
    type: 'Point';
    coordinates: [number, number];
  };
  createdAt: Date;
}

const awardSchema = new Schema<IAward>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    type: {
      type: String,
      enum: ['zone_first', 'zone_revival', 'hive_ignited', 'hive_founder'],
      required: true,
    },
    zoneId: { type: String, required: true },
    stingId: { type: Schema.Types.ObjectId, ref: 'Sting', required: true },
    hiveId: { type: Schema.Types.ObjectId, ref: 'Hive', default: null },
    center: {
      type: {
        type: String,
        enum: ['Point'],
        required: true,
      },
      coordinates: {
        type: [Number],
        required: true,
      },
    },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

awardSchema.index({ type: 1, zoneId: 1 }, { unique: true, partialFilterExpression: { type: 'zone_first' } });
awardSchema.index(
  { type: 1, hiveId: 1 },
  { unique: true, partialFilterExpression: { type: { $in: ['hive_ignited', 'hive_founder'] } } },
);
awardSchema.index({ userId: 1, createdAt: -1 });
awardSchema.index({ type: 1, zoneId: 1, createdAt: -1 });

export default mongoose.model<IAward>('Award', awardSchema);
