// Simple event emitter for cross-hook communication
type EventHandler = (data?: any) => void;

const eventHandlers = new Map<string, Set<EventHandler>>();

export function emit(event: string, data?: any): void {
  const handlers = eventHandlers.get(event);
  if (handlers) {
    handlers.forEach((handler) => {
      try {
        handler(data);
      } catch (error) {
        console.error(`Error in event handler for ${event}:`, error);
      }
    });
  }
}

export function on(event: string, handler: (data?: any) => void): () => void {
  if (!eventHandlers.has(event)) {
    eventHandlers.set(event, new Set());
  }
  const handlers = eventHandlers.get(event)!;
  handlers.add(handler);
  return () => {
    handlers.delete(handler);
  };
}

export function off(event: string, handler: (data?: any) => void): void {
  const handlers = eventHandlers.get(event);
  if (handlers) {
    handlers.delete(handler);
  }
}