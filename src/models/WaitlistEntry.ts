import mongoose, { Document, Schema } from 'mongoose';

export interface IWaitlistEntry extends Document {
  email: string;
  deviceId: string;
  zoneId: string;
  lat: number;
  lng: number;
  notifiedAt: Date | null;
  createdAt: Date;
}

const waitlistEntrySchema = new Schema<IWaitlistEntry>(
  {
    email: { type: String, required: true, lowercase: true, trim: true },
    deviceId: { type: String, required: true },
    zoneId: { type: String, required: true, index: true },
    lat: { type: Number, required: true },
    lng: { type: Number, required: true },
    notifiedAt: { type: Date, default: null },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

waitlistEntrySchema.index({ email: 1, zoneId: 1 }, { unique: true });
waitlistEntrySchema.index({ deviceId: 1, zoneId: 1 }, { unique: true });

export default mongoose.model<IWaitlistEntry>('WaitlistEntry', waitlistEntrySchema);
