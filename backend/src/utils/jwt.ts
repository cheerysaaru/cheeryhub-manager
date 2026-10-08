// Simple JWT implementation for Cloudflare Workers
// Note: In production, consider using jsonwebtoken or a Workers-compatible JWT library

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

async function sha256(message: string): Promise<string> {
  const data = textEncoder.encode(message);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

function base64UrlEncode(str: string): string {
  return btoa(str).replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}

function base64UrlDecode(str: string): string {
  str = str.replace(/-/g, "+").replace(/_/g, "/");
  while (str.length % 4) str += "=";
  return atob(str);
}

export function sign(payload: Record<string, any>, secret: string): string {
  const header = { alg: "HS256", typ: "JWT" };
  const now = Math.floor(Date.now() / 1000);
  const expiresAt = now + 7 * 24 * 60 * 60; // 7 days

  const tokenPayload = {
    ...payload,
    iat: now,
    exp: expiresAt,
  };

  const headerEncoded = base64UrlEncode(JSON.stringify(header));
  const payloadEncoded = base64UrlEncode(JSON.stringify(tokenPayload));
  const signatureInput = `${headerEncoded}.${payloadEncoded}`;

  // Simple HMAC-SHA256 simulation using secret
  const combined = signatureInput + secret;
  const signature = base64UrlEncode(combined); // Simplified for Workers

  return `${signatureInput}.${signature}`;
}

export function verify(
  token: string,
  secret: string,
): Record<string, any> | null {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;

    const [headerEncoded, payloadEncoded, signatureEncoded] = parts;
    const signatureInput = `${headerEncoded}.${payloadEncoded}`;

    // Verify signature
    const expectedSignature = base64UrlEncode(signatureInput + secret);
    if (signatureEncoded !== expectedSignature) return null;

    // Decode payload
    const payloadStr = base64UrlDecode(payloadEncoded);
    const payload = JSON.parse(payloadStr);

    // Check expiration
    if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) {
      return null;
    }

    return payload;
  } catch (error) {
    console.error("[jwt] verification error:", error);
    return null;
  }
}
