import type { AppRequest } from "../types/index";
import { verify } from "../utils/jwt";

// Export types and functions
export type { AppRequest } from "../types/index";
export async function verifyAuth(
  req: AppRequest,
): Promise<AppRequest | Response> {
  const authHeader = req.headers.get("Authorization");
  const cookie = req.headers.get("cookie");

  let token: string | null = null;

  if (authHeader?.startsWith("Bearer ")) {
    token = authHeader.slice(7);
  } else if (cookie) {
    const match = cookie.match(/auth_token=([^;]+)/);
    token = match ? match[1] : null;
  }

  if (!token) {
    return new Response(
      JSON.stringify({ error: "Unauthorized", code: "AUTH_REQUIRED" }),
      { status: 401, headers: { "Content-Type": "application/json" } },
    );
  }

  try {
    const payload = verify(token, req.env.JWT_SECRET);
    if (
      !payload ||
      typeof payload !== "object" ||
      !("id" in payload) ||
      !("email" in payload)
    ) {
      throw new Error("Invalid token payload");
    }
    req.user = { id: payload.id as string, email: payload.email as string };
    return req;
  } catch {
    return new Response(
      JSON.stringify({ error: "Unauthorized", code: "AUTH_REQUIRED" }),
      { status: 401, headers: { "Content-Type": "application/json" } },
    );
  }
}

// Export authMiddleware for router usage
export const authMiddleware = verifyAuth;
