import { DurableObject } from "cloudflare:workers";
import {
  initStore,
  getCounts,
  importAll,
  list,
  get,
  put,
  remove,
  totalPoints,
  ENTITY_TYPES,
  type Sql,
} from "./userStore";

// One Durable Object per user, named by the user id, SQLite-backed. The worker
// resolves the id from the verified session and only ever talks to that user's
// DO, so data is physically isolated and a caller can never touch another user.
export class UserDO extends DurableObject {
  private sql(): Sql {
    const s = this.ctx.storage.sql;
    return {
      exec: (q) => s.exec(q),
      query: <T>(q: string, params?: unknown[]) =>
        [...(s.exec(q, ...(params ?? [])) as Iterable<T>)] as T[],
      run: (q: string, params?: unknown[]) => s.exec(q, ...(params ?? [])),
    };
  }

  private store(): Sql {
    const sql = this.sql();
    initStore(sql);
    return sql;
  }

  ping(): { ok: true; types: number } {
    this.store();
    return { ok: true, types: ENTITY_TYPES.length };
  }

  getCounts(): Record<string, number> {
    return getCounts(this.store());
  }

  importAll(data: Record<string, Array<Record<string, unknown>>>) {
    return importAll(this.store(), data);
  }

  list<T>(type: string): T[] {
    return list<T>(this.store(), type);
  }

  get<T>(type: string, id: string): T | null {
    return get<T>(this.store(), type, id);
  }

  put(type: string, row: Record<string, unknown>): void {
    put(this.store(), type, row);
  }

  remove(type: string, id: string): void {
    remove(this.store(), type, id);
  }

  totalPoints(): number {
    return totalPoints(this.store());
  }
}
