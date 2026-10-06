import jwt from 'jsonwebtoken';
import type { Request, Response, NextFunction } from 'express';
import {
  getCookieDomain,
  getCookieSameSite,
  getCookieSecure,
  getJwtSecret,
} from '../lib/config';
import { prisma } from '../lib/prisma';

export const setAuthCookie = (response: Response, userId: string) =>
  response.cookie(
    'auth_token',
    jwt.sign({ userId }, getJwtSecret(), { expiresIn: '7d' }),
    {
      httpOnly: true,
      sameSite: getCookieSameSite(),
      secure: getCookieSecure(),
      ...(getCookieDomain() ? { domain: getCookieDomain() } : {}),
      maxAge: 604800000,
    }
  );

export type AuthRequest = Request & {
  userId?: string;
  userRole?: 'ADMIN' | 'USER';
};

function requestIdOf(request: Request): string | undefined {
  return (request as Request & { requestId?: string }).requestId;
}

export async function requireAuth(
  request: AuthRequest,
  response: Response,
  next: NextFunction
) {
  const token =
    request.cookies?.auth_token ??
    request.headers.authorization?.replace('Bearer ', '');
  if (!token)
    return response.status(401).json({
      error: 'Authentication required',
      code: 'AUTH_REQUIRED',
      requestId: requestIdOf(request),
    });
  let payload: { userId: string; iat?: number };
  try {
    const decoded = jwt.verify(token, getJwtSecret());
    if (typeof decoded === 'string' || typeof decoded.userId !== 'string' || !decoded.userId) {
      throw new Error('Token payload has no user id');
    }
    payload = { userId: decoded.userId, iat: decoded.iat };
  } catch {
    return response.status(401).json({
      error: 'Your session has expired. Please sign in again.',
      code: 'SESSION_EXPIRED',
      requestId: requestIdOf(request),
    });
  }

  let user;
  try {
    user = await prisma.user.findUnique({
      where: { id: payload.userId },
      select: { id: true, role: true, status: true, passwordChangedAt: true },
    });
  } catch (error) {
    return next(error);
  }

  if (!user)
    return response.status(401).json({
      error: 'Your session has expired. Please sign in again.',
      code: 'SESSION_EXPIRED',
      requestId: requestIdOf(request),
    });
  if (user.status !== 'ACTIVE')
    return response.status(403).json({
      error: 'This account has been disabled. Please contact support.',
      code: 'ACCOUNT_DISABLED',
    });
  // Tokens issued before the last password change are dead everywhere.
  if (
    user.passwordChangedAt &&
    (payload.iat ?? 0) < Math.floor(user.passwordChangedAt.getTime() / 1000)
  )
    return response.status(401).json({
      error: 'Your session has expired. Please sign in again.',
      code: 'SESSION_EXPIRED',
      requestId: requestIdOf(request),
    });
  request.userId = user.id;
  request.userRole = user.role;
  return next();
}

export function requireAdmin(
  request: AuthRequest,
  response: Response,
  next: NextFunction
) {
  if (request.userRole !== 'ADMIN')
    return response.status(403).json({
      error: 'Admin access required',
      code: 'ADMIN_REQUIRED',
    });
  next();
}

export function verifyToken(token: string): { userId: string } | null {
  try {
    return jwt.verify(token, getJwtSecret()) as { userId: string };
  } catch {
    return null;
  }
}
