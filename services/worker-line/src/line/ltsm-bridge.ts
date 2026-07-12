import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { createInterface } from "node:readline";
import { fileURLToPath } from "node:url";
import path from "node:path";
import nacl from "tweetnacl";
import { Thrift } from "@evex/linejs/thrift";

const thrift = new Thrift();

const LTSM_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../ltsm",
);

type BridgeResponse = {
  id?: number;
  ready?: boolean;
  result?: unknown;
  error?: string;
};

type LinejsE2eeApi = {
  createSqrSecret(): [Uint8Array, string];
  decodeE2EEKeyV1(
    data: {
      keyId?: number | string;
      publicKey: string;
      encryptedKeyChain: string;
      e2eeVersion?: number;
    },
    secret: Buffer | Uint8Array,
  ): Promise<
    | {
        keyId: number;
        privKey: Buffer;
        pubKey: Buffer;
        e2eeVersion?: number;
      }
    | undefined
  >;
  saveE2EESelfKeyData(value: {
    keyId: number | string;
    privKey: string;
    pubKey: string;
    e2eeVersion?: number;
  }): Promise<void>;
};

/** Persistent Node bridge to LINE's ltsm.wasm (same binary OkLine vendors). */
export class LtsmBridge {
  private proc: ChildProcessWithoutNullStreams | null = null;
  private nextId = 0;
  private pending = new Map<
    number,
    { resolve: (v: unknown) => void; reject: (e: Error) => void }
  >();
  private startPromise: Promise<void> | null = null;
  private chain: Promise<unknown> = Promise.resolve();
  private intentionalClose = false;

  private resetProcessState(): void {
    this.proc = null;
    this.startPromise = null;
  }

  private rejectAllPending(message: string): void {
    for (const [, waiter] of this.pending) {
      waiter.reject(new Error(message));
    }
    this.pending.clear();
  }

  private enqueue<T>(fn: () => Promise<T>): Promise<T> {
    const run = this.chain.then(fn, fn);
    this.chain = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }

  private async ensureStarted(): Promise<void> {
    if (this.proc && !this.proc.killed) return;
    if (this.proc) {
      this.resetProcessState();
    }
    if (this.startPromise) {
      await this.startPromise;
      return;
    }

    this.startPromise = new Promise((resolve, reject) => {
      const bridgePath = path.join(LTSM_DIR, "ltsm_bridge.cjs");
      this.proc = spawn(process.execPath, [bridgePath], {
        cwd: LTSM_DIR,
        stdio: ["pipe", "pipe", "pipe"],
      });

      const rl = createInterface({ input: this.proc.stdout });
      rl.on("line", (line) => {
        let msg: BridgeResponse;
        try {
          msg = JSON.parse(line) as BridgeResponse;
        } catch {
          return;
        }
        if (msg.ready) {
          resolve();
          return;
        }
        if (msg.id == null) return;
        const waiter = this.pending.get(msg.id);
        if (!waiter) return;
        this.pending.delete(msg.id);
        if (msg.error) {
          waiter.reject(new Error(msg.error));
        } else {
          waiter.resolve(msg.result);
        }
      });

      this.proc.on("error", (err) => {
        this.rejectAllPending(`ltsm bridge error: ${err.message}`);
        clearLtsmHandleCaches();
        this.resetProcessState();
        reject(err);
      });
      this.proc.on("exit", (code) => {
        const msg =
          code !== 0 && code !== null
            ? `ltsm bridge exited (${code})`
            : "ltsm bridge exited";
        if (!this.intentionalClose) {
          console.warn(`[ltsm] ${msg}, will restart on next invoke`);
        }
        this.rejectAllPending(msg);
        clearLtsmHandleCaches();
        this.resetProcessState();
      });
    });

    await this.startPromise;
  }

  /** Ping bridge subprocess; restarts automatically if the child died. */
  async isHealthy(): Promise<boolean> {
    try {
      await this.ensureStarted();
      return this.proc != null && !this.proc.killed;
    } catch {
      return false;
    }
  }

  private invoke(op: string, fields: Record<string, unknown> = {}): Promise<unknown> {
    return this.enqueue(async () => {
      await this.ensureStarted();
      if (!this.proc?.stdin) {
        throw new Error("ltsm bridge stdin unavailable");
      }
      const id = ++this.nextId;
      const payload = JSON.stringify({ id, op, ...fields });
      return new Promise((resolve, reject) => {
        this.pending.set(id, { resolve, reject });
        this.proc!.stdin!.write(`${payload}\n`, (err) => {
          if (err) {
            this.pending.delete(id);
            reject(err);
          }
        });
      });
    });
  }

  async curvekeyGenerate(): Promise<number> {
    return (await this.invoke("curvekey_generate")) as number;
  }

  async e2eePublicKey(keyId: number): Promise<string> {
    return (await this.invoke("e2ee_public_key", { keyId })) as string;
  }

  async e2eeCreateChannel(keyId: number, serverPubKeyB64: string): Promise<number> {
    return (await this.invoke("e2ee_create_channel", {
      keyId,
      serverPubKeyB64,
    })) as number;
  }

