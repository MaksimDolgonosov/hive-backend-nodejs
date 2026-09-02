import mongoose, { Document, Schema, Types } from 'mongoose';

export type OtpPurpose = 'register' | 'password_reset';

export interface IEmailOtpChallenge extends Document {
  userId: Types.ObjectId | null;
  email: string;
  purpose: OtpPurpose;
  codeHash: string;
  expiresAt: Date;
  attempts: number;
  consumedAt: Date | null;
  lastSentAt: Date;
  createdAt: Date;
}

const emailOtpChallengeSchema = new Schema<IEmailOtpChallenge>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    email: { type: String, required: true, lowercase: true, trim: true },
    purpose: { type: String, required: true, enum: ['register', 'password_reset'] },
    codeHash: { type: String, required: true },
    expiresAt: { type: Date, required: true },
    attempts: { type: Number, default: 0 },
    consumedAt: { type: Date, default: null },
    lastSentAt: { type: Date, required: true },
  },
  {
    timestamps: { createdAt: true, updatedAt: false },
  },
);

emailOtpChallengeSchema.index({ email: 1, purpose: 1, consumedAt: 1 });
emailOtpChallengeSchema.index({ email: 1, purpose: 1, createdAt: -1 });

export default mongoose.model<IEmailOtpChallenge>('EmailOtpChallenge', emailOtpChallengeSchema);
