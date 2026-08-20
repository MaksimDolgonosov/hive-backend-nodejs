import mongoose, { Document, Schema, Types } from 'mongoose';

export interface ISting extends Document {
  authorId: Types.ObjectId;
  hiveId: Types.ObjectId | null;
  imageUrl: string;
  thumbnailUrl: string;
  location: {
    type: 'Point';
    coordinates: [number, number];
  };
  accuracyM: number | null;
  capturedAt: Date;
  expiresAt: Date;
  reactionsCount: number;
  comment: string | null;
  idempotencyKey: string | null;
  createdAt: Date;
  updatedAt: Date;
}

const stingSchema = new Schema<ISting>(
  {
    authorId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    hiveId: { type: Schema.Types.ObjectId, ref: 'Hive', default: null },
    imageUrl: { type: String, required: true },
    thumbnailUrl: { type: String, required: true },
    location: {
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
    accuracyM: { type: Number, default: null },
    capturedAt: { type: Date, required: true },
    expiresAt: { type: Date, required: true },
    reactionsCount: { type: Number, default: 0 },
    comment: { type: String, default: null, maxlength: 280 },
    idempotencyKey: { type: String, default: null },
  },
  { timestamps: true },
);

stingSchema.index({ location: '2dsphere' });
stingSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
stingSchema.index({ authorId: 1, createdAt: -1 });
stingSchema.index({ hiveId: 1 }, { sparse: true });
stingSchema.index({ authorId: 1, idempotencyKey: 1 }, { unique: true, sparse: true });

export default mongoose.model<ISting>('Sting', stingSchema);
