import { describe, it, expect } from "vitest";
import { matchesAdmin } from "./auth";
import { requireAdmin } from "./admin";
import type { AppEnv, AppRequest } from "../types/index";

describe("admin credential matching (constant-time)", () => {
  const env = { ADMIN_USERNAME: "User", ADMIN_PASSWORD: "Abi1414" } as AppEnv;

  it("accepts the correct username + password", () => {
    expect(matchesAdmin(env, "User", "Abi1414")).toBe(true);
  });

  it("rejects the wrong password", () => {
    expect(matchesAdmin(env, "User", "wrong")).toBe(false);
  });

  it("no longer accepts the old password Abi@2006", () => {
    expect(matchesAdmin(env, "User", "Abi@2006")).toBe(false);
  });

  it("rejects the wrong username", () => {
    expect(matchesAdmin(env, "admin", "Abi1414")).toBe(false);
  });

  it("returns false (and never throws) when a secret is missing", () => {
    expect(matchesAdmin({} as AppEnv, "User", "Abi1414")).toBe(false);
    expect(
      matchesAdmin({ ADMIN_USERNAME: "User" } as AppEnv, "User", "x"),
    ).toBe(false);
  });
});

function reqWithUser(user: AppRequest["user"]): AppRequest {
  return { env: {} as AppEnv, user } as AppRequest;
}

describe("admin route gate (requireAdmin)", () => {
  it("returns 403 for a regular user", () => {
    const res = requireAdmin(
      reqWithUser({ id: "u1", email: "a@b.com", role: "USER" }),
    );
    expect(res).not.toBeNull();
    expect(res?.status).toBe(403);
  });

  it("returns 401 when there is no session", () => {
    const res = requireAdmin(reqWithUser(undefined));
    expect(res?.status).toBe(401);
  });

  it("passes (null) for an admin session", () => {
    const res = requireAdmin(
      reqWithUser({ id: "admin", email: "User", role: "ADMIN", admin: true }),
    );
    expect(res).toBeNull();
  });
});
