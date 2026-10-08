// Password hashing for Cloudflare Workers using WebCrypto PBKDF2-SHA256.
// Stored format: `pbkdf2$<iterations>$<saltHex>$<hashHex>`.
// Legacy `sha256:<salt>:<hash>` hashes are still accepted so existing users can
// sign in (and are transparently re-hashed on login — see the auth routes).
const PBKDF2_ITERATIONS = 100_000;
const KEY_BITS = 256;

function toHex(bytes: Uint8Array): string {
  let out = "";
  for (const b of bytes) out += b.toString(16).padStart(2, "0");
  return out;
}

function fromHex(hex: string): Uint8Array<ArrayBuffer> {
  const clean = hex.length % 2 === 0 ? hex : `0${hex}`;
  const bytes = new Uint8Array(clean.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = Number.parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

/** Constant-time comparison that never early-exits on the first mismatch. */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

async function deriveBits(
  password: string,
  salt: Uint8Array<ArrayBuffer>,
  iterations: number,
): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(password),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt, iterations, hash: "SHA-256" },
    key,
    KEY_BITS,
  );
  return toHex(new Uint8Array(bits));
}

async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hashHex = await deriveBits(password, salt, PBKDF2_ITERATIONS);
  return `pbkdf2$${PBKDF2_ITERATIONS}$${toHex(salt)}$${hashHex}`;
}

async function verifyPassword(
  password: string,
  stored: string,
): Promise<boolean> {
  if (!stored) return false;

  if (stored.startsWith("pbkdf2$")) {
    const [scheme, iterationsStr, saltHex, hashHex] = stored.split("$");
    if (scheme !== "pbkdf2" || !iterationsStr || !saltHex || !hashHex) {
      return false;
    }
    const iterations = Number.parseInt(iterationsStr, 10);
    if (!Number.isFinite(iterations) || iterations < 1) return false;
    const candidate = await deriveBits(password, fromHex(saltHex), iterations);
    return timingSafeEqual(candidate, hashHex);
  }

  if (stored.startsWith("sha256:")) {
    // Legacy unsalted SHA-256: compare the digest we can reproduce statically.
    const [, , storedHash] = stored.split(":");
    const digest = await crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(password),
    );
    const hashHex = toHex(new Uint8Array(digest));
    return timingSafeEqual(hashHex, storedHash ?? "");
  }

  return false;
}

export { hashPassword, verifyPassword };