  async e2eeUnwrapKeychain(
    channelId: number,
    encKeyChainB64: string,
  ): Promise<number[]> {
    const result = await this.invoke("e2ee_unwrap_keychain", {
      channelId,
      encKeyChainB64,
    });
    return Array.isArray(result) ? (result as number[]) : [];
  }

  async e2eeGetKeyId(keyHandle: number): Promise<number> {
    return (await this.invoke("e2ee_get_key_id", { keyHandle })) as number;
  }

  async e2eePublicKeyForHandle(keyHandle: number): Promise<string> {
    return (await this.invoke("e2ee_public_key_for_handle", {
      keyHandle,
    })) as string;
  }

  async e2eeExportKey(keyHandle: number): Promise<string> {
    return (await this.invoke("e2ee_export_key", { keyHandle })) as string;
  }

  async e2eeLoadKey(exportedB64: string): Promise<number> {
    return (await this.invoke("e2ee_load_key", { exportedB64 })) as number;
  }

  async e2eeCreateChannelWithPubkey(
    keyHandle: number,
    peerPubKeyB64: string,
  ): Promise<number> {
    return (await this.invoke("e2ee_create_channel_with_pubkey", {
      keyHandle,
      peerPubKeyB64,
    })) as number;
  }

  async e2eeUnwrapGroupSharedKey(
    channelId: number,
    encSharedKeyB64: string,
  ): Promise<number> {
    return (await this.invoke("e2ee_unwrap_group_shared_key", {
      channelId,
      encSharedKeyB64,
    })) as number;
  }


  /** V1 encrypt works with loadKey identity handles; V2 currently MAC-fails in Node. */
  async e2eeEncryptV1(params: {
    channelId: number;
    plaintextB64: string;
  }): Promise<string> {
    return (await this.invoke("e2ee_encrypt_v1", params)) as string;
  }

  async e2eeDecryptV1(params: {
    channelId: number;
    ciphertextB64: string;
  }): Promise<string> {
    return (await this.invoke("e2ee_decrypt_v1", params)) as string;
  }

  async e2eeDecryptV2(params: {
    channelId: number;
    to: string;
    from: string;
    senderKeyId: number;
    receiverKeyId: number;
    contentType: number;
    ciphertextB64: string;
  }): Promise<string> {
    return (await this.invoke("e2ee_decrypt_v2", params)) as string;
  }

}


let sharedBridge: LtsmBridge | null = null;

export function getLtsmBridge(): LtsmBridge {
  if (!sharedBridge) {
    sharedBridge = new LtsmBridge();
  }
  return sharedBridge;
}

type LtsmE2eeMeta = {
  keyId?: number | string;
  publicKey: string;
  encryptedKeyChain: string;
  e2eeVersion?: number;
};

export type StoredE2eeKey = {
  keyId: number;
  pubKey: string;
  privKey?: string;
  ltsmExport?: string;
  e2eeVersion?: number;
};

/** Build QR ?secret= URL using WASM Curve25519 (OkLine-compatible). */
export async function createWasmQrSecret(
  bridge: LtsmBridge,
): Promise<{ curveKeyId: number; secretUrl: string }> {
  const curveKeyId = await bridge.curvekeyGenerate();
  const pubB64 = await bridge.e2eePublicKey(curveKeyId);
  const secretUrl = `?secret=${encodeURIComponent(pubB64)}&e2eeVersion=1`;
  return { curveKeyId, secretUrl };
}

type KeyPairBytes = { privKey: Buffer; pubKey: Buffer };

function parseThriftKeyPairs(buf: Buffer): KeyPairBytes[] {
  try {
    const root = thrift.readThriftStruct(buf)[1] as unknown;
    if (!Array.isArray(root)) return [];
    const out: KeyPairBytes[] = [];
    for (const entry of root) {
      if (!Array.isArray(entry)) continue;
      const pubKey = Buffer.from(entry[4] as ArrayLike<number>);
      const privKey = Buffer.from(entry[5] as ArrayLike<number>);
      if (privKey.length === 32 && pubKey.length === 32) {
        out.push({ privKey, pubKey });
      }
    }
    return out;
  } catch {
    return [];
  }
}

function scanPrivKey(exportedBuf: Buffer, expectedPubB64: string): Buffer | null {
  const expectedPub = Buffer.from(expectedPubB64, "base64");
  for (let i = 0; i <= exportedBuf.length - 32; i++) {
    try {
      const slice = exportedBuf.subarray(i, i + 32);
      const derived = Buffer.from(nacl.scalarMult.base(slice));
      if (derived.equals(expectedPub)) {
        return Buffer.from(slice);
      }
    } catch {
      /* invalid scalar */
    }
  }
  for (let i = 0; i <= exportedBuf.length - 64; i++) {
    const priv = exportedBuf.subarray(i, i + 32);
    const pub = exportedBuf.subarray(i + 32, i + 64);
    if (pub.equals(expectedPub)) {
      return Buffer.from(priv);
    }
  }
  return null;
}

