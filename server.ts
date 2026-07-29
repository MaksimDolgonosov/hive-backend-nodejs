import http from 'http';
import app from './src/app';
import connectDb from './src/config/db';
import env from './src/config/env';
import { startStingDeletionWatcher } from './src/services/hive-cleanup.service';
import { initRealtime } from './src/sockets/realtime';

async function start(): Promise<void> {
  await connectDb();
  await startStingDeletionWatcher();

  const server = http.createServer(app);
  initRealtime(server);

  server.listen(env.port, () => {
    console.log(`Сервер запущен на порту ${env.port}`);
  });
}

start().catch((err) => {
  console.error('Не удалось запустить сервер:', err);
  process.exit(1);
});
