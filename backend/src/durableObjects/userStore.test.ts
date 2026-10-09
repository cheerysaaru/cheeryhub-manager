import { describe, it, expect } from "vitest";
import { DatabaseSync } from "node:sqlite";
import {
  initStore,
  getCounts,
  importAll,
  list,
  get,
  put,
  remove,
  totalPoints,
  type Sql,
} from "./userStore";

// node:sqlite adapter so the exact store logic runs under Vitest.
function mem(): Sql {
  const db = new DatabaseSync(":memory:");
  return {
    exec: (q) => db.exec(q),
    query: <T>(q: string, params?: unknown[]) =>
      db.prepare(q).all(...(params ?? [])) as T[],
    run: (q: string, params?: unknown[]) =>
      db.prepare(q).run(...(params ?? [])),
  };
}

describe("userStore", () => {
  it("starts empty with all entity types at 0", () => {
    const s = mem();
    initStore(s);
    expect(getCounts(s).tasks).toBe(0);
    expect(getCounts(s).habits).toBe(0);
  });

  it("puts, gets, lists and removes entities", () => {
    const s = mem();
    initStore(s);
    put(s, "tasks", { id: "t1", title: "Write docs" });
    put(s, "tasks", { id: "t2", title: "Ship" });
    expect(get<{ title: string }>(s, "tasks", "t1")?.title).toBe("Write docs");
    expect(list<{ id: string }>(s, "tasks")).toHaveLength(2);
    remove(s, "tasks", "t1");
    expect(get(s, "tasks", "t1")).toBeNull();
    expect(getCounts(s).tasks).toBe(1);
  });

  it("imports a backup keyed by table and reports counts (idempotent)", () => {
    const s = mem();
    initStore(s);
    const data = {
      tasks: [
        { id: "a", title: "A" },
        { id: "b", title: "B" },
      ],
      habits: [{ id: "h", name: "Run" }],
      point_events: [
        { id: "p1", amount: 10 },
        { id: "p2", amount: -3 },
      ],
    };
    const first = importAll(s, data);
    expect(first.imported.tasks).toBe(2);
    expect(first.imported.habits).toBe(1);
    expect(getCounts(s).tasks).toBe(2);
    // Idempotent: re-importing does not duplicate rows.
    importAll(s, data);
    expect(getCounts(s).tasks).toBe(2);
    expect(getCounts(s).habits).toBe(1);
    expect(totalPoints(s)).toBe(7);
  });

  it("skips backup rows that have no id", () => {
    const s = mem();
    initStore(s);
    const r = importAll(s, {
      tasks: [{ id: "ok" }, { title: "no id" } as never],
    });
    expect(r.imported.tasks).toBe(1);
    expect(r.skipped.tasks).toBe(1);
  });

  it("isolates each user store (A can neither read nor write B)", () => {
    const a = mem();
    const b = mem();
    initStore(a);
    initStore(b);
    put(a, "tasks", { id: "only-a", title: "A's task" });
    // User B's store has no knowledge of user A's row.
    expect(get(b, "tasks", "only-a")).toBeNull();
    expect(list(b, "tasks")).toHaveLength(0);
    expect(getCounts(a).tasks).toBe(1);
    expect(getCounts(b).tasks).toBe(0);
  });
});
