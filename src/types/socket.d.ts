import { Socket } from 'socket.io';

declare module 'socket.io' {
  interface SocketData {
    userId: string;
  }
}

export type AuthenticatedSocket = Socket;
