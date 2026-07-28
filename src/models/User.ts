import mongoose, { Document, Schema } from 'mongoose';

export interface IUser extends Document {
  email: string;
  passwordHash: string;
  username: string;
  avatarUrl: string | null;
  createdAt: Date;
  updatedAt: Date;
}

const userSchema = new Schema<IUser>(
  {
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true },
    username: { type: String, required: true, unique: true, trim: true },
    avatarUrl: { type: String, default: null },
  },
  {
    timestamps: true,
  },
);

export default mongoose.model<IUser>('User', userSchema);
