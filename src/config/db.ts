import mongoose from 'mongoose';
import env from './env';
import User from '../models/User';
import Sting from '../models/Sting';

async function backfillEmailVerification(): Promise<void> {
  await User.updateMany(
    { $or: [{ emailVerified: { $exists: false } }, { status: { $exists: false } }] },
    { $set: { emailVerified: true, status: 'active' } },
  );
}

async function bootstrapAdmins(): Promise<void> {
  if (env.adminEmails.length === 0) {
    return;
  }
  await User.updateMany(
    { email: { $in: env.adminEmails } },
    { $set: { role: 'admin' } },
  );
}

async function dropLegacyStingTtlIndex(): Promise<void> {
  try {
    const indexes = await Sting.collection.indexes();
    const ttl = indexes.find(
      (index) =>
        Boolean((index.key as { expiresAt?: number }).expiresAt) &&
        typeof index.expireAfterSeconds === 'number' &&
        index.name === 'expiresAt_1',
    );
    if (ttl?.name) {
      await Sting.collection.dropIndex(ttl.name);
      console.log('Dropped legacy TTL index on stings.expiresAt');
    }
  } catch (error) {
    console.warn('Не удалось проверить TTL-индекс stings:', (error as Error).message);
  }
}

async function connectDb(): Promise<void> {
  await mongoose.connect(env.mongoUri);
  await backfillEmailVerification();
  await bootstrapAdmins();
  await dropLegacyStingTtlIndex();
  console.log('MongoDB подключена');
}

export default connectDb;
