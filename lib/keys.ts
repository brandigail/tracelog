import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

export function generateApiKey(): string {
  return `tl_${randomBytes(24).toString("base64url")}`;
}

export function hashKey(key: string): string {
  return createHash("sha256").update(key, "utf8").digest("hex");
}

export function keyPrefix(key: string): string {
  return key.slice(0, 7);
}

/**
 * Compares a presented key with a stored hash in constant time, so response timing reveals nothing about how
 * much of a guess was right. Keys are long random strings, which is why a fast hash is acceptable here.
 */
export function verifyKey(presented: string, storedHash: string): boolean {
  const a = Buffer.from(hashKey(presented), "hex");
  const b = Buffer.from(storedHash, "hex");
  return a.length === b.length && timingSafeEqual(a, b);
}
