export interface WorkerEnv {
  DB: D1Database;
  JWT_SECRET: string;
  FRONTEND_URL?: string;
  NODE_ENV?: string;
  APP_URL?: string;
}

export function getEnv(env: any): WorkerEnv {
  const required = ['DB', 'JWT_SECRET'];
  for (const key of required) {
    if (!env[key]) {
      throw new Error(`Missing required environment variable: ${key}`);
    }
  }

  return {
    DB: env.DB,
    JWT_SECRET: env.JWT_SECRET,
    FRONTEND_URL: env.FRONTEND_URL || 'https://cheeryhub.space',
    NODE_ENV: env.NODE_ENV || 'production',
    APP_URL: env.APP_URL || 'https://api.cheeryhub.space',
  };
}

// D1Database type from Cloudflare
import type { D1Database } from '@cloudflare/workers-types';
