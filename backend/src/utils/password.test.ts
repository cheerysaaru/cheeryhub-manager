import { describe, it, expect } from "vitest";
import { hashPassword, verifyPassword } from "./password";

describe("password hashing", () => {
  it("produces a versioned PBKDF2 hash (never stores the plain password)", async () => {
    const password = "correct horse battery staple";
    const hash = await hashPassword(password);

    expect(hash.startsWith("pbkdf2$")).toBe(true);
    expect(hash).not.toContain(password);

    const [scheme, iterations, salt, digest] = hash.split("$");
    expect(scheme).toBe("pbkdf2");
    expect(Number(iterations)).toBeGreaterThanOrEqual(50_000);
    expect(salt).toMatch(/^[0-9a-f]+$/);
    expect(digest).toMatch(/^[0-9a-f]{64}$/);
  });

  it("verifies a correct password and rejects a wrong one", async () => {
    const hash = await hashPassword("password123");
    expect(await verifyPassword("password123", hash)).toBe(true);
    expect(await verifyPassword("Password123", hash)).toBe(false);
    expect(await verifyPassword("", hash)).toBe(false);
  });

  it("salts each hash so two equal passwords differ", async () => {
    const a = await hashPassword("same-password");
    const b = await hashPassword("same-password");
    expect(a).not.toEqual(b);
    expect(await verifyPassword("same-password", a)).toBe(true);
    expect(await verifyPassword("same-password", b)).toBe(true);
  });

  it("still verifies legacy unsalted sha256 hashes", async () => {
    const digest = await crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode("legacy-pw"),
    );
    const hashHex = Array.from(new Uint8Array(digest))
      .map((byte) => byte.toString(16).padStart(2, "0"))
      .join("");
    const legacy = `sha256:abc123:${hashHex}`;
    expect(await verifyPassword("legacy-pw", legacy)).toBe(true);
    expect(await verifyPassword("wrong", legacy)).toBe(false);
  });

  it("rejects malformed or empty stored hashes without throwing", async () => {
    expect(await verifyPassword("x", "")).toBe(false);
    expect(await verifyPassword("x", "not-a-hash")).toBe(false);
    expect(await verifyPassword("x", "pbkdf2$notanumber$aa$bb")).toBe(false);
  });
});
