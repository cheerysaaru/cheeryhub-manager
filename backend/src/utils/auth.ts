import jwt from 'jsonwebtoken';
import type { Request, Response, NextFunction } from 'express';

const secret = () => process.env.JWT_SECRET ?? 'development-only-secret';

const sameSite = (process.env.COOKIE_SAME_SITE as 'lax' | 'strict' | 'none' | undefined) ?? 'lax';
const secure = process.env.COOKIE_SECURE === 'true' || process.env.NODE_ENV === 'production';
const cookieDomain = process.env.COOKIE_DOMAIN || undefined;

export const setAuthCookie = (response: Response, userId: string) =>
  response.cookie('auth_token', jwt.sign({ userId }, secret(), { expiresIn: '7d' }), {
    httpOnly: true,
    sameSite,
    secure,
    ...(cookieDomain ? { domain: cookieDomain } : {}),
    maxAge: 604800000,
  });

export type AuthRequest = Request & { userId?: string };

export function requireAuth(request: AuthRequest, response: Response, next: NextFunction) {
  const token = request.cookies?.auth_token ?? request.headers.authorization?.replace('Bearer ', '');
  if (!token) return response.status(401).json({ error: 'Authentication required' });
  try {
    request.userId = (jwt.verify(token, secret()) as { userId: string }).userId;
    next();
  } catch {
    return response.status(401).json({ error: 'Invalid or expired session' });
  }
}

export function verifyToken(token: string): { userId: string } | null {
  try {
    return jwt.verify(token, secret()) as { userId: string };
  } catch {
    return null;
  }
}