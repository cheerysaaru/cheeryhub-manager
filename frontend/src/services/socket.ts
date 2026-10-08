import { io, Socket } from "socket.io-client";

let socket: Socket | null = null;

const ALLOWED_PROTOCOLS = ["http:", "https:", "ws:", "wss:"];

/** Normalized socket URL, or null when realtime must stay off. */
export function resolveSocketUrl(
  configured: string | undefined,
): string | null {
  const value = configured?.trim();
  if (!value) return null;
  try {
    const url = new URL(value);
    if (!ALLOWED_PROTOCOLS.includes(url.protocol) || !url.hostname) return null;
    if (url.search || url.hash) return null;
    return url.toString();
  } catch {
    console.error(
      "[Socket] VITE_SOCKET_URL must be an absolute http(s)/ws(s) URL; realtime is disabled.",
    );
    return null;
  }
}

export function connectSocket(_userId: string): Socket | null {
  if (socket) return socket;

  const socketUrl = resolveSocketUrl(import.meta.env.VITE_SOCKET_URL);
  if (!socketUrl) return null;

  try {
    socket = io(socketUrl, {
      withCredentials: true,
      transports: ["websocket", "polling"],
      reconnection: true,
      reconnectionAttempts: 3,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      timeout: 5000,
    });
  } catch (error) {
    // A realtime client must never take the app down with it.
    console.error("[Socket] Could not create the realtime client:", error);
    socket = null;
    return null;
  }

  socket.on("connect", () => {
    console.log("[Socket] Connected:", socket?.id);
  });

  socket.on("disconnect", (reason: string) => {
    console.log("[Socket] Disconnected:", reason);
  });

  socket.on("connect_error", (error: Error) => {
    console.error("[Socket] Connection error:", error.message);
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

export function onSocketEvent<T>(
  event: string,
  handler: (data: T) => void,
): () => void {
  const s = socket;
  if (!s) return () => {};
  s.on(event, handler);
  return () => s.off(event, handler);
}

export function emitSocketEvent(event: string, data: unknown): void {
  socket?.emit(event, data);
}
