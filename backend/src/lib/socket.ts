import type { Server } from 'http';
import { Server as SocketIOServer } from 'socket.io';
import type { Socket } from 'socket.io';
import { verifyToken } from '../utils/auth';
import { prisma } from './prisma';

let io: SocketIOServer | null = null;

export function initSocket(server: Server): SocketIOServer {
  const allowedOrigins = (process.env.FRONTEND_URL ?? 'http://localhost:5173').split(',').map((o) => o.trim());

  io = new SocketIOServer(server, {
    cors: {
      origin: allowedOrigins,
      credentials: true,
    },
    transports: ['websocket', 'polling'],
  });

  io.use(async (socket, next) => {
    const token =
      (socket.handshake.auth?.token as string | undefined) ??
      (socket.handshake.headers.cookie as string | undefined)?.match(/auth_token=([^;]+)/)?.[1];
    if (!token) return next(new Error('Authentication required'));
    const payload = verifyToken(token);
    if (!payload) return next(new Error('Invalid or expired session'));
    try {
      const user = await prisma.user.findUnique({
        where: { id: payload.userId },
        select: { status: true },
      });
      if (!user || user.status !== 'ACTIVE') {
        return next(new Error('Invalid or expired session'));
      }
    } catch {
      return next(new Error('Invalid or expired session'));
    }
    (socket.data as { userId: string }).userId = payload.userId;
    next();
  });

  io.on('connection', (socket) => {
    const userId = (socket.data as { userId: string }).userId;
    socket.join(`user:${userId}`);
    console.log(`[Socket] User connected: ${userId}`);

    socket.on('disconnect', () => {
      console.log(`[Socket] User disconnected: ${userId}`);
    });
  });

  return io;
}

export function emitToUser(userId: string, event: string, data: unknown): void {
  io?.to(`user:${userId}`).emit(event, data);
}

export function getIO(): SocketIOServer | null {
  return io;
}