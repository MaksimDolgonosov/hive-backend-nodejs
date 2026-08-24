import mongoose, { Document, Schema } from 'mongoose';

import { EMPTY_SOCIAL_LINKS, UserSocialLinks } from '../types/profile-user';

export interface IUser extends Document {
  email: string;
  passwordHash: string | null;
  googleId: string | null;
  username: string;
  avatarUrl: string | null;
  bio: string | null;
  socialLinks: UserSocialLinks;
  createdAt: Date;
  updatedAt: Date;
}

const socialLinksSchema = new Schema<UserSocialLinks>(
  {
    instagram: { type: String, default: null, maxlength: 200 },
    telegram: { type: String, default: null, maxlength: 200 },
    tiktok: { type: String, default: null, maxlength: 200 },
    youtube: { type: String, default: null, maxlength: 200 },
    website: { type: String, default: null, maxlength: 200 },
  },
  { _id: false },
);

const userSchema = new Schema<IUser>(
  {
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, default: null },
    googleId: { type: String, default: null, unique: true, sparse: true },
    username: { type: String, required: true, unique: true, trim: true },
    avatarUrl: { type: String, default: null },
    bio: { type: String, default: null, maxlength: 280 },
    socialLinks: { type: socialLinksSchema, default: () => ({ ...EMPTY_SOCIAL_LINKS }) },
  },
  {
    timestamps: true,
  },
);

export default mongoose.model<IUser>('User', userSchema);
