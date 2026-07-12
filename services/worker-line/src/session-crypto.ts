import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

const PREFIX = "enc:v1:";

function keyFromEnv(): Buffer | null {
  const raw = process.env.SESSION_ENCRYPTION_KEY?.trim();
  if (!raw) return null;
  // Accept 32-byte hex or any passphrase (derived via sha256).
  if (/^[0-9a-fA-F]{64}$/.test(raw)) {
    return Buffer.from(raw, "hex");
  }
  return createHash("sha256").update(raw).digest();
}

export function isSessionEncryptionEnabled(): boolean {
  return keyFromEnv() != null;
}

export function encryptSessionPayload(plaintext: string): string {
  const key = keyFromEnv();
  if (!key) return plaintext;
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const enc = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return (
    PREFIX +
    Buffer.concat([iv, tag, enc]).toString("base64")
  );
}

export function decryptSessionPayload(payload: string): string {
  if (!payload.startsWith(PREFIX)) {
    // Legacy plaintext — return as-is (one-time migration path).
    return payload;
  }
  const key = keyFromEnv();
  if (!key) {
    throw new Error("SESSION_ENCRYPTION_KEY required to read encrypted session");
  }
  const buf = Buffer.from(payload.slice(PREFIX.length), "base64");
  const iv = buf.subarray(0, 12);
  const tag = buf.subarray(12, 28);
  const data = buf.subarray(28);
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8");
}
