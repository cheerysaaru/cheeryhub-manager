import type { AppRequest } from "../types/index";
import { sign, verify } from "../utils/jwt";
import { hashPassword, verifyPassword } from "../utils/password";
import { Database } from "../db/client";

interface RegisterPayload {
  name: string;
  email: string;
  password: string;
  timezone?: string;
}

interface LoginPayload {
  email?: string;
  username?: string;
  password: string;
}

/** Constant-time string compare (no early exit on first mismatch). */
function safeEqual(a: string, b: string): boolean {
  const len = Math.max(a.length, b.length);
  let diff = a.length === b.length ? 0 : 1;
  for (let i = 0; i < len; i++) {
    diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  }
  return diff === 0;
}

/**
 * True only when the submitted id + password match the ADMIN_USERNAME and
 * ADMIN_PASSWORD worker secrets (constant-time). If either secret is missing,
 * logs server-side and returns false — the public never sees "not configured".
 */
export function matchesAdmin(
  env: { ADMIN_USERNAME?: string; ADMIN_PASSWORD?: string },
  id: string,
  password: string,
): boolean {
  const adminUser = env.ADMIN_USERNAME;
  const adminPass = env.ADMIN_PASSWORD;
  if (!adminUser || !adminPass) {
    console.error(
      "[auth] admin secrets not configured: set ADMIN_USERNAME and ADMIN_PASSWORD.",
    );
    return false;
  }
  const userOk = safeEqual(id, adminUser);
  const passOk = safeEqual(password, adminPass);
  return userOk && passOk;
}

/** One generic 401 for any bad login (never reveals which account exists). */
function unauthorizedLogin(): Response {
  return new Response(
    JSON.stringify({
      error: { code: "INVALID_REQUEST", message: "Invalid email or password" },
      code: "INVALID_REQUEST",
    }),
    { status: 401, headers: { "Content-Type": "application/json" } },
  );
}

