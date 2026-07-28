import mongoose from 'mongoose';
import env from './env';

async function connectDb(): Promise<void> {
  await mongoose.connect(env.mongoUri);
  console.log('MongoDB подключена');
}

export default connectDb;
