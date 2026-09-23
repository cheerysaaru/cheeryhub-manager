import { io, Socket } from 'socket.io-client';

let socket: Socket | null = null;

export function connectSocket(userId: string): Socket {
  if (socket?.connected) return socket;

  const configured = import.meta.env.VITE_API_URL;
  const backendUrl =
    configured && configured.startsWith('http')
      ? configured.replace('/api', '')
      : window.location.origin;

  socket = io(backendUrl, {
    withCredentials: true,
    transports: ['websocket', 'polling'],
    reconnection: true,
    reconnectionAttempts: 10,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000,
  });

  socket.on('connect', () => {
    console.log('[Socket] Connected:', socket?.id);
  });

  socket.on('disconnect', (reason: string) => {
    console.log('[Socket] Disconnected:', reason);
  });

  socket.on('connect_error', (error: Error) => {
    console.error('[Socket] Connection error:', error.message);
  });

  return socket;
}

export function disconnectSocket(): void {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
}

export function getSocket(): Socket | null {
  return socket;
}

export function onSocketEvent<T>(event: string, handler: (data: T) => void): () => void {
  const s = socket;
  if (!s) return () => {};
  s.on(event, handler);
  return () => s.off(event, handler);
}

export function emitSocketEvent(event: string, data: unknown): void {
  socket?.emit(event, data);
}