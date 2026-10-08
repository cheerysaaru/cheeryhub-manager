import { redactSecrets } from "../env";

function requestIdOr(value: string | undefined): string | null {
  return value && value.trim() ? value.trim() : null;
}

export function newRequestId(): string {
  try {
    return globalThis.crypto.randomUUID();
  } catch {
    return `req-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  }
}

function serialize(
  level: string,
  message: string,
  requestId: string | undefined,
  extra?: Record<string, unknown>,
): string {
  const line = JSON.stringify({
    level,
    time: new Date().toISOString(),
    requestId: requestIdOr(requestId),
    message,
    ...(extra ?? {}),
  });
  return redactSecrets(line);
}

/** Detailed errors stay on the server; the payload is scrubbed of secret values. */
export function logError(
  requestId: string | undefined,
  error: unknown,
  context?: Record<string, unknown>,
): void {
  const err = error instanceof Error ? error : new Error(String(error));
  console.error(
    serialize("error", err.message, requestId, {
      name: err.name,
      stack: err.stack,
      ...context,
    }),
  );
}

export function logWarn(
  message: string,
  requestId?: string,
  context?: Record<string, unknown>,
): void {
  console.warn(serialize("warn", message, requestId, context));
}
