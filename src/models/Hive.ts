import mongoose, { Document, Schema } from 'mongoose';

export interface IHive extends Document {
  center: {
    type: 'Point';
    coordinates: [number, number];
  };
  radiusM: number;
  activeStingsCount: number;
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
  },
  { timestamps: true },
);

hiveSchema.index({ center: '2dsphere' });

export default mongoose.model<IHive>('Hive', hiveSchema);
