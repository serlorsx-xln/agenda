import { afterEach, describe, expect, it, vi } from "vitest";

import {
  decryptSessionPayload,
  encryptSessionPayload,
  isSessionEncryptionEnabled,
} from "./session-crypto.js";

describe("session-crypto", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("is disabled without key and round-trips plaintext", () => {
    vi.stubEnv("SESSION_ENCRYPTION_KEY", "");
    expect(isSessionEncryptionEnabled()).toBe(false);
    expect(encryptSessionPayload('{"a":1}')).toBe('{"a":1}');
    expect(decryptSessionPayload('{"a":1}')).toBe('{"a":1}');
  });

  it("encrypts and decrypts with a passphrase key", () => {
    vi.stubEnv("SESSION_ENCRYPTION_KEY", "test-secret-passphrase");
    expect(isSessionEncryptionEnabled()).toBe(true);
    const enc = encryptSessionPayload('{"token":"abc"}');
    expect(enc.startsWith("enc:v1:")).toBe(true);
    expect(enc).not.toContain("abc");
    expect(decryptSessionPayload(enc)).toBe('{"token":"abc"}');
  });

  it("still reads legacy plaintext", () => {
    vi.stubEnv("SESSION_ENCRYPTION_KEY", "test-secret-passphrase");
    expect(decryptSessionPayload('{"legacy":true}')).toBe('{"legacy":true}');
  });
});
