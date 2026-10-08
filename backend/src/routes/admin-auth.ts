import type { AppRequest } from "../types/index";
import { sign } from "../utils/jwt";
import { errorResponse } from "../utils/response";

interface AdminLoginPayload {
  username?: string;
  password?: string;
}

const ADMIN_COOKIE = "auth_token";

/** Constant-time string compare: no early exit on the first mismatch. */
function safeEqual(a: string, b: string): boolean {
  const len = Math.max(a.length, b.length);
  let diff = a.length === b.length ? 0 : 1;
  for (let i = 0; i < len; i++) {
    diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  }
  return diff === 0;
}

/**
 * Env-based admin sign-in. Credentials live in the ADMIN_USERNAME /
 * ADMIN_PASSWORD worker secrets (never in the frontend). The admin is a
 * distinct principal and is not stored in the User table.
 */
export async function adminLogin(req: AppRequest): Promise<Response> {
  const { username, password } = (req.body ?? {}) as AdminLoginPayload;
  if (typeof username !== "string" || typeof password !== "string") {
    return errorResponse(
      "Username and password are required",
      400,
      "INVALID_REQUEST",
    );
  }

  const expectedUser = req.env.ADMIN_USERNAME;
  const expectedPass = req.env.ADMIN_PASSWORD;
  if (!expectedUser || !expectedPass) {
    return errorResponse(
      "Admin login is not configured",
      500,
      "INTERNAL_ERROR",
    );
  }

  if (
    !safeEqual(username, expectedUser) ||
    !safeEqual(password, expectedPass)
  ) {
    return errorResponse("Invalid admin credentials", 401, "AUTH_REQUIRED");
  }

  const token = sign(
    { id: "admin", email: username, role: "ADMIN", admin: true },
    req.env.JWT_SECRET || "secret",
  );

  return new Response(
    JSON.stringify({
      data: {
        user: { id: "admin", name: "Admin", email: username, role: "ADMIN" },
        token,
      },
    }),
    {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Set-Cookie": `${ADMIN_COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=604800`,
      },
    },
  );
}
