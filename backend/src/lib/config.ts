export type RuntimeConfig = {
  jwtSecret?: string;
  frontendUrl?: string;
  cookieSecure?: boolean;
  cookieSameSite?: 'lax' | 'strict' | 'none';
};

let config: RuntimeConfig = {};

export function configureRuntime(next: RuntimeConfig) {
  config = { ...config, ...next };
}

export function getRuntimeConfig(): RuntimeConfig {
  return config;
}

export function getJwtSecret(): string {
  const secret = config.jwtSecret ?? process.env.JWT_SECRET;
  if (!secret) throw new Error('JWT_SECRET is not configured');
  return secret;
}

export function getFrontendUrl(): string {
  return (
    config.frontendUrl ??
    process.env.FRONTEND_URL ??
    'http://localhost:5173'
  );
}

export function getCookieSameSite(): 'lax' | 'strict' | 'none' {
  if (config.cookieSameSite) return config.cookieSameSite;
  const value = process.env.COOKIE_SAME_SITE;
  if (value === 'none' || value === 'strict' || value === 'lax') return value;
  return 'lax';
}

export function getCookieSecure(): boolean {
  if (config.cookieSecure !== undefined) return config.cookieSecure;
  return (
    process.env.COOKIE_SECURE === 'true' ||
    process.env.NODE_ENV === 'production'
  );
}

export function getCookieDomain(): string | undefined {
  return process.env.COOKIE_DOMAIN || undefined;
}
