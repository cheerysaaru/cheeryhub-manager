import type { D1Database } from "@cloudflare/workers-types";

export interface AppEnv {
  DB: D1Database;
  USER_DO: DurableObjectNamespace;
  JWT_SECRET: string;
  MIGRATION_SECRET?: string;
  NODE_ENV?: string;
  FRONTEND_URL?: string;
  EMAIL_API_KEY?: string;
  EMAIL_FROM?: string;
  APP_URL?: string;
  ADMIN_USERNAME?: string;
  ADMIN_PASSWORD?: string;
}

// Alias for backward compatibility with routes importing 'Env'
export type Env = AppEnv;

export interface AppUser {
  id: string;
  email: string;
  userId?: string; // Backward compat - same as id
  role?: string;
  admin?: boolean; // env-admin session, not backed by a User row
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

/**
 * The request object handed to every route handler. It is intentionally NOT
 * a Fetch API `Request`: the router builds a plain object and `body` holds an
 * already-parsed JSON value, not a readable stream.
 */
export interface AppRequest {
  method: string;
  url: string;
  pathname: string;
  searchParams: URLSearchParams;
  headers: Headers;
  /** Parsed JSON body (undefined for bodyless methods / non-JSON content) */
  body?: unknown;
  /** Worker environment bindings; always set by the dispatcher */
  env: AppEnv;
  /** Path parameters for the matched route; always initialised */
  params: Record<string, string>;
  /** Query-string parameters, when the handler needs them */
  query?: Record<string, string>;
  /** Populated by the auth middleware on protected routes */
  user?: AppUser;
}
