import mongoose, { Document, Schema, Types } from 'mongoose';

export interface IInvite extends Document {
  code: string;
  ownerId: Types.ObjectId;
  zoneId: string | null;
  usesLimit: number;
  usesCount: number;
  expiresAt: Date;
  createdAt: Date;
}

const inviteSchema = new Schema<IInvite>(
  {
    code: { type: String, required: true, unique: true, uppercase: true },
    ownerId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    zoneId: { type: String, default: null },
    usesLimit: { type: Number, default: 5 },
    usesCount: { type: Number, default: 0 },
    expiresAt: { type: Date, required: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

inviteSchema.index({ expiresAt: 1 });

export default mongoose.model<IInvite>('Invite', inviteSchema);
