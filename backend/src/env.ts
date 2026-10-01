import { z } from 'zod';

export class EnvError extends Error {
  readonly issues: string[];

  constructor(issues: string[]) {
    super(
      [
        'Invalid environment configuration:',
        ...issues.map((issue) => `  - ${issue}`),
        '(Variable values are never printed.)',
      ].join('\n')
    );
    this.name = 'EnvError';
    this.issues = issues;
  }
}

const PLACEHOLDER_SECRET = 'replace-with-a-long-random-secret';

const httpOriginList = z
  .string()
  .trim()
  .min(1, 'must not be empty')
  .refine(
    (value) =>
      value.split(',').every((part) => /^https?:\/\/\S+$/.test(part.trim())),
    'must be a comma-separated list of http(s) URLs'
  );

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  JWT_SECRET: z
    .string()
    .trim()
    .min(32, 'must be at least 32 characters')
    .refine(
      (value) => value !== PLACEHOLDER_SECRET,
      'must not be the placeholder value from .env.example'
    )
    .optional(),
  DATABASE_URL: z.string().trim().min(1).optional(),
  FRONTEND_URL: httpOriginList.default('http://localhost:5173'),
  APP_URL: httpOriginList.optional(),
  EMAIL_API_KEY: z.string().trim().min(1).optional(),
  EMAIL_FROM: z.string().trim().min(1).optional(),
  COOKIE_SECURE: z
    .union([z.literal('true'), z.literal('false')])
    .transform((value) => value === 'true')
    .optional(),
  COOKIE_SAME_SITE: z.enum(['lax', 'strict', 'none']).optional(),
  COOKIE_DOMAIN: z.string().trim().min(1).optional(),
  BASE_PATH: z.string().optional(),
  RATE_LIMIT_WINDOW_MS: z.coerce
    .number()
    .int()
    .positive()
    .default(15 * 60 * 1000),
  RATE_LIMIT_MAX: z.coerce.number().int().positive().default(600),
  AUTH_RATE_LIMIT_MAX: z.coerce.number().int().positive().default(30),
  LOGIN_RATE_LIMIT_MAX: z.coerce.number().int().positive().default(5),
  REGISTER_RATE_LIMIT_MAX: z.coerce.number().int().positive().default(3),
  REQUEST_TIMEOUT_MS: z.coerce.number().int().positive().default(10_000),
});

export type AppEnv = z.infer<typeof envSchema>;

export type ValidateOptions = {
  requireDatabase?: boolean;
  cache?: boolean;
};

const SECRET_NAME = /(SECRET|TOKEN|PASSWORD|PASSWD|API_KEY|_KEY$|DATABASE_URL)/;

let cached: AppEnv | null = null;

export function validateEnv(
  source: Record<string, string | undefined> | NodeJS.ProcessEnv = process.env,
  options: ValidateOptions = {}
): AppEnv {
  const issues: string[] = [];
  const record: Record<string, string | undefined> = {};
  for (const [key, value] of Object.entries(source)) {
    if (typeof value === 'string') record[key] = value;
  }

  if (!record.JWT_SECRET?.trim()) {
    issues.push('JWT_SECRET: is required');
  }

  if (options.requireDatabase && !record.DATABASE_URL?.trim()) {
    issues.push('DATABASE_URL: is required for the Node.js runtime');
  }

  const parsed = envSchema.safeParse(record);
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      const name = issue.path.map(String).join('.') || 'environment';
      issues.push(`${name}: ${issue.message}`);
    }
  }

  if (issues.length > 0) {
    throw new EnvError([...new Set(issues)]);
  }

  const env = parsed.data as AppEnv;
  if (options.cache !== false) cached = env;
  return env;
}

export function setEnv(env: AppEnv): void {
  cached = env;
}

export function getEnv(): AppEnv {
  if (!cached) cached = validateEnv(process.env, { requireDatabase: false });
  return cached;
}

export function resetEnvForTests(): void {
  cached = null;
}

/** Values that must never reach a client or a log line. */
export function secretValues(
  source: Record<string, string | undefined> | NodeJS.ProcessEnv = process.env
): string[] {
  const values: string[] = [];
  for (const [key, value] of Object.entries(source)) {
    if (typeof value !== 'string') continue;
    if (value.length < 8) continue;
    if (SECRET_NAME.test(key)) values.push(value);
  }
  if (cached) {
    for (const value of [cached.JWT_SECRET, cached.EMAIL_API_KEY, cached.DATABASE_URL]) {
      if (value && value.length >= 8) values.push(value);
    }
  }
  return [...new Set(values)].sort((a, b) => b.length - a.length);
}

/** Strips any known secret value from a string before it is logged or returned. */
export function redactSecrets(
  text: string,
  source: Record<string, string | undefined> | NodeJS.ProcessEnv = process.env
): string {
  let result = text;
  for (const value of secretValues(source)) {
    if (result.includes(value)) result = result.split(value).join('[redacted]');
  }
  return result;
}

/** Booleans only: says whether required config is loaded. Never exposes values. */
export function envStatus(env: AppEnv = getEnv()): Record<string, boolean> {
  return {
    jwtSecret: Boolean(env.JWT_SECRET),
    databaseUrl: Boolean(env.DATABASE_URL),
    frontendUrl: Boolean(env.FRONTEND_URL),
    appUrl: Boolean(env.APP_URL),
    emailApiKey: Boolean(env.EMAIL_API_KEY),
    emailFrom: Boolean(env.EMAIL_FROM),
  };
}
