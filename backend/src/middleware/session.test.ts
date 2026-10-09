import { describe, it, expect } from "vitest";
import { resolveSessionUser, friendlyDbError } from "./session";
import type { AppEnv, AppRequest } from "../types/index";

// A fake env is never reached for the no-user / admin paths (they return
// before touching the database), so no D1 mock is required there.
const fakeReq = (user: AppRequest["user"]) =>
  ({ env: { JWT_SECRET: "x" } as unknown as AppEnv, user }) as AppRequest;

describe("resolveSessionUser", () => {
  it("rejects a missing session with 401 AUTH_REQUIRED", async () => {
    const r = await resolveSessionUser(fakeReq(undefined));
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.response.status).toBe(401);
      expect(JSON.stringify(await r.response.clone().json())).toContain(
        "AUTH_REQUIRED",
      );
    }
  });

  it("rejects the env-admin principal (no User row) with a clean 401, no DB write", async () => {
    const r = await resolveSessionUser(
      fakeReq({ id: "admin", email: "User", role: "ADMIN", admin: true }),
    );
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.response.status).toBe(401);
      const body = await r.response.clone().json();
      expect(body.error.code).toBe("ADMIN_NO_DATA");
      expect(body.error.message).toMatch(/admin console/i);
    }
  });
});

describe("friendlyDbError", () => {
  it("maps a SQLite FOREIGN KEY failure to a session-expired message (no raw D1 text)", () => {
    const mapped = friendlyDbError(
      new Error("D1_ERROR: FOREIGN KEY constraint failed: SQLITE_CONSTRAINT"),
    );
    expect(mapped.status).toBe(401);
    expect(mapped.code).toBe("SESSION_INVALID");
    expect(mapped.message).toBe(
      "Your session is no longer valid. Please log in again.",
    );
    expect(mapped.message).not.toMatch(/D1_ERROR|SQLITE/);
  });

  it("maps a UNIQUE violation to a 409 conflict", () => {
    const mapped = friendlyDbError(
      new Error("D1_ERROR: UNIQUE constraint failed"),
    );
    expect(mapped.status).toBe(409);
    expect(mapped.code).toBe("CONFLICT");
  });

  it("maps generic constraint errors to a 400 and unknown errors to 500", () => {
    expect(friendlyDbError(new Error("NOT NULL constraint failed")).code).toBe(
      "CONSTRAINT_ERROR",
    );
    expect(friendlyDbError(new Error("boom")).status).toBe(500);
  });
});
