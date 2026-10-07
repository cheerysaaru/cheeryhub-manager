import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import { EnvError, validateEnv, type AppEnv } from './env';

/**
 * Loads .env from every location the process might be started from, so a
 * missing secret is a configuration problem — not a mystery 401 an hour later.
 * Earlier files win (dotenv never overwrites an already-set variable).
 */
export function loadDotEnv(): string[] {
  const candidates = [
    path.resolve(process.cwd(), '.env'),
    path.resolve(process.cwd(), 'backend', '.env'),
    path.resolve(__dirname, '../.env'),
    path.resolve(__dirname, '../../.env'),
  ];

  const loaded: string[] = [];
  for (const file of [...new Set(candidates)]) {
    if (!fs.existsSync(file)) continue;
    dotenv.config({ path: file, quiet: true });
    loaded.push(file);
  }
  return loaded;
}

/** Loads env files, validates the configuration and exits loudly on failure. */
export function bootstrapEnv(): AppEnv {
  const loaded = loadDotEnv();
  try {
    return validateEnv(process.env, { requireDatabase: true });
  } catch (error) {
    if (error instanceof EnvError) {
      console.error('');
      console.error(error.message);
      console.error('');
      console.error(
        loaded.length
          ? `Loaded: ${loaded.join(', ')} — fix the variables above and restart.`
          : 'No .env file found — create one from backend/.env.example and restart.'
      );
      console.error('');
      process.exit(1);
    }
    throw error;
  }
}
