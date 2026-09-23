import jwt from 'jsonwebtoken';
import type { Request, Response, NextFunction } from 'express';
import {
  getCookieDomain,
  getCookieSameSite,
  getCookieSecure,
  getJwtSecret,
} from '../lib/config';

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

export type AuthRequest = Request & { userId?: string };

export function requireAuth(
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
    request.userId = (
      jwt.verify(token, getJwtSecret()) as { userId: string }
    ).userId;
    next();
  } catch {
    return response.status(401).json({ error: 'Invalid or expired session' });
  }
}

export function verifyToken(token: string): { userId: string } | null {
  try {
    return jwt.verify(token, getJwtSecret()) as { userId: string };
  } catch {
    return null;
  }
}