function extractKeyPairFromExport(
  exportedBuf: Buffer,
  expectedPubB64: string,
): KeyPairBytes | null {
  for (const pair of parseThriftKeyPairs(exportedBuf)) {
    const derived = Buffer.from(nacl.scalarMult.base(pair.privKey));
    if (derived.equals(pair.pubKey)) {
      return pair;
    }
  }
  const priv = scanPrivKey(exportedBuf, expectedPubB64);
  if (!priv) return null;
  const pubKey = Buffer.from(expectedPubB64, "base64");
  return { privKey: priv, pubKey };
}

type E2eeKeyLookup = {
  getE2EESelfKeyData: (mid: string) => Promise<StoredE2eeKey>;
  getE2EESelfKeyDataByKeyId: (keyId: number) => Promise<StoredE2eeKey | null>;
};

type TalkKeyLookup = {
  getE2EEPublicKeys?: () => Promise<Array<{ keyId?: number; [index: number]: unknown }>>;
  getLastE2EEGroupSharedKey?: (opts: {
    keyVersion: number;
    chatMid: string;
  }) => Promise<GroupSharedKeyInfo & { creator: string }>;
};

async function persistStoredKey(
  storage: { set: (key: string, value: string) => Promise<void> },
  key: StoredE2eeKey,
): Promise<void> {
  await storage.set(`e2eeKeys:${key.keyId}`, JSON.stringify(key));
}

/** Decode via linejs using the same QR ephemeral secret (must not call createSqrSecret twice). */
export async function decodeE2eeWithQrSecret(
  e2ee: LinejsE2eeApi,
  meta: LtsmE2eeMeta,
  qrSecret: Buffer | Uint8Array,
  storage: { get?: (key: string) => Promise<string | undefined>; set: (key: string, value: string) => Promise<void> },
  mid?: string,
): Promise<{ keyId: number } | null> {
  const result = await e2ee.decodeE2EEKeyV1(meta, qrSecret);
  if (!result?.privKey || !result?.pubKey) {
    return null;
  }
  const keyId = result.keyId;
  let existing: Partial<StoredE2eeKey> = {};
  try {
    const raw = await storage.get?.(`e2eeKeys:${keyId}`);
    if (raw) {
      existing = JSON.parse(raw) as StoredE2eeKey;
    }
  } catch {
    // ignore cache read errors
  }
  const privKey = result.privKey.toString("base64");
  const pubKey = result.pubKey.toString("base64");
  const e2eeVersion = result.e2eeVersion ?? meta.e2eeVersion ?? 1;
  const keyData: StoredE2eeKey = {
    ...existing,
    keyId,
    privKey,
    pubKey,
    e2eeVersion,
  };
  await storage.set(`e2eeKeys:${keyId}`, JSON.stringify(keyData));
  if (mid) {
    await e2ee.saveE2EESelfKeyData({ keyId, privKey, pubKey, e2eeVersion });
  }
  console.log(
    `[ltsm] E2EE keys via linejs decode (keyId=${keyId}${keyData.ltsmExport ? ", privKey+ltsmExport" : ", privKey"})`,
  );
  return { keyId };
}

/** Persist WASM export blobs when raw privKey cannot be extracted (OkLine-style). */
export async function unwrapE2eeToLinejsStorage(
  bridge: LtsmBridge,
  curveKeyId: number,
  meta: LtsmE2eeMeta,
  storage: { set: (key: string, value: string) => Promise<void> },
  mid?: string,
): Promise<{ keyId: number; privKey?: string; pubKey: string } | null> {
  const e2eeVersion = meta.e2eeVersion ?? 1;
  const channelId = await bridge.e2eeCreateChannel(curveKeyId, meta.publicKey);
  const handles = await bridge.e2eeUnwrapKeychain(
    channelId,
    meta.encryptedKeyChain,
  );
  if (!handles.length) {
    return null;
  }

  const saved = new Map<number, StoredE2eeKey>();

  for (const handle of handles) {
    const keyId = await bridge.e2eeGetKeyId(handle);
    const pubKeyB64 = await bridge.e2eePublicKeyForHandle(handle);
    const exported = await bridge.e2eeExportKey(handle);
    const exportedBuf = Buffer.from(exported, "base64");

    let privKey: string | undefined;
    const pair =
      exportedBuf.length === 32
        ? {
            privKey: exportedBuf,
            pubKey: Buffer.from(pubKeyB64, "base64"),
          }
        : exportedBuf.length === 64
          ? {
              privKey: exportedBuf.subarray(0, 32),
              pubKey: exportedBuf.subarray(32, 64),
            }
          : extractKeyPairFromExport(exportedBuf, pubKeyB64);

    if (pair) {
      const derivedPub = Buffer.from(nacl.scalarMult.base(pair.privKey));
      if (derivedPub.equals(pair.pubKey)) {
        privKey = pair.privKey.toString("base64");
      }
    }

    cacheIdentityHandle(keyId, handle);
    saved.set(keyId, {
      keyId,
      pubKey: pubKeyB64,
      ...(privKey ? { privKey } : { ltsmExport: exported }),
      e2eeVersion,
    });
  }

  if (!saved.size) {
    return null;
  }

  let primaryKeyId = meta.keyId != null ? Number(meta.keyId) : NaN;
  if (!Number.isFinite(primaryKeyId) || !saved.has(primaryKeyId)) {
    primaryKeyId = Math.max(...saved.keys());
  }

  for (const key of saved.values()) {
    await persistStoredKey(storage, key);
  }

  const primary = saved.get(primaryKeyId)!;
  if (mid) {
    await storage.set(`e2eeKeys:${mid}`, JSON.stringify(primary));
  }

  const mode = primary.privKey ? "raw" : "ltsmExport";
  console.log(
    `[ltsm] saved ${saved.size} E2EE key(s), primary keyId=${primaryKeyId} (${mode})`,
  );

  return {
    keyId: primaryKeyId,
    privKey: primary.privKey,
    pubKey: primary.pubKey,
  };
}

