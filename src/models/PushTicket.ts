import mongoose, { Document, Schema, Types } from 'mongoose';

export interface IPushTicket extends Document {
  ticketId: string;
  deviceId: Types.ObjectId;
  userId: Types.ObjectId;
  createdAt: Date;
}

const pushTicketSchema = new Schema<IPushTicket>(
  {
    ticketId: { type: String, required: true, unique: true },
    deviceId: { type: Schema.Types.ObjectId, ref: 'Device', required: true },
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

pushTicketSchema.index({ createdAt: 1 }, { expireAfterSeconds: 48 * 60 * 60 });

export default mongoose.model<IPushTicket>('PushTicket', pushTicketSchema);
