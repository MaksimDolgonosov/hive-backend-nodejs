import mongoose, { Document, Schema, Types } from 'mongoose';

export interface IStingReaction extends Document {
  stingId: Types.ObjectId;
  userId: Types.ObjectId;
  type: 'like';
  expiresAt: Date;
  createdAt: Date;
}

const stingReactionSchema = new Schema<IStingReaction>(
  {
    stingId: { type: Schema.Types.ObjectId, ref: 'Sting', required: true },
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    type: { type: String, enum: ['like'], required: true, default: 'like' },
    expiresAt: { type: Date, required: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

stingReactionSchema.index({ stingId: 1, userId: 1 }, { unique: true });
stingReactionSchema.index({ userId: 1, createdAt: -1 });
stingReactionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export default mongoose.model<IStingReaction>('StingReaction', stingReactionSchema);
