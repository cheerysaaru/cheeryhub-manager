import { useCallback, useEffect, useRef, useState } from 'react';
import { connectSocket, disconnectSocket, getSocket, onSocketEvent, emitSocketEvent } from '../services/socket';

export function useSocket(userId: string | null) {
  const [connected, setConnected] = useState(false);
  const handlersRef = useRef<(() => void)[]>([]);

  useEffect(() => {
    if (!userId) {
      disconnectSocket();
      setConnected(false);
      return;
    }

    const socket = connectSocket(userId);

    const onConnect = () => setConnected(true);
    const onDisconnect = () => setConnected(false);

    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    if (socket.connected) setConnected(true);

    return () => {
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      handlersRef.current.forEach((cleanup) => cleanup());
      handlersRef.current = [];
    };
  }, [userId]);

  const on = useCallback(<T,>(event: string, handler: (data: T) => void): (() => void) => {
    const cleanup = onSocketEvent(event, handler);
    handlersRef.current.push(cleanup);
    return cleanup;
  }, []);

  const emit = useCallback((event: string, data: unknown) => {
    emitSocketEvent(event, data);
  }, []);

  return { connected, on, emit, socket: getSocket() };
}
