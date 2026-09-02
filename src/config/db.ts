import mongoose from 'mongoose';
import env from './env';
import User from '../models/User';

async function backfillEmailVerification(): Promise<void> {
  await User.updateMany(
    { $or: [{ emailVerified: { $exists: false } }, { status: { $exists: false } }] },
    { $set: { emailVerified: true, status: 'active' } },
  );
}

async function connectDb(): Promise<void> {
  await mongoose.connect(env.mongoUri);
  await backfillEmailVerification();
  console.log('MongoDB подключена');
}

export default connectDb;
