import type { AppRequest } from '../types/index';
import { sign, verify } from '../utils/jwt';
import { hashPassword, verifyPassword } from '../utils/password';
import { Database } from '../db/client';

interface RegisterPayload {
  name: string;
  email: string;
  password: string;
  timezone?: string;
}

interface LoginPayload {
  email: string;
  password: string;
}

export async function register(req: AppRequest): Promise<Response> {
  try {
    const body = req.body as RegisterPayload;
    const { name, email, password, timezone } = body;

    if (!name?.trim() || !email?.trim() || !password) {
      return new Response(
        JSON.stringify({
          error: 'Missing required fields: name, email, password',
          code: 'INVALID_REQUEST',
        }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    if (password.length < 6) {
      return new Response(
        JSON.stringify({
          error: 'Password must be at least 6 characters',
          code: 'INVALID_REQUEST',
        }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const db = new Database(req.env!.DB);
    const existing = await db.getUserByEmail(email.toLowerCase());

    if (existing) {
      return new Response(
        JSON.stringify({
          error: 'Email already registered',
          code: 'INVALID_REQUEST',
        }),
        { status: 409, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const passwordHash = await hashPassword(password);
    const user = await db.createUser({
      name: name.trim(),
      email: email.toLowerCase(),
      passwordHash,
      timezone: timezone || 'UTC',
    });

    const token = sign({ userId: user.id, email: user.email }, (req.env?.JWT_SECRET || 'secret') as string);

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
          'Content-Type': 'application/json',
          'Set-Cookie': `auth=${token}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=604800`,
        },
      }
    );
  } catch (error) {
    console.error('[auth.register]', error);
    return new Response(
      JSON.stringify({
        error: 'Registration failed',
        code: 'INTERNAL_ERROR',
      }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}

export async function login(req: AppRequest): Promise<Response> {
  try {
    const body = req.body as LoginPayload;
    const { email, password } = body;

    if (!email?.trim() || !password) {
      return new Response(
        JSON.stringify({
          error: 'Email and password are required',
          code: 'INVALID_REQUEST',
        }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const db = new Database(req.env!.DB);
    const user = await db.getUserByEmail(email.toLowerCase());

    if (!user || !user.passwordHash) {
      return new Response(
        JSON.stringify({
          error: 'Invalid email or password',
          code: 'INVALID_REQUEST',
        }),
        { status: 401, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const passwordValid = await verifyPassword(password, user.passwordHash);
    if (!passwordValid) {
      return new Response(
        JSON.stringify({
          error: 'Invalid email or password',
          code: 'INVALID_REQUEST',
        }),
        { status: 401, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const token = sign({ userId: user.id, email: user.email }, (req.env?.JWT_SECRET || 'secret') as string);

    // Update last login
    await db.updateUser(user.id, { lastLoginAt: new Date().toISOString() });

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
          'Content-Type': 'application/json',
          'Set-Cookie': `auth=${token}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=604800`,
        },
      }
    );
  } catch (error) {
    console.error('[auth.login]', error);
    return new Response(
      JSON.stringify({
        error: 'Login failed',
        code: 'INTERNAL_ERROR',
      }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}

export async function logout(req: AppRequest): Promise<Response> {
  return new Response(
    JSON.stringify({
      data: { message: 'Logged out successfully' },
    }),
    {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Set-Cookie': 'auth=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0',
      },
    }
  );
}

export async function me(req: AppRequest): Promise<Response> {
  try {
    if (!req.user) {
      return new Response(
        JSON.stringify({
          error: 'Unauthorized',
          code: 'AUTH_REQUIRED',
        }),
        { status: 401, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const db = new Database(req.env!.DB);
    const user = await db.getUserById(req.user.id);

    if (!user) {
      return new Response(
        JSON.stringify({
          error: 'User not found',
          code: 'INVALID_REQUEST',
        }),
        { status: 404, headers: { 'Content-Type': 'application/json' } }
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
          emailNotifications: user.emailNotifications !== false,
          pushNotifications: user.pushNotifications !== false,
        },
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('[auth.me]', error);
    return new Response(
      JSON.stringify({
        error: 'Failed to get user info',
        code: 'INTERNAL_ERROR',
      }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}

export async function refresh(req: AppRequest): Promise<Response> {
  try {
    // Extract token from cookies or Authorization header
    const authHeader = req.headers?.get('authorization') || '';
    const cookieHeader = req.headers?.get('cookie') || '';
    let token = '';

    if (authHeader.startsWith('Bearer ')) {
      token = authHeader.slice(7);
    } else {
      const match = cookieHeader.match(/auth=([^;]+)/);
      if (match) token = match[1];
    }

    if (!token) {
      return new Response(
        JSON.stringify({
          error: 'No valid session',
          code: 'AUTH_REQUIRED',
        }),
        { status: 401, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const payload = verify(token, (req.env?.JWT_SECRET || 'secret') as string);
    if (!payload) {
      return new Response(
        JSON.stringify({
          error: 'Invalid or expired session',
          code: 'SESSION_EXPIRED',
        }),
        { status: 401, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const db = new Database(req.env!.DB);
    const user = await db.getUserById(payload.userId);
    if (!user) {
      return new Response(
        JSON.stringify({
          error: 'User not found',
          code: 'AUTH_REQUIRED',
        }),
        { status: 401, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const newToken = sign({ userId: user.id, email: user.email }, (req.env?.JWT_SECRET || 'secret') as string);

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
          'Content-Type': 'application/json',
          'Set-Cookie': `auth=${newToken}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=604800`,
        },
      }
    );
  } catch (error) {
    console.error('[auth.refresh]', error);
    return new Response(
      JSON.stringify({
        error: 'Session refresh failed',
        code: 'INTERNAL_ERROR',
      }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}