/** Decrypt a group's encrypted shared key for LTSM accounts (Node CBC; WASM export often fails). */
export async function unwrapGroupSharedKeyViaLtsm(
  bridge: LtsmBridge,
  selfExportB64: string,
  creatorPubB64: string,
  encryptedSharedKeyB64: string,
  selfPubB64?: string,
  selfKeyId?: number,
): Promise<Buffer> {
  const selfHandle =
    selfKeyId != null
      ? await getIdentityHandle(bridge, selfKeyId, selfExportB64)
      : await bridge.e2eeLoadKey(selfExportB64);
  const channelId = await bridge.e2eeCreateChannelWithPubkey(
    selfHandle,
    creatorPubB64,
  );
  const groupHandle = await bridge.e2eeUnwrapGroupSharedKey(
    channelId,
    encryptedSharedKeyB64,
  );
  const exported = await bridge.e2eeExportKey(groupHandle);
  const buf = Buffer.from(exported, "base64");
  if (buf.length === 32) {
    return buf;
  }
  if (buf.length > 32) {
    const scanned = scanPrivKey(buf, creatorPubB64);
    if (scanned) {
      return scanned;
    }
  }
  return buf;
}

/** Unwrapped identity handles from QR login — required for encrypt (load-only handles cannot encrypt). */
const identityHandleCache = new Map<number, number>();
const groupKeyHandleCache = new Map<string, number>();

function cacheIdentityHandle(keyId: number, handle: number): void {
  identityHandleCache.set(keyId, handle);
}

export function clearLtsmHandleCaches(): void {
  identityHandleCache.clear();
  groupKeyHandleCache.clear();
}

/** Reload WASM key handles from persisted ltsmExport blobs (OkLine load_from_export). */
export async function rehydrateLtsmKeyHandles(
  bridge: LtsmBridge,
  keys: StoredE2eeKey[],
): Promise<number> {
  let loaded = 0;
  for (const key of keys) {
    if (key.keyId == null || !key.ltsmExport) {
      continue;
    }
    const keyId = Number(key.keyId);
    if (identityHandleCache.has(keyId)) {
      continue;
    }
    try {
      const handle = await bridge.e2eeLoadKey(key.ltsmExport);
      cacheIdentityHandle(keyId, handle);
      loaded += 1;
    } catch (err) {
      console.warn(
        `[ltsm] e2eeLoadKey failed for keyId=${keyId}:`,
        err instanceof Error ? err.message : err,
      );
    }
  }
  if (loaded > 0) {
    console.log(`[ltsm] rehydrated ${loaded} E2EE key handle(s) from storage`);
  }
  return loaded;
}

async function getIdentityHandle(
  bridge: LtsmBridge,
  keyId: number,
  selfExport: string,
): Promise<number> {
  const cached = identityHandleCache.get(keyId);
  if (cached != null) {
    return cached;
  }
  // OkLine load_from_export: one e2eeLoadKey handle per keyId, reused for V1/V2.
  const handle = await bridge.e2eeLoadKey(selfExport);
  cacheIdentityHandle(keyId, handle);
  return handle;
}

function keyIdToBytes(n: number, length = 4): Buffer {
  const buf = Buffer.alloc(length);
  let v = Number(n) >>> 0;
  for (let i = length - 1; i >= 0; i--) {
    buf[i] = v & 0xff;
    v >>>= 8;
  }
  return buf;
}

function encSharedToB64(value: string | Buffer | Uint8Array): string {
  if (typeof value === "string") {
    return value;
  }
  return Buffer.from(value).toString("base64");
}

/** Chrome extension V1 chunk layout: salt(8) + body + tag(16) + keyIds. */
function buildWasmV1Chunks(
  ct: Buffer,
  senderKeyId: number,
  receiverKeyId: number,
): Buffer[] {
  return [
    ct.subarray(0, 8),
    ct.subarray(8, ct.length - 16),
    ct.subarray(ct.length - 16),
    keyIdToBytes(senderKeyId),
    keyIdToBytes(receiverKeyId),
  ];
}

export type GroupSharedKeyInfo = {
  groupKeyId: number;
  creator: string;
  creatorKeyId: number;
  receiverKeyId?: number;
  encryptedSharedKey: string | Buffer | Uint8Array;
};

export async function getGroupKeyHandleViaLtsm(
  bridge: LtsmBridge,
  groupMid: string,
  selfExport: string,
  selfKeyId: number,
  gsk: GroupSharedKeyInfo,
  getCreatorPubB64: (mid: string, keyId: number) => Promise<string>,
): Promise<{ handle: number; groupKeyId: number }> {
  const groupKeyId = gsk.groupKeyId;
  const cacheKey = `${groupMid}:${groupKeyId}`;
  const cached = groupKeyHandleCache.get(cacheKey);
  if (cached != null) {
    return { handle: cached, groupKeyId };
  }
  const myKeyId = gsk.receiverKeyId ?? selfKeyId;
  const myHandle = await getIdentityHandle(bridge, myKeyId, selfExport);
  const creatorPubB64 = await getCreatorPubB64(gsk.creator, gsk.creatorKeyId);
  const unwrapChannel = await bridge.e2eeCreateChannelWithPubkey(
    myHandle,
    creatorPubB64,
  );
  const handle = await bridge.e2eeUnwrapGroupSharedKey(
    unwrapChannel,
    encSharedToB64(gsk.encryptedSharedKey),
  );
  groupKeyHandleCache.set(cacheKey, handle);
  return { handle, groupKeyId };
}

/** Encrypt a group text message via WASM (Chrome V1 — V2 MAC-fails under Node Embind). */
export async function encryptGroupTextViaLtsm(
  bridge: LtsmBridge,
  params: {
    groupMid: string;
    myMid: string;
    text: string;
    selfExport: string;
    selfKeyId: number;
    gsk: GroupSharedKeyInfo;
    getCreatorPubB64: (mid: string, keyId: number) => Promise<string>;
  },
): Promise<Buffer[]> {
  const myHandle = await getIdentityHandle(
    bridge,
    params.selfKeyId,
    params.selfExport,
  );
  const { handle: gkHandle, groupKeyId } = await getGroupKeyHandleViaLtsm(
    bridge,
    params.groupMid,
    params.selfExport,
    params.selfKeyId,
    params.gsk,
    params.getCreatorPubB64,
  );
  const myPub = await bridge.e2eePublicKeyForHandle(myHandle);
  const channel = await bridge.e2eeCreateChannelWithPubkey(gkHandle, myPub);
  // Compact JSON matches Chrome extension / OkLine serialize_plaintext.
  const plaintext = JSON.stringify({ text: params.text });
  const ctB64 = await bridge.e2eeEncryptV1({
    channelId: channel,
    plaintextB64: Buffer.from(plaintext, "utf8").toString("base64"),
  });
  return buildWasmV1Chunks(
    Buffer.from(ctB64, "base64"),
    params.selfKeyId,
    groupKeyId,
  );
}

function byte2int(buf: Buffer): number {
  let n = 0;
  for (let i = 0; i < buf.length; i++) {
    n = (n << 8) | (buf[i]! & 0xff);
  }
  return n >>> 0;
}

function normalizeContentType(contentType: unknown): number {
  if (typeof contentType === "number") return contentType;
  if (contentType === "NONE" || contentType == null) return 0;
  if (contentType === "IMAGE") return 1;
  if (typeof contentType === "string") {
    const n = Number(contentType);
    if (!Number.isNaN(n)) return n;
  }
  return 0;
}

function normalizeChunks(
  chunks: Array<Buffer | Uint8Array | string>,
): Buffer[] {
  return chunks.map((chunk) =>
    typeof chunk === "string" ? Buffer.from(chunk, "utf8") : Buffer.from(chunk),
  );
}

/** Decrypt a V1 E2EE group text payload (inverse of encryptGroupTextViaLtsm). */
export async function decryptGroupTextViaLtsm(
  bridge: LtsmBridge,
  params: {
    groupMid: string;
    myMid: string;
    from: string;
    selfExport: string;
    selfKeyId: number;
    selfPubB64?: string;
    gsk: GroupSharedKeyInfo;
    getCreatorPubB64: (mid: string, keyId: number) => Promise<string>;
    chunks: Array<Buffer | Uint8Array | string>;
    contentMetadata?: Record<string, string>;
    contentType?: unknown;
  },
): Promise<string> {
  const normalized = normalizeChunks(params.chunks);
  if (normalized.length < 5) {
    throw new Error("invalid E2EE chunk layout");
  }

  const specVersion = params.contentMetadata?.e2eeVersion ?? "2";
  const senderKeyId = byte2int(normalized[3]!);
  const receiverKeyId = byte2int(normalized[4]!);
  const contentType = normalizeContentType(params.contentType);

  const { handle: gkHandle } = await getGroupKeyHandleViaLtsm(
    bridge,
    params.groupMid,
    params.selfExport,
    params.selfKeyId,
    params.gsk,
    params.getCreatorPubB64,
  );

  if (specVersion === "1") {
    if (!normalized[0] || !normalized[1] || !normalized[2]) {
      throw new Error("invalid V1 E2EE chunk layout");
    }
    const ciphertext = Buffer.concat([
      normalized[0],
      normalized[1],
      normalized[2],
    ]);
    const myHandle = await getIdentityHandle(
      bridge,
      params.selfKeyId,
      params.selfExport,
    );
    const myPub = await bridge.e2eePublicKeyForHandle(myHandle);
    const channel = await bridge.e2eeCreateChannelWithPubkey(gkHandle, myPub);
    const ptB64 = await bridge.e2eeDecryptV1({
      channelId: channel,
      ciphertextB64: ciphertext.toString("base64"),
    });
    const parsed = JSON.parse(
      Buffer.from(ptB64, "base64").toString("utf8"),
    ) as { text?: string };
    return parsed.text ?? "";
  }

  const senderPubB64 =
    params.from === params.myMid
      ? (params.selfPubB64 ??
        (await bridge.e2eePublicKeyForHandle(
          await getIdentityHandle(bridge, params.selfKeyId, params.selfExport),
        )))
      : await params.getCreatorPubB64(params.from, senderKeyId);
  const channel = await bridge.e2eeCreateChannelWithPubkey(
    gkHandle,
    senderPubB64,
  );
  const ciphertext = Buffer.concat([
    normalized[0]!,
    normalized[1]!,
    normalized[2]!,
  ]);
  const ptB64 = await bridge.e2eeDecryptV2({
    channelId: channel,
    to: params.groupMid,
    from: params.from,
    senderKeyId,
    receiverKeyId,
    contentType,
    ciphertextB64: ciphertext.toString("base64"),
  });
  const parsed = JSON.parse(
    Buffer.from(ptB64, "base64").toString("utf8"),
  ) as { text?: string; keyMaterial?: string; fileName?: string };
  return parsed.text ?? "";
}

