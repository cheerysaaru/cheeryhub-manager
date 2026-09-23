import { useEffect, useRef, useState } from 'react';
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

    return () => {
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      handlersRef.current.forEach((cleanup) => cleanup());
      handlersRef.current = [];
    };
  }, [userId]);

  const on = <T>(event: string, handler: (data: T) => void) => {
    const cleanup = onSocketEvent(event, handler);
    handlersRef.current.push(cleanup);
    return cleanup;
  };

  const emit = (event: string, data: unknown) => {
    emitSocketEvent(event, data);
  };

  return { connected, on, emit, socket: getSocket() };
}