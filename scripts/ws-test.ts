import dotenv from 'dotenv';
import { io } from 'socket.io-client';

dotenv.config();

const token = process.argv[2] || process.env.WS_TEST_TOKEN;
const port = process.env.PORT || '3000';
const baseUrl = process.env.BASE_URL || `http://localhost:${port}`;

if (!token) {
  console.error('Нужен accessToken.');
  console.error('');
  console.error('  npm run ws:test -- <accessToken>');
  console.error('  или WS_TEST_TOKEN=... npm run ws:test');
  console.error('');
  console.error('Токен берётся из ответа POST /api/v1/auth/login');
  process.exit(1);
}

const bbox = {
  swLat: Number(process.env.WS_TEST_SW_LAT ?? 53.9),
  swLng: Number(process.env.WS_TEST_SW_LNG ?? 30.3),
  neLat: Number(process.env.WS_TEST_NE_LAT ?? 54.0),
  neLng: Number(process.env.WS_TEST_NE_LNG ?? 30.4),
};

console.log(`Подключение к ${baseUrl} (path: /ws)...`);

const socket = io(baseUrl, {
  path: '/ws',
  query: { token },
  transports: ['websocket', 'polling'],
});

socket.on('connect', () => {
  console.log('✓ connected, socket.id =', socket.id);

  socket.emit('message', {
    type: 'subscribe:region',
    payload: bbox,
  });
  console.log('→ subscribe:region', bbox);

  socket.emit('message', { type: 'ping', payload: {} });
  console.log('→ ping');
  console.log('');
  console.log('Слушаем события (Ctrl+C для выхода)...');
});

socket.on('message', (envelope: unknown) => {
  console.log('←', JSON.stringify(envelope, null, 2));
});

socket.on('connect_error', (err: Error) => {
  console.error('✗ connect_error:', err.message);
  console.error('Проверь: сервер запущен (npm run dev) и токен не истёк');
  process.exit(1);
});

socket.on('disconnect', (reason: string) => {
  console.log('disconnected:', reason);
});