export async function encryptGroupPayloadViaLtsm(
  bridge: LtsmBridge,
  params: {
    groupMid: string;
    myMid: string;
    selfExport: string;
    selfKeyId: number;
    gsk: GroupSharedKeyInfo;
    getCreatorPubB64: (mid: string, keyId: number) => Promise<string>;
    plaintext: string;
    contentType?: number;
  },
): Promise<Buffer[]> {
  const myHandle = await getIdentityHandle(
    bridge,
    params.selfKeyId,
    params.selfExport,
  );
  const { handle: gkHandle, groupKeyId } = await getGroupKeyHandleViaLtsm(
    bridge,
    params.groupMid,
    params.selfExport,
    params.selfKeyId,
    params.gsk,
    params.getCreatorPubB64,
  );
  const myPub = await bridge.e2eePublicKeyForHandle(myHandle);
  const channel = await bridge.e2eeCreateChannelWithPubkey(gkHandle, myPub);

  const ctB64 = await bridge.e2eeEncryptV1({
    channelId: channel,
    plaintextB64: Buffer.from(params.plaintext, "utf8").toString("base64"),
  });
  return buildWasmV1Chunks(
    Buffer.from(ctB64, "base64"),
    params.selfKeyId,
    groupKeyId,
  );
}

type SquareObsClient = {
  base?: {
    authToken?: string;
    obs?: {
      uploadObjTalk: (
        to: string,
        type: string,
        data: Blob,
        oid?: string,
        filename?: string,
      ) => Promise<{ objId: string; objHash: string; headers: Headers }>;
      uploadObjectForService?: (options: {
        data: Blob;
        oType: string;
        obsPath: string;
        params?: Record<string, unknown>;
        filename?: string;
        addHeaders?: Record<string, string>;
      }) => Promise<{ objId: string; objHash: string; headers: Headers }>;
    };
    talk?: {
      acquireEncryptedAccessToken?: (
        featureType: number,
      ) => Promise<string>;
      getReqseq?: (category: string) => Promise<number>;
    };
    square?: {
      sendMessage: (options: {
        squareChatMid: string;
        text?: string;
        contentType?: number;
        contentMetadata?: Record<string, string>;
        relatedMessageId?: string;
      }) => Promise<unknown>;
    };
  };
};

/** Send an image to an OpenChat (square) via non-E2EE OBS upload. */
export async function sendSquareImageViaObs(
  client: SquareObsClient,
  squareChatMid: string,
  imageBytes: Buffer,
  filename: string,
  mimeType: string,
  _options?: { relatedMessageId?: string },
): Promise<{ id?: string }> {
  const obs = client.base?.obs;
  if (!obs?.uploadObjTalk) {
    throw new Error("Square image send prerequisites missing");
  }

  const ext = filename.includes(".") ? filename.split(".").pop()! : "jpg";
  const uploadName = filename || `line.${ext}`;
  const blob = new Blob([imageBytes], { type: mimeType });

  // OpenChat images are committed by OBS upload alone (g2/m/reqseq); a follow-up
  // square.sendMessage call returns ILLEGAL_ARGUMENT and is not required.
  const { objId } = await obs.uploadObjTalk(
    squareChatMid,
    "image",
    blob,
    undefined,
    uploadName,
  );
  if (!objId) {
    throw new Error("Square OBS upload returned empty objId");
  }
  return { id: objId };
}

/**
 * Send a group/1:1 image as a PLAIN (non-E2EE) OBS upload so LINE PC Desktop
 * renders it. LTSM-based accounts cannot produce E2EE v2 group media (the WASM
 * v2 AEAD does not work under Node), and PC will not display E2EE v1 group
 * images — but it displays plain OBS images fine on every client.
 */
export async function sendGroupImagePlainViaObs(
  client: SquareObsClient,
  groupMid: string,
  imageBytes: Buffer,
  filename: string,
  mimeType: string,
): Promise<{ id?: string }> {
  const obs = client.base?.obs;
  if (!obs?.uploadObjTalk) {
    throw new Error("Plain group image send prerequisites missing (uploadObjTalk)");
  }
  const ext = filename.includes(".") ? filename.split(".").pop()! : "jpg";
  const uploadName = filename || `line.${ext}`;
  const blob = new Blob([imageBytes], { type: mimeType });
  const { objId } = await obs.uploadObjTalk(
    groupMid,
    "image",
    blob,
    undefined,
    uploadName,
  );
  if (!objId) {
    throw new Error("Group OBS plain upload returned empty objId");
  }
  return { id: objId };
}

type LtsmTalkClient = {
  base?: {
    profile?: { mid?: string };
    talk?: {
      sendMessage: (opts: Record<string, unknown>) => Promise<unknown>;
      getLastE2EEGroupSharedKey: (opts: {
        keyVersion: number;
        chatMid: string;
      }) => Promise<GroupSharedKeyInfo>;
    };
    e2ee?: {
      getE2EELocalPublicKey: (
        mid: string,
        keyId: number,
      ) => Promise<Buffer | Uint8Array>;
    };
  };
};

/** Send an E2EE group message using WASM (bypasses linejs privKey requirement). */
export async function sendGroupMessageViaLtsm(
  client: LtsmTalkClient,
  groupMid: string,
  text: string,
  selfKey: StoredE2eeKey,
  options?: { bridge?: LtsmBridge; relatedMessageId?: string },
): Promise<void> {
  const b = options?.bridge ?? getLtsmBridge();
  const myMid = client.base?.profile?.mid;
  const talk = client.base?.talk;
  const e2ee = client.base?.e2ee;
  if (
    !myMid ||
    !talk?.sendMessage ||
    !talk.getLastE2EEGroupSharedKey ||
    !e2ee ||
    !selfKey.ltsmExport ||
    selfKey.keyId == null
  ) {
    throw new Error("LTSM group send prerequisites missing");
  }
  const gsk = await talk.getLastE2EEGroupSharedKey({
    keyVersion: 2,
    chatMid: groupMid,
  });
  const getCreatorPubB64 = async (mid: string, keyId: number) => {
    const pub = await e2ee.getE2EELocalPublicKey(mid, keyId);
    return Buffer.from(pub).toString("base64");
  };
  const chunks = await encryptGroupTextViaLtsm(b, {
    groupMid,
    myMid,
    text,
    selfExport: selfKey.ltsmExport,
    selfKeyId: Number(selfKey.keyId),
    gsk,
    getCreatorPubB64,
  });
  await talk.sendMessage({
    to: groupMid,
    e2ee: true,
    chunks,
    relatedMessageId: options?.relatedMessageId,
    contentMetadata: {
      e2eeVersion: "1",
      contentType: "0",
      e2eeMark: "2",
    },
  });
}

export async function validateLtsmStoredKey(
  bridge: LtsmBridge,
  stored: StoredE2eeKey,
  serverPubB64?: string,
): Promise<boolean> {
  if (!stored.ltsmExport || !stored.pubKey) {
    return false;
  }
  try {
    const handle = await bridge.e2eeLoadKey(stored.ltsmExport);
    const wasmPub = await bridge.e2eePublicKeyForHandle(handle);
    if (wasmPub !== stored.pubKey) {
      return false;
    }
    if (serverPubB64 && wasmPub !== serverPubB64) {
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

/** Encrypt group E2EE payload via WASM (bypasses group privKey export). */
export async function encryptGroupE2EEMessageViaLtsm(
  client: {
    base?: {
      profile?: { mid?: string };
      talk?: TalkKeyLookup;
      storage?: {
        get: (key: string) => Promise<string | undefined>;
        set: (key: string, value: string) => Promise<void>;
      };
      e2ee?: E2eeKeyLookup & {
        getE2EELocalPublicKey: (
          mid: string,
          keyId?: number,
        ) => Promise<Buffer | { privKey?: string; keyId?: number }>;
      };
    };
    talk?: {
      getLastE2EEGroupSharedKey: (opts: {
        keyVersion: number;
        chatMid: string;
      }) => Promise<GroupSharedKeyInfo & { creator: string }>;
    };
    e2ee?: {
      getE2EELocalPublicKey: (
        mid: string,
        keyId?: number,
      ) => Promise<Buffer | { privKey?: string; keyId?: number }>;
    };
  },
  params: {
    groupMid: string;
    myMid: string;
    selfKeyData: StoredE2eeKey;
    data: string | Record<string, unknown>;
    contentType: number;
  },
): Promise<Buffer[]> {
  const talk = client.base?.talk ?? client.talk;
  const e2ee = client.base?.e2ee ?? client.e2ee;
  if (
    !talk?.getLastE2EEGroupSharedKey ||
    !e2ee?.getE2EELocalPublicKey ||
    !params.selfKeyData.ltsmExport ||
    params.selfKeyData.keyId == null
  ) {
    throw new Error("LTSM group encrypt prerequisites missing");
  }
  const bridge = getLtsmBridge();
  const selfKeyId = Number(params.selfKeyData.keyId);

  const gsk = await talk.getLastE2EEGroupSharedKey({
    keyVersion: 2,
    chatMid: params.groupMid,
  });
  const getCreatorPubB64 = async (mid: string, keyId: number) => {
    const pub = await e2ee.getE2EELocalPublicKey(mid, keyId);
    return Buffer.from(pub as Buffer).toString("base64");
  };
  const payload =
    typeof params.data === "string"
      ? JSON.stringify({ text: params.data })
      : JSON.stringify(params.data);

  // E2EE v2 (both WASM and Node) does not work for LTSM accounts under Node, so
  // group text is always sent as E2EE v1.
  return encryptGroupPayloadViaLtsm(bridge, {
    groupMid: params.groupMid,
    myMid: params.myMid,
    selfExport: params.selfKeyData.ltsmExport,
    selfKeyId,
    gsk,
    getCreatorPubB64,
    plaintext: payload,
    contentType: params.contentType,
  });
}

type LtsmRuntime = {
  unwrapGroupSharedKey(
    ltsmExport: string,
    creatorPubB64: string,
    encryptedSharedKeyB64: string,
    selfPubB64?: string,
    selfKeyId?: number,
  ): Promise<Buffer>;
  encryptGroupE2EEMessage(
    client: Parameters<typeof encryptGroupE2EEMessageViaLtsm>[0],
    groupMid: string,
    myMid: string,
    selfKeyData: StoredE2eeKey,
    data: string | Record<string, unknown>,
    contentType: number,
  ): Promise<Buffer[]>;
};

declare global {
  var __linePromoLtsmRuntime: LtsmRuntime | undefined;
}

export function installLtsmRuntime(bridge?: LtsmBridge): void {
  const b = bridge ?? getLtsmBridge();
  globalThis.__linePromoLtsmRuntime = {
    unwrapGroupSharedKey(
      ltsmExport,
      creatorPubB64,
      encryptedSharedKeyB64,
      selfPubB64,
      selfKeyId,
    ) {
      return unwrapGroupSharedKeyViaLtsm(
        b,
        ltsmExport,
        creatorPubB64,
        encryptedSharedKeyB64,
        selfPubB64,
        selfKeyId,
      );
    },
    encryptGroupE2EEMessage(client, groupMid, myMid, selfKeyData, data, contentType) {
      return encryptGroupE2EEMessageViaLtsm(
        client as Parameters<typeof encryptGroupE2EEMessageViaLtsm>[0],
        {
          groupMid,
          myMid,
          selfKeyData,
          data,
          contentType,
        },
      );
    },
  };
}

/** Global hook consumed by the patched linejs requestSQR (see patch-linejs-login.ts). */
type LtsmLoginHook = {
  curveKeyId: number | null;
  createQrSecretUrl(): Promise<string>;
  unwrapAndSave(
    meta: LtsmE2eeMeta,
    storage: { set: (key: string, value: string) => Promise<void> },
    mid?: string,
  ): Promise<{ keyId: number } | null>;
};

export function createLtsmLoginHook(
  bridge: LtsmBridge,
  e2ee: LinejsE2eeApi,
  useWasmQr = process.env.LINE_LTSM_QR !== "0",
): LtsmLoginHook {
  let curveKeyId: number | null = null;
  let qrSecret: Buffer | Uint8Array | null = null;

  return {
    get curveKeyId() {
      return curveKeyId;
    },
    async createQrSecretUrl() {
      if (useWasmQr) {
        const created = await createWasmQrSecret(bridge);
        curveKeyId = created.curveKeyId;
        console.log("[login] QR secret via ltsm.wasm");
        return created.secretUrl;
      }
      const [secret, url] = e2ee.createSqrSecret();
      qrSecret = secret;
      console.log("[login] QR secret via linejs (single ephemeral key)");
      return url;
    },
    async unwrapAndSave(meta, storage, mid) {
      if (curveKeyId != null) {
        const primary = await unwrapE2eeToLinejsStorage(
          bridge,
          curveKeyId,
          meta,
          storage,
          mid,
        );
        if (primary) {
          return { keyId: primary.keyId };
        }
        console.warn("[login] WASM unwrap returned no keys");
      }
      if (qrSecret) {
        const decoded = await decodeE2eeWithQrSecret(
          e2ee,
          meta,
          qrSecret,
          storage,
          mid,
        );
        if (decoded) {
          return decoded;
        }
        console.warn("[login] linejs decode with QR secret failed");
      }
      return null;
    },
  };
}

declare global {
  var __linePromoLtsm: LtsmLoginHook | undefined;
}

export function installLtsmLoginHook(hook: LtsmLoginHook): void {
  globalThis.__linePromoLtsm = hook;
}

export function clearLtsmLoginHook(): void {
  delete globalThis.__linePromoLtsm;
}
