import type { AppRequest } from "../types/index";
import { verify } from "../utils/jwt";
import { errorResponse } from "../utils/response";

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
    return errorResponse("Unauthorized", 401, "AUTH_REQUIRED");
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
    const role = typeof payload.role === "string" ? payload.role : undefined;
    const admin = payload.admin === true;
    req.user = {
      id: payload.id as string,
      email: payload.email as string,
      role,
      admin,
    };
    return req;
  } catch {
    return errorResponse("Unauthorized", 401, "AUTH_REQUIRED");
  }
}

// Export authMiddleware for router usage
export const authMiddleware = verifyAuth;
