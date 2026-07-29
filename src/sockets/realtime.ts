import { Server as HttpServer } from 'http';
import jwt from 'jsonwebtoken';
import { Server, Socket } from 'socket.io';
import env from '../config/env';
import User from '../models/User';
import { BboxQuery, PublicHive, PublicSting } from '../types/sting';
import { RealtimeEnvelope, RealtimeEventType } from '../types/realtime';
import { pointInBbox } from '../utils/geo';

const socketRegions = new Map<string, BboxQuery | null>();

let io: Server | null = null;

function isValidBbox(bbox: unknown): bbox is BboxQuery {
  if (!bbox || typeof bbox !== 'object') {
    return false;
  }
  const value = bbox as Record<string, unknown>;
  return (
    typeof value.swLat === 'number' &&
    typeof value.swLng === 'number' &&
    typeof value.neLat === 'number' &&
    typeof value.neLng === 'number'
  );
}

function emitEnvelope(socketId: string, envelope: RealtimeEnvelope): void {
  io?.to(socketId).emit('message', envelope);
}

function broadcastToPoint(lat: number, lng: number, envelope: RealtimeEnvelope): void {
  if (!io) {
    return;
  }

  for (const [socketId, bbox] of socketRegions) {
    if (bbox && pointInBbox(lat, lng, bbox)) {
      emitEnvelope(socketId, envelope);
    }
  }
}

export function emitStingCreated(sting: PublicSting): void {
  broadcastToPoint(sting.location.lat, sting.location.lng, {
    type: 'sting:created',
    payload: { sting },
  });
}

export function emitStingExpired(stingId: string, hiveId: string | null, lat: number, lng: number): void {
  broadcastToPoint(lat, lng, {
    type: 'sting:expired',
    payload: { stingId, hiveId },
  });
}

export function emitHiveUpdated(hive: PublicHive): void {
  broadcastToPoint(hive.center.lat, hive.center.lng, {
    type: 'hive:updated',
    payload: { hive },
  });
}

export function emitHiveDissolved(hiveId: string, lat: number, lng: number): void {
  broadcastToPoint(lat, lng, {
    type: 'hive:dissolved',
    payload: { hiveId },
  });
}

export function emitStingReaction(stingId: string, reactionsCount: number, lat: number, lng: number): void {
  broadcastToPoint(lat, lng, {
    type: 'sting:reaction',
    payload: { stingId, reactionsCount },
  });
}

async function authenticateSocket(socket: Socket): Promise<boolean> {
  const rawToken = socket.handshake.query.token;
  const token = typeof rawToken === 'string' ? rawToken : rawToken?.[0];

  if (!token) {
    return false;
  }

  try {
    const payload = jwt.verify(token, env.jwtAccessSecret) as { sub: string };
    const user = await User.findById(payload.sub);
    if (!user) {
      return false;
    }

    socket.data.userId = user.id;
    return true;
  } catch {
    return false;
  }
}

function handleClientMessage(socket: Socket, envelope: unknown): void {
  if (!envelope || typeof envelope !== 'object') {
    return;
  }

  const message = envelope as { type?: RealtimeEventType | string; payload?: unknown };

  switch (message.type) {
    case 'subscribe:region':
      if (isValidBbox(message.payload)) {
        socketRegions.set(socket.id, message.payload);
      }
      break;
    case 'unsubscribe:region':
      socketRegions.set(socket.id, null);
      break;
    case 'ping':
      emitEnvelope(socket.id, { type: 'pong', payload: {} });
      break;
    default:
      break;
  }
}

export function initRealtime(httpServer: HttpServer): Server {
  io = new Server(httpServer, {
    path: '/ws',
    cors: { origin: true },
    transports: ['websocket', 'polling'],
  });

  io.use(async (socket, next) => {
    const authenticated = await authenticateSocket(socket);
    if (!authenticated) {
      next(new Error('UNAUTHORIZED'));
      return;
    }
    next();
  });

  io.on('connection', (socket) => {
    socketRegions.set(socket.id, null);

    socket.on('message', (envelope: unknown) => {
      handleClientMessage(socket, envelope);
    });

    socket.on('disconnect', () => {
      socketRegions.delete(socket.id);
    });
  });

  console.log('Socket.io: /ws (websocket + polling)');
  return io;
}
