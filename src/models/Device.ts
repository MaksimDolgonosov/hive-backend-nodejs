import mongoose, { Document, Schema, Types } from 'mongoose';

export type DevicePlatform = 'ios' | 'android';
export type DeviceLocale = 'ru' | 'en';

export interface IDevice extends Document {
  userId: Types.ObjectId;
  expoPushToken: string;
  platform: DevicePlatform;
  deviceId: string;
  locale: DeviceLocale;
  timezone: string;
  lastSeenAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

const deviceSchema = new Schema<IDevice>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    expoPushToken: { type: String, required: true, unique: true },
    platform: { type: String, enum: ['ios', 'android'], required: true },
    deviceId: { type: String, required: true },
    locale: { type: String, enum: ['ru', 'en'], default: 'ru' },
    timezone: { type: String, default: 'UTC' },
    lastSeenAt: { type: Date, default: () => new Date() },
  },
  { timestamps: true },
);

deviceSchema.index({ userId: 1, deviceId: 1 }, { unique: true });

export default mongoose.model<IDevice>('Device', deviceSchema);
