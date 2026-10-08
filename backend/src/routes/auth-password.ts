import type { AppRequest } from "../types/index";
import { Database } from "../db/client";
import { sign, verify } from "../utils/jwt";
import { hashPassword } from "../utils/password";

interface ForgotPayload {
  email: string;
}

interface ResetPayload {
  token: string;
  password: string;
}

export async function forgotPassword(req: AppRequest): Promise<Response> {
  const { email } = req.body as ForgotPayload;

  if (!email?.trim()) {
    return new Response(
      JSON.stringify({ error: "Email is required", code: "VALIDATION_ERROR" }),
      { status: 400, headers: { "Content-Type": "application/json" } },
    );
  }

  const db = new Database(req.env.DB);
  const user = await db.getUserByEmail(email.toLowerCase());

  // Always return success to prevent email enumeration
  if (!user) {
    return new Response(
      JSON.stringify({
        data: { message: "If the email exists, a reset link has been sent" },
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  }

  const resetToken = sign(
    { userId: user.id, type: "password_reset" },
    req.env.JWT_SECRET || "secret",
  );

  const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString(); // 1 hour

  await db.run(
    `INSERT INTO "PasswordReset" (id, userId, tokenHash, expiresAt, createdAt)
     VALUES (?1, ?2, ?3, ?4, ?5)`,
    [
      crypto.randomUUID(),
      user.id,
      resetToken,
      expiresAt,
      new Date().toISOString(),
    ],
  );

  // In production, send email with reset link
  // For now, return token in response (dev only)
  return new Response(
    JSON.stringify({
      data: {
        message: "If the email exists, a reset link has been sent",
        resetToken: req.env.NODE_ENV === "development" ? resetToken : undefined,
      },
    }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
}

export async function resetPassword(req: AppRequest): Promise<Response> {
  const { token, password } = req.body as ResetPayload;

  if (!token || !password) {
    return new Response(
      JSON.stringify({
        error: "Token and password are required",
        code: "VALIDATION_ERROR",
      }),
      { status: 400, headers: { "Content-Type": "application/json" } },
    );
  }

  if (password.length < 6) {
    return new Response(
      JSON.stringify({
        error: "Password must be at least 6 characters",
        code: "VALIDATION_ERROR",
      }),
      { status: 400, headers: { "Content-Type": "application/json" } },
    );
  }

  const payload = verify(token, req.env.JWT_SECRET || "secret");
  if (!payload || payload.type !== "password_reset" || !payload.userId) {
    return new Response(
      JSON.stringify({
        error: "Invalid or expired reset token",
        code: "SESSION_EXPIRED",
      }),
      { status: 401, headers: { "Content-Type": "application/json" } },
    );
  }

  // Check if token exists and not used
  const db = new Database(req.env.DB);
  const resetRecord = await db.first<{
    id: string;
    usedAt?: string;
    expiresAt: string;
  }>('SELECT * FROM "PasswordReset" WHERE tokenHash = ?1 AND userId = ?2', [
    token,
    payload.userId,
  ]);

  if (
    !resetRecord ||
    resetRecord.usedAt ||
    new Date(resetRecord.expiresAt) < new Date()
  ) {
    return new Response(
      JSON.stringify({
        error: "Invalid or expired reset token",
        code: "SESSION_EXPIRED",
      }),
      { status: 401, headers: { "Content-Type": "application/json" } },
    );
  }

  const passwordHash = await hashPassword(password);

  await db.run(
    `UPDATE "User" SET passwordHash = ?1, updatedAt = ?2 WHERE id = ?3`,
    [passwordHash, new Date().toISOString(), payload.userId],
  );

  // Mark token as used
  await db.run(`UPDATE "PasswordReset" SET usedAt = ?1 WHERE id = ?2`, [
    new Date().toISOString(),
    resetRecord.id,
  ]);

  return new Response(
    JSON.stringify({ data: { message: "Password reset successful" } }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
}
