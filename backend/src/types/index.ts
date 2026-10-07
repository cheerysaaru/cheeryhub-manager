import type { D1Database } from '@cloudflare/workers-types';

export interface AppEnv {
  DB: D1Database;
  JWT_SECRET: string;
  NODE_ENV?: string;
  FRONTEND_URL?: string;
  EMAIL_API_KEY?: string;
  EMAIL_FROM?: string;
  APP_URL?: string;
}

// Alias for backward compatibility with routes importing 'Env'
export type Env = AppEnv;

export interface AppUser {
  id: string;
  email: string;
  userId?: string; // Backward compat - same as id
}

export interface DbUser {
  id: string;
  email: string;
  name: string;
  password_hash?: string;
  passwordHash?: string;
  timezone: string;
  created_at?: string;
  createdAt?: string;
  updated_at?: string;
  updatedAt?: string;
  // Optional fields that may be stored in settings or user table
  theme?: string;
  themeColor?: string;
  avatar?: string;
  bio?: string;
  xp?: number;
  emailNotifications?: boolean;
  pushNotifications?: boolean;
  role?: string;
  status?: string;
  emailVerified?: boolean;
  lastLoginAt?: string;
}

// @ts-ignore - Extend Request to add custom properties; ignore body type conflict
export interface AppRequest extends Request {
  body?: any;
  user?: AppUser;
  params?: Record<string, string>;
  query?: Record<string, string>;
  env?: AppEnv;
}


