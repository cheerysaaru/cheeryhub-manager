import type { AppRequest } from "../types/index";

export function corsMiddleware(
  req: AppRequest,
): AppRequest | Response | undefined {
  const origin = (req.headers as any)?.get?.("Origin") || "";
  const frontendUrls =
    req.env?.FRONTEND_URL?.split(",").map((u) => u.trim()) || [];

  const allowedOrigins = [
    "https://cheeryhub.space",
    "https://www.cheeryhub.space",
    "https://cheerysaaru.github.io",
    "http://localhost:3000",
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "http://127.0.0.1:3000",
    ...frontendUrls,
  ];

  const isOriginAllowed = allowedOrigins.some(
    (allowed) => origin === allowed || origin.endsWith(allowed),
  );

  const responseHeaders: Record<string, string> = {
    "Access-Control-Allow-Origin": isOriginAllowed
      ? origin
      : "https://cheeryhub.space",
    "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, Cookie",
    "Access-Control-Allow-Credentials": "true",
    "Access-Control-Max-Age": "86400",
  };

  // Handle OPTIONS requests
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: responseHeaders });
  }

  // Store headers for other middleware to use
  (req as any).corsHeaders = responseHeaders;
  return undefined;
}

export function withCors(response: Response, req: AppRequest): Response {
  const corsHeaders = (req as any).corsHeaders || {
    "Access-Control-Allow-Origin": "https://cheeryhub.space",
    "Access-Control-Allow-Credentials": "true",
  };

  const headers = new Headers(response.headers);
  Object.entries(corsHeaders).forEach(([key, value]) => {
    headers.set(key, String(value));
  });

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}
