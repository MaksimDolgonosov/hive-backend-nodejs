import app from './src/app';
import connectDb from './src/config/db';
import env from './src/config/env';

async function start(): Promise<void> {
  await connectDb();
  app.listen(env.port, () => {
    console.log(`Сервер запущен на порту ${env.port}`);
  });
}

start().catch((err) => {
  console.error('Не удалось запустить сервер:', err);
  process.exit(1);
});
