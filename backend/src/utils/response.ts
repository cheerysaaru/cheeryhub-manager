const JSON_HEADERS = { "Content-Type": "application/json" };

export const ok = (data: unknown, status = 200) =>
  new Response(JSON.stringify({ data }), {
    status,
    headers: JSON_HEADERS,
  });

export const fail = (message: string, status = 400) =>
  new Response(JSON.stringify({ error: message }), {
    status,
    headers: JSON_HEADERS,
  });

/**
 * The one canonical API error shape: `{ error: { code, message } }`.
 * The top-level `code` mirror is kept so any consumer still reading the legacy
 * `{ error: string, code }` body keeps working during migration.
 */
export function errorResponse(
  message: string,
  status: number,
  code = `HTTP_${status}`,
): Response {
  return new Response(JSON.stringify({ error: { code, message }, code }), {
    status,
    headers: JSON_HEADERS,
  });
}
