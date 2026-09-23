import mongoose, { Document, Schema, Types } from 'mongoose';

export type PlaceReportReason = 'not_a_place' | 'wrong_location' | 'stolen_photos' | 'spam' | 'other';
export type PlaceReportStatus = 'pending' | 'accepted' | 'dismissed';

export interface IPlaceReport extends Document {
  placeId: Types.ObjectId;
  mediaId: Types.ObjectId | null;
  reporterId: Types.ObjectId;
  reason: PlaceReportReason;
  comment: string | null;
  status: PlaceReportStatus;
  createdAt: Date;
  updatedAt: Date;
}

const placeReportSchema = new Schema<IPlaceReport>(
  {
    placeId: { type: Schema.Types.ObjectId, ref: 'Place', required: true },
    mediaId: { type: Schema.Types.ObjectId, ref: 'PlaceMedia', default: null },
    reporterId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    reason: {
      type: String,
      enum: ['not_a_place', 'wrong_location', 'stolen_photos', 'spam', 'other'],
      required: true,
    },
    comment: { type: String, default: null, maxlength: 500 },
    status: { type: String, enum: ['pending', 'accepted', 'dismissed'], default: 'pending' },
  },
  { timestamps: true },
);

placeReportSchema.index({ placeId: 1, status: 1, createdAt: -1 });
placeReportSchema.index({ reporterId: 1, createdAt: -1 });

export default mongoose.model<IPlaceReport>('PlaceReport', placeReportSchema);
