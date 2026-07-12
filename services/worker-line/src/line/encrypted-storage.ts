import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { promises as fs } from "node:fs";
import path from "node:path";

import {
  decryptSessionPayload,
  encryptSessionPayload,
} from "../session-crypto.js";

/**
 * Drop-in for linejs FileStorage that encrypts the JSON blob at rest when
 * SESSION_ENCRYPTION_KEY is set. Reads legacy plaintext once and re-encrypts
 * on the next write.
 */
export class EncryptedFileStorage {
  path: string;
  writeLock: Promise<unknown> = Promise.resolve();

  constructor(filePath: string, extendData?: string) {
    this.path = filePath;
    mkdirSync(path.dirname(filePath), { recursive: true });
    if (!existsSync(this.path)) {
      writeFileSync(
        this.path,
        encryptSessionPayload(extendData || "{}"),
        "utf8",
      );
    } else if (extendData) {
      writeFileSync(this.path, encryptSessionPayload(extendData), "utf8");
    }
  }

  private async withLock<T>(fn: () => Promise<T>): Promise<T> {
    let resolve!: () => void;
    const next = new Promise<void>((r) => {
      resolve = r;
    });
    const prev = this.writeLock;
    this.writeLock = next;
    await prev;
    try {
      return await fn();
    } finally {
      resolve();
    }
  }

  private async writeRaw(json: string): Promise<void> {
    await fs.writeFile(this.path, encryptSessionPayload(json), "utf8");
  }

  private async readRaw(): Promise<string> {
    try {
      const file = await fs.readFile(this.path, "utf8");
      return decryptSessionPayload(file || "{}");
    } catch {
      // Fallback: try sync path (constructor may race on first write).
      try {
        return decryptSessionPayload(readFileSync(this.path, "utf8") || "{}");
      } catch {
        return "{}";
      }
    }
  }

  async set(key: string, value: string | null): Promise<void> {
    await this.withLock(async () => {
      const data = await this.getAll();
      if (value == null) delete data[key];
      else data[key] = value;
      await this.writeRaw(JSON.stringify(data));
    });
  }

  async get(key: string): Promise<string | undefined> {
    const data = await this.getAll();
    return data[key];
  }

  async delete(key: string): Promise<void> {
    await this.set(key, null);
  }

  async clear(): Promise<void> {
    await this.withLock(async () => {
      await this.writeRaw("{}");
    });
  }

  async getAll(): Promise<Record<string, string>> {
    try {
      return JSON.parse(await this.readRaw()) as Record<string, string>;
    } catch {
      return {};
    }
  }

  async migrate(storage: {
    set: (key: string, value: string) => Promise<void>;
  }): Promise<void> {
    const kv = await this.getAll();
    for (const key of Object.keys(kv)) {
      await storage.set(key, kv[key]!);
    }
  }
}
