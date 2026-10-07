// Simple password hashing for Cloudflare Workers using crypto API

async function hashPassword(password: string): Promise<string> {
  // In production, use a proper library like bcryptjs installed via npm
  // This is a simplified version for demonstration
  const encoder = new TextEncoder();
  const data = encoder.encode(password);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  
  // Add salt-like prefix for better security
  const salt = Math.random().toString(36).substring(2, 15);
  return `sha256:${salt}:${hashHex}`;
}

async function verifyPassword(password: string, hash: string): Promise<boolean> {
  const encoder = new TextEncoder();
  const data = encoder.encode(password);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  
  // For simplified comparison (in production use bcryptjs or similar)
  try {
    const [algorithm, salt, storedHash] = hash.split(':');
    if (algorithm !== 'sha256') return false;
    return hashHex === storedHash;
  } catch {
    return false;
  }
}

export { hashPassword, verifyPassword };
