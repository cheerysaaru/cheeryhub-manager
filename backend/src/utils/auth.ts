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

export async function requireAuth(
  request: AuthRequest,
  response: Response,
  next: NextFunction
) {
  const token =
    request.cookies?.auth_token ??
    request.headers.authorization?.replace('Bearer ', '');
  if (!token)
    return response.status(401).json({ error: 'Authentication required' });
  try {
    const payload = jwt.verify(token, getJwtSecret()) as { userId: string };
    const user = await prisma.user.findUnique({
      where: { id: payload.userId },
      select: { id: true, role: true, status: true },
    });
    if (!user)
      return response.status(401).json({ error: 'Invalid or expired session' });
    if (user.status !== 'ACTIVE')
      return response.status(403).json({ error: 'Account disabled' });
    request.userId = user.id;
    request.userRole = user.role;
    next();
  } catch {
    return response.status(401).json({ error: 'Invalid or expired session' });
  }
}

export function requireAdmin(
  request: AuthRequest,
  response: Response,
  next: NextFunction
) {
  if (request.userRole !== 'ADMIN')
    return response.status(403).json({ error: 'Admin access required' });
  next();
}

export function verifyToken(token: string): { userId: string } | null {
  try {
    return jwt.verify(token, getJwtSecret()) as { userId: string };
  } catch {
    return null;
  }
}
