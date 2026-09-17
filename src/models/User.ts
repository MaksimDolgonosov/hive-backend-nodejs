import mongoose, { Document, Schema, Types } from 'mongoose';

import { EMPTY_SOCIAL_LINKS, UserSocialLinks } from '../types/profile-user';

export type UserStatus = 'pending' | 'active' | 'disabled';
export type UserRole = 'user' | 'admin';
export type AccountType = 'personal' | 'partner' | 'official';

export interface NotificationSettings {
  reactions: boolean;
  nearbyActivity: boolean;
  campaigns: boolean;
  expiringSting: boolean;
  inviteAccepted: boolean;
}

export interface UserPrivacySettings {
  allowEcho: boolean;
  allowSharing: boolean;
}

export const DEFAULT_NOTIFICATION_SETTINGS: NotificationSettings = {
  reactions: true,
  nearbyActivity: true,
  campaigns: true,
  expiringSting: false,
  inviteAccepted: true,
};

export const DEFAULT_PRIVACY_SETTINGS: UserPrivacySettings = {
  allowEcho: true,
  allowSharing: true,
};

export interface IUser extends Document {
  email: string;
  passwordHash: string | null;
  googleId: string | null;
  username: string;
  avatarUrl: string | null;
  bio: string | null;
  socialLinks: UserSocialLinks;
  emailVerified: boolean;
  status: UserStatus;
  role: UserRole;
  accountType: AccountType;
  settings: UserPrivacySettings;
  notificationSettings: NotificationSettings;
  invitedByUserId: Types.ObjectId | null;
  invitedInviteCode: string | null;
  signupZoneId: string | null;
  inviteAcceptedCount: number;
  inviteUsesCount: number;
  inviteBonusGranted: boolean;
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

const privacySettingsSchema = new Schema<UserPrivacySettings>(
  {
    allowEcho: { type: Boolean, default: true },
    allowSharing: { type: Boolean, default: true },
  },
  { _id: false },
);

const notificationSettingsSchema = new Schema<NotificationSettings>(
  {
    reactions: { type: Boolean, default: true },
    nearbyActivity: { type: Boolean, default: true },
    campaigns: { type: Boolean, default: true },
    expiringSting: { type: Boolean, default: false },
    inviteAccepted: { type: Boolean, default: true },
  },
  { _id: false },
);

const userSchema = new Schema<IUser>(
  {
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, default: null },
    googleId: { type: String, unique: true, sparse: true },
    username: { type: String, required: true, unique: true, trim: true },
    avatarUrl: { type: String, default: null },
    bio: { type: String, default: null, maxlength: 280 },
    socialLinks: { type: socialLinksSchema, default: () => ({ ...EMPTY_SOCIAL_LINKS }) },
    emailVerified: { type: Boolean, default: false },
    status: {
      type: String,
      enum: ['pending', 'active', 'disabled'],
      default: 'pending',
    },
    role: { type: String, enum: ['user', 'admin'], default: 'user' },
    accountType: { type: String, enum: ['personal', 'partner', 'official'], default: 'personal' },
    settings: { type: privacySettingsSchema, default: () => ({ ...DEFAULT_PRIVACY_SETTINGS }) },
    notificationSettings: {
      type: notificationSettingsSchema,
      default: () => ({ ...DEFAULT_NOTIFICATION_SETTINGS }),
    },
    invitedByUserId: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    invitedInviteCode: { type: String, default: null },
    signupZoneId: { type: String, default: null },
    inviteAcceptedCount: { type: Number, default: 0 },
    inviteUsesCount: { type: Number, default: 0 },
    inviteBonusGranted: { type: Boolean, default: false },
  },
  {
    timestamps: true,
  },
);

export default mongoose.model<IUser>('User', userSchema);
