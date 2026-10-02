import { env } from 'cloudflare:workers';
import { httpServerHandler } from 'cloudflare:node';

import { createApp } from './app';
import { configurePrisma } from './lib/prisma';
import { configureRuntime } from './lib/config';
import { EnvError, validateEnv } from './env';

// Fail fast at cold start: a missing/invalid JWT_SECRET must abort the worker
// with a readable message instead of serving 401s to every signed-in user.
function workerSource(): Record<string, string | undefined> {
  const keys = [
    'NODE_ENV',
    'PORT',
    'JWT_SECRET',
    'DATABASE_URL',
    'FRONTEND_URL',
    'APP_URL',
    'EMAIL_API_KEY',
    'EMAIL_FROM',
    'COOKIE_SECURE',
    'COOKIE_SAME_SITE',
    'COOKIE_DOMAIN',
    'BASE_PATH',
    'RATE_LIMIT_WINDOW_MS',
    'RATE_LIMIT_MAX',
    'AUTH_RATE_LIMIT_MAX',
    'LOGIN_RATE_LIMIT_MAX',
    'REGISTER_RATE_LIMIT_MAX',
    'REQUEST_TIMEOUT_MS',
  ] as const;

  const source: Record<string, string | undefined> = {};
  for (const key of keys) {
    const value = (env as unknown as Record<string, unknown>)[key] ?? process.env[key];
    if (typeof value === 'string') source[key] = value;
  }
  return source;
}

try {
  const appEnv = validateEnv(workerSource(), { requireDatabase: false });
  configureRuntime({
    jwtSecret: appEnv.JWT_SECRET,
    frontendUrl: appEnv.FRONTEND_URL,
    cookieSecure: appEnv.COOKIE_SECURE ?? true,
    cookieSameSite: appEnv.COOKIE_SAME_SITE ?? 'none',
    emailApiKey: appEnv.EMAIL_API_KEY,
    emailFrom: appEnv.EMAIL_FROM,
    appUrl: appEnv.APP_URL,
  });
} catch (error) {
  if (error instanceof EnvError) {
    console.error(error.message);
    console.error(
      'Set the variable with: npx wrangler secret put <NAME> (or add it to wrangler.toml [vars])'
    );
  }
  throw error;
}

configurePrisma(env.DB);

const app = createApp({ rateLimit: true });

app.listen(3000);

export default httpServerHandler({
  port: 3000,
});
