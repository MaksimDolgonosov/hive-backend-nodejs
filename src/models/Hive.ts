import mongoose, { Document, Schema, Types } from 'mongoose';

import { HiveStage } from '../utils/activation';

export interface IHive extends Document {
  center: {
    type: 'Point';
    coordinates: [number, number];
  };
  radiusM: number;
  activeStingsCount: number;
  activationCount: number;
  contributorsCount: number;
  stage: HiveStage;
  founderUserId: Types.ObjectId | null;
  placeId: Types.ObjectId | null;
  ignitedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const hiveSchema = new Schema<IHive>(
  {
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
    radiusM: { type: Number, default: 150 },
    activeStingsCount: { type: Number, default: 0 },
    activationCount: { type: Number, default: 0 },
    contributorsCount: { type: Number, default: 0 },
    stage: { type: String, enum: ['seed', 'hive'], default: 'seed' },
    founderUserId: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    placeId: { type: Schema.Types.ObjectId, ref: 'Place', default: null },
    ignitedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

hiveSchema.index({ center: '2dsphere' });
hiveSchema.index({ stage: 1 });

export default mongoose.model<IHive>('Hive', hiveSchema);
