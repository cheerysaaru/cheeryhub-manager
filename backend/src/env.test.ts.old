import { describe, expect, it, beforeEach } from 'vitest';
import {
  EnvError,
  envStatus,
  redactSecrets,
  resetEnvForTests,
  secretValues,
  validateEnv,
} from './env';

const STRONG = 'a'.repeat(40) + 'B2c3D4e5F6g7H8i9J0k1L2m3N4o5P6';

beforeEach(() => {
  resetEnvForTests();
});

describe('validateEnv', () => {
  it('accepts a minimal valid environment and applies defaults', () => {
    const env = validateEnv({ JWT_SECRET: STRONG }, { cache: false });
    expect(env.NODE_ENV).toBe('development');
    expect(env.PORT).toBe(4000);
    expect(env.FRONTEND_URL).toBe('http://localhost:5173');
    expect(env.RATE_LIMIT_MAX).toBe(600);
    expect(env.AUTH_RATE_LIMIT_MAX).toBe(30);
    expect(env.LOGIN_RATE_LIMIT_MAX).toBe(5);
  });

  it('fails when JWT_SECRET is missing and names the variable', () => {
    expect(() => validateEnv({}, { cache: false })).toThrow(EnvError);
    try {
      validateEnv({}, { cache: false });
    } catch (error) {
      const envError = error as EnvError;
      expect(envError.issues.join('\n')).toContain('JWT_SECRET');
      expect(envError.message).toContain('never printed');
    }
  });

  it('rejects the .env.example placeholder secret', () => {
    expect(() =>
      validateEnv({ JWT_SECRET: 'replace-with-a-long-random-secret' }, { cache: false })
    ).toThrow(/placeholder/i);
  });

  it('rejects a short secret', () => {
    expect(() => validateEnv({ JWT_SECRET: 'short' }, { cache: false })).toThrow(EnvError);
  });

  it('requires DATABASE_URL only for the Node runtime', () => {
    expect(() => validateEnv({ JWT_SECRET: STRONG }, { requireDatabase: true, cache: false })).toThrow(
      /DATABASE_URL/
    );
    expect(() =>
      validateEnv({ JWT_SECRET: STRONG, DATABASE_URL: 'file:./dev.db' }, { requireDatabase: true, cache: false })
    ).not.toThrow();
  });

  it('rejects a FRONTEND_URL that is not an http(s) list', () => {
    expect(() =>
      validateEnv({ JWT_SECRET: STRONG, FRONTEND_URL: 'cheeryhub.space' }, { cache: false })
    ).toThrow(/FRONTEND_URL/);
    expect(() =>
      validateEnv(
        { JWT_SECRET: STRONG, FRONTEND_URL: 'https://a.example, http://localhost:5173' },
        { cache: false }
      )
    ).not.toThrow();
  });

  it('coerces cookie and rate-limit settings', () => {
    const env = validateEnv(
      {
        JWT_SECRET: STRONG,
        COOKIE_SECURE: 'true',
        COOKIE_SAME_SITE: 'none',
        RATE_LIMIT_MAX: '42',
        LOGIN_RATE_LIMIT_MAX: '7',
      },
      { cache: false }
    );
    expect(env.COOKIE_SECURE).toBe(true);
    expect(env.COOKIE_SAME_SITE).toBe('none');
    expect(env.RATE_LIMIT_MAX).toBe(42);
    expect(env.LOGIN_RATE_LIMIT_MAX).toBe(7);
  });

  it('never puts a value into the error message', () => {
    try {
      validateEnv({ JWT_SECRET: STRONG, FRONTEND_URL: 'nope' }, { cache: false });
      throw new Error('expected validation to fail');
    } catch (error) {
      const message = (error as Error).message;
      expect(message).toContain('FRONTEND_URL');
      expect(message).not.toContain('nope');
      expect(message).not.toContain(STRONG);
    }
  });
});

describe('secretValues / redactSecrets', () => {
  it('redacts secret-like variables, longest first', () => {
    const source = {
      JWT_SECRET: STRONG,
      EMAIL_API_KEY: 're_super_secret_key_value',
      DATABASE_URL: 'postgresql://user:password@host:5432/db',
      PUBLIC_ORIGIN: 'https://cheeryhub.space',
    };
    const values = secretValues(source);
    expect(values).toContain(STRONG);
    expect(values).toContain('re_super_secret_key_value');
    expect(values).not.toContain('https://cheeryhub.space');

    const line = `auth failed for ${STRONG} using ${'re_super_secret_key_value'}`;
    const redacted = redactSecrets(line, source);
    expect(redacted).not.toContain(STRONG);
    expect(redacted).not.toContain('re_super_secret_key_value');
    expect(redacted).toContain('[redacted]');
    expect(redacted).toContain('auth failed');
  });

  it('also redacts values held by the cached environment', () => {
    validateEnv({ JWT_SECRET: STRONG }, { cache: true });
    expect(redactSecrets(`leak ${STRONG} end`, {})).toBe('leak [redacted] end');
  });
});

describe('envStatus', () => {
  it('reports presence as booleans only', () => {
    const env = validateEnv({ JWT_SECRET: STRONG, EMAIL_API_KEY: 're_abc123456789' }, { cache: false });
    const status = envStatus(env);
    expect(status.jwtSecret).toBe(true);
    expect(status.emailApiKey).toBe(true);
    expect(status.databaseUrl).toBe(false);
    expect(Object.values(status).every((value) => typeof value === 'boolean')).toBe(true);
    expect(JSON.stringify(status)).not.toContain(STRONG);
  });
});
