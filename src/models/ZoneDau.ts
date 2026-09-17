import mongoose, { Document, Schema, Types } from 'mongoose';

export interface IZoneDau extends Document {
  zoneId: string;
  userId: Types.ObjectId;
  day: Date;
  createdAt: Date;
}

const zoneDauSchema = new Schema<IZoneDau>(
  {
    zoneId: { type: String, required: true },
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    day: { type: Date, required: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

zoneDauSchema.index({ zoneId: 1, userId: 1, day: 1 }, { unique: true });
zoneDauSchema.index({ zoneId: 1, day: 1 });
zoneDauSchema.index({ createdAt: 1 }, { expireAfterSeconds: 40 * 24 * 60 * 60 });

export default mongoose.model<IZoneDau>('ZoneDau', zoneDauSchema);
