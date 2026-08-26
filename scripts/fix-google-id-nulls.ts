import mongoose from 'mongoose';

import env from '../src/config/env';
import User from '../src/models/User';

async function main(): Promise<void> {
  await mongoose.connect(env.mongoUri);

  const result = await User.updateMany(
    { $or: [{ googleId: null }, { googleId: '' }] },
    { $unset: { googleId: '' } },
  );

  console.log(`Unset googleId on ${result.modifiedCount} user(s).`);
  await mongoose.disconnect();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
