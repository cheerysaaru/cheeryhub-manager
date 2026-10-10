export function resolveSocketUrl(url: string | undefined): string | null {
  return null;
}

export function connectSocket(_userId: string): any {
  return null;
}

export function disconnectSocket(): void {}

export function getSocket(): any {
  return null;
}

export function onSocketEvent(event: string, handler: (data?: any) => void): () => void {
  return () => {};
}

export function emitSocketEvent(event: string, data: unknown): void {
  // No-op
}
