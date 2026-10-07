import type { D1Database, D1Result } from '@cloudflare/workers-types';
import { v4 as uuidv4 } from 'uuid';

export interface DbUser {
  id: string;
  name: string;
  email: string;
  passwordHash?: string;
  password_hash?: string;
  role?: string;
  status?: string;
  timezone: string;
  emailVerified?: boolean;
  lastLoginAt?: string;
  createdAt?: string;
  created_at?: string;
  updatedAt?: string;
  updated_at?: string;
  // Optional fields for brand/settings
  theme?: string;
  themeColor?: string;
  avatar?: string;
  bio?: string;
  xp?: number;
  emailNotifications?: boolean;
  pushNotifications?: boolean;
}

export class Database {
  constructor(private db: D1Database) {}

  // User queries
  async getUserById(id: string): Promise<DbUser | null> {
    const result = await this.db
      .prepare('SELECT * FROM "User" WHERE id = ?1')
      .bind(id)
      .first<DbUser>();
    return result || null;
  }

  async getUserByEmail(email: string): Promise<DbUser | null> {
    const result = await this.db
      .prepare('SELECT * FROM "User" WHERE email = ?1')
      .bind(email)
      .first<DbUser>();
    return result || null;
  }

  async createUser(user: Partial<DbUser>): Promise<DbUser> {
    const id = user.id || uuidv4();
    const now = new Date().toISOString();
    
    await this.db
      .prepare(`
        INSERT INTO "User" 
        (id, name, email, passwordHash, timezone, createdAt, updatedAt)
        VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
      `)
      .bind(
        id,
        user.name || 'User',
        user.email,
        user.passwordHash,
        user.timezone || 'UTC',
        now,
        now
      )
      .run();

    return this.getUserById(id) as Promise<DbUser>;
  }

  async updateUser(id: string, updates: Partial<DbUser>): Promise<void> {
    const sets = Object.keys(updates)
      .filter(k => k !== 'id')
      .map((k, i) => `"${k}" = ?${i + 1}`)
      .join(', ');

    if (!sets) return;

    const values = Object.values(updates).filter(v => v !== undefined);
    values.push(new Date().toISOString()); // updatedAt
    values.push(id); // id for WHERE clause

    await this.db
      .prepare(`UPDATE "User" SET ${sets}, "updatedAt" = ?${values.length - 1} WHERE id = ?${values.length}`)
      .bind(...values)
      .run();
  }

  // Generic query helpers
  async all<T = any>(query: string, params?: any[]): Promise<T[]> {
    const stmt = this.db.prepare(query);
    const result = await (params ? stmt.bind(...params) : stmt).all<T>();
    return result.results || [];
  }

  async first<T = any>(query: string, params?: any[]): Promise<T | null> {
    const stmt = this.db.prepare(query);
    const result = await (params ? stmt.bind(...params) : stmt).first<T>();
    return result || null;
  }

  async run(query: string, params?: any[]): Promise<void> {
    const stmt = this.db.prepare(query);
    await (params ? stmt.bind(...params) : stmt).run();
  }

  async exec(query: string): Promise<void> {
    await this.db.exec(query);
  }
}

export function getDatabase(db: D1Database): Database {
  return new Database(db);
}