export async function register(req: AppRequest): Promise<Response> {
  try {
    const body = req.body as RegisterPayload;
    const { name, email, password, timezone } = body;

    if (!name?.trim() || !email?.trim() || !password) {
      return new Response(
        JSON.stringify({
          error: "Missing required fields: name, email, password",
          code: "INVALID_REQUEST",
        }),
        { status: 400, headers: { "Content-Type": "application/json" } },
      );
    }

    if (password.length < 6) {
      return new Response(
        JSON.stringify({
          error: "Password must be at least 6 characters",
          code: "INVALID_REQUEST",
        }),
        { status: 400, headers: { "Content-Type": "application/json" } },
      );
    }

    try {
      const db = new Database(req.env.DB);
      const existing = await db.getUserByEmail(email.toLowerCase());

      if (existing) {
        return new Response(
          JSON.stringify({
            error: "Email already registered",
            code: "INVALID_REQUEST",
          }),
          { status: 409, headers: { "Content-Type": "application/json" } },
        );
      }
    } catch (dbError) {
      console.error(
        "[auth.register] getUserByEmail failed:",
        dbError instanceof Error ? dbError.message : String(dbError),
      );
      throw dbError;
    }

    let passwordHash: string;
    try {
      passwordHash = await hashPassword(password);
    } catch (hashError) {
      console.error(
        "[auth.register] hashPassword failed:",
        hashError instanceof Error ? hashError.message : String(hashError),
      );
      throw hashError;
    }

    let user;
    try {
      const db = new Database(req.env.DB);
      user = await db.createUser({
        name: name.trim(),
        email: email.toLowerCase(),
        passwordHash,
        timezone: timezone || "UTC",
      });
    } catch (createError) {
      console.error(
        "[auth.register] createUser failed:",
        createError instanceof Error
          ? createError.message
          : String(createError),
      );
      throw createError;
    }

    let token: string;
    try {
      token = sign(
        { id: user.id, email: user.email, role: user.role ?? "USER" },
        (req.env.JWT_SECRET || "secret") as string,
      );
    } catch (signError) {
      console.error(
        "[auth.register] sign token failed:",
        signError instanceof Error ? signError.message : String(signError),
      );
      throw signError;
    }

    return new Response(
      JSON.stringify({
        data: {
          user: {
            id: user.id,
            name: user.name,
            email: user.email,
            timezone: user.timezone,
          },
          token,
        },
      }),
      {
        status: 201,
        headers: {
          "Content-Type": "application/json",
          "Set-Cookie": `auth_token=${token}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=604800`,
        },
      },
    );
  } catch (error) {
    console.error(
      "[auth.register] caught error:",
      error instanceof Error ? error.message : String(error),
    );
    return new Response(
      JSON.stringify({
        error: "Registration failed",
        code: "INTERNAL_ERROR",
      }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }
}

export async function login(req: AppRequest): Promise<Response> {
  try {
    const body = req.body as LoginPayload;
    const idOrEmail = (body.email ?? body.username ?? "").toString();
    const password = body.password;

    if (!idOrEmail.trim() || !password) {
      return new Response(
        JSON.stringify({
          error: "Enter your username and password",
          code: "INVALID_REQUEST",
        }),
        { status: 400, headers: { "Content-Type": "application/json" } },
      );
    }

    // Admin signs in through the SAME form. On match, issue an admin session.
    // The admin has no User row by design.
    if (matchesAdmin(req.env, idOrEmail.trim(), password)) {
      const token = sign(
        { id: "admin", email: idOrEmail.trim(), role: "ADMIN", admin: true },
        req.env.JWT_SECRET || "secret",
      );
      return new Response(
        JSON.stringify({
          data: {
            user: {
              id: "admin",
              name: "Admin",
              email: idOrEmail.trim(),
              timezone: "UTC",
              role: "ADMIN",
            },
            token,
          },
        }),
        {
          status: 200,
          headers: {
            "Content-Type": "application/json",
            "Set-Cookie": `auth_token=${token}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=604800`,
          },
        },
      );
    }

    let user;
    try {
      const db = new Database(req.env.DB);
      user = await db.getUserByEmail(idOrEmail.toLowerCase());
    } catch (dbError) {
      console.error(
        "[auth.login] getUserByEmail failed:",
        dbError instanceof Error ? dbError.message : String(dbError),
      );
      throw dbError;
    }

    // Same generic message whether the id/password is wrong for a normal user
    // or for the admin, so the form never reveals which account exists.
    if (!user || !user.passwordHash) {
      return unauthorizedLogin();
    }

    let passwordValid: boolean;
    try {
      passwordValid = await verifyPassword(password, user.passwordHash);
    } catch (verifyError) {
      console.error(
        "[auth.login] verifyPassword failed:",
        verifyError instanceof Error
          ? verifyError.message
          : String(verifyError),
      );
      throw verifyError;
    }

    if (!passwordValid) {
      return unauthorizedLogin();
    }

    let token: string;
    try {
      token = sign(
        { id: user.id, email: user.email, role: user.role ?? "USER" },
        (req.env.JWT_SECRET || "secret") as string,
      );
    } catch (signError) {
      console.error(
        "[auth.login] sign token failed:",
        signError instanceof Error ? signError.message : String(signError),
      );
      throw signError;
    }

    // Update last login
    try {
      const db = new Database(req.env.DB);
      await db.updateUser(user.id, { lastLoginAt: new Date().toISOString() });
    } catch (updateError) {
      console.error(
        "[auth.login] updateUser failed:",
        updateError instanceof Error
          ? updateError.message
          : String(updateError),
      );
      // Don't throw - this is not critical for login success
    }

    return new Response(
      JSON.stringify({
        data: {
          user: {
            id: user.id,
            name: user.name,
            email: user.email,
            timezone: user.timezone,
          },
          token,
        },
      }),
      {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          "Set-Cookie": `auth_token=${token}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=604800`,
        },
      },
    );
  } catch (error) {
    console.error(
      "[auth.login] caught error:",
      error instanceof Error ? error.message : String(error),
    );
    return new Response(
      JSON.stringify({
        error: "Login failed",
        code: "INTERNAL_ERROR",
      }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }
}

export async function logout(_req: AppRequest): Promise<Response> {
  return new Response(
    JSON.stringify({
      data: { message: "Logged out successfully" },
    }),
    {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Set-Cookie":
          "auth=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0",
      },
    },
  );
}

export async function me(req: AppRequest): Promise<Response> {
  try {
    if (!req.user) {
      return new Response(
        JSON.stringify({
          error: "Unauthorized",
          code: "AUTH_REQUIRED",
        }),
        { status: 401, headers: { "Content-Type": "application/json" } },
      );
    }

    // Env-based admin session: no User row, synthesize the profile.
    if (req.user.admin) {
      return new Response(
        JSON.stringify({
          data: {
            id: req.user.id,
            name: "Admin",
            email: req.user.email,
            timezone: "UTC",
            role: "ADMIN",
            admin: true,
            xp: 0,
            emailNotifications: true,
            pushNotifications: true,
          },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }

    const db = new Database(req.env.DB);
    let user;
    try {
      user = await db.getUserById(req.user.id);
    } catch (error) {
      console.error("[auth.me] getUserById failed:", error);
      return new Response(
        JSON.stringify({ error: "Unauthorized", code: "AUTH_REQUIRED" }),
        { status: 401, headers: { "Content-Type": "application/json" } },
      );
    }

    if (!user) {
      // A valid token for a user that no longer exists is an invalid session.
      return new Response(
        JSON.stringify({
          error: "Unauthorized",
          code: "AUTH_REQUIRED",
        }),
        { status: 401, headers: { "Content-Type": "application/json" } },
      );
    }

    return new Response(
      JSON.stringify({
        data: {
          id: user.id,
          name: user.name,
          email: user.email,
          timezone: user.timezone,
          theme: user.theme,
          avatar: user.avatar,
          bio: user.bio,
          xp: user.xp || 0,
          role: user.role ?? "USER",
          emailNotifications: user.emailNotifications !== false,
          pushNotifications: user.pushNotifications !== false,
        },
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  } catch (error) {
    console.error("[auth.me]", error);
    return new Response(
      JSON.stringify({
        error: "Failed to get user info",
        code: "INTERNAL_ERROR",
      }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }
}

export async function refresh(req: AppRequest): Promise<Response> {
  try {
    // Extract token from cookies or Authorization header
    const authHeader = req.headers?.get("authorization") || "";
    const cookieHeader = req.headers?.get("cookie") || "";
    let token = "";

    if (authHeader.startsWith("Bearer ")) {
      token = authHeader.slice(7);
    } else {
      const match = cookieHeader.match(/auth=([^;]+)/);
      if (match) token = match[1];
    }

    if (!token) {
      return new Response(
        JSON.stringify({
          error: "No valid session",
          code: "AUTH_REQUIRED",
        }),
        { status: 401, headers: { "Content-Type": "application/json" } },
      );
    }

    const payload = verify(token, req.env.JWT_SECRET || "secret");
    if (!payload) {
      return new Response(
        JSON.stringify({
          error: "Invalid or expired session",
          code: "SESSION_EXPIRED",
        }),
        { status: 401, headers: { "Content-Type": "application/json" } },
      );
    }

    const db = new Database(req.env.DB);
    const userId = payload.userId || payload.id;
    if (!userId) {
      return new Response(
        JSON.stringify({
          error: "Invalid token payload",
          code: "SESSION_EXPIRED",
        }),
        { status: 401, headers: { "Content-Type": "application/json" } },
      );
    }
    const user = await db.getUserById(userId as string);
    if (!user) {
      return new Response(
        JSON.stringify({
          error: "User not found",
          code: "AUTH_REQUIRED",
        }),
        { status: 401, headers: { "Content-Type": "application/json" } },
      );
    }

    const newToken = sign(
      { id: user.id, email: user.email, role: user.role ?? "USER" },
      req.env.JWT_SECRET || "secret",
    );

    return new Response(
      JSON.stringify({
        data: {
          user: {
            id: user.id,
            name: user.name,
            email: user.email,
            timezone: user.timezone,
          },
          token: newToken,
        },
      }),
      {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          "Set-Cookie": `auth_token=${newToken}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=604800`,
        },
      },
    );
  } catch (error) {
    console.error("[auth.refresh]", error);
    return new Response(
      JSON.stringify({
        error: "Session refresh failed",
        code: "INTERNAL_ERROR",
      }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }
}
