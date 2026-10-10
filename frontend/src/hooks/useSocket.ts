import { useCallback, useEffect, useRef, useState } from "react";
import {
  connectSocket,
  disconnectSocket,
  getSocket,
  onSocketEvent,
  emitSocketEvent,
} from "../services/socket";

export function useSocket(userId: string | null) {
  const [connected, setConnected] = useState(false);
  const handlersRef = useRef<(() => void)[]>([]);

  useEffect(() => {
    if (!userId) {
      disconnectSocket();
      void Promise.resolve().then(() => setConnected(false));
      return;
    }

    connectSocket(userId);
    // No actual socket returned in stub, so connected stays false
  }, [userId]);

  const on = useCallback(
    <T>(event: string, handler: (data: T) => void): (() => void) => {
      const cleanup = onSocketEvent(event, handler);
      handlersRef.current.push(cleanup);
      return cleanup;
    },
    [],
  );

  const emit = useCallback((event: string, data: unknown) => {
    emitSocketEvent(event, data);
  }, []);

  return { connected, on, emit, socket: getSocket() };
}
