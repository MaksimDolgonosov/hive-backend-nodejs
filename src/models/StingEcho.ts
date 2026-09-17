import mongoose, { Document, Schema } from 'mongoose';

export interface IStingEcho extends Document {
  cellId: string;
  zoneId: string;
  center: {
    type: 'Point';
    coordinates: [number, number];
  };
  count: number;
  lastSeenAt: Date;
  expiresAt: Date;
}

const stingEchoSchema = new Schema<IStingEcho>(
  {
    cellId: { type: String, required: true, unique: true },
    zoneId: { type: String, required: true, index: true },
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
    count: { type: Number, default: 0 },
    lastSeenAt: { type: Date, required: true },
    expiresAt: { type: Date, required: true },
  },
  { timestamps: false },
);

stingEchoSchema.index({ center: '2dsphere' });
stingEchoSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export default mongoose.model<IStingEcho>('StingEcho', stingEchoSchema);
