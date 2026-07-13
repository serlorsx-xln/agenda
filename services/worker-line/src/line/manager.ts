import { promises as fs } from "node:fs";
import path from "node:path";

import { loginWithAuthToken } from "@evex/linejs";
import { and, eq, ne, notInArray, sql } from "drizzle-orm";

import { db, lineChats, lineConnection } from "@line/db";

import { env } from "../env.js";
import { log } from "../logger.js";
import {
  decryptSessionPayload,
  encryptSessionPayload,
} from "../session-crypto.js";
import {
  clearLtsmHandleCaches,
  getLtsmBridge,
  rehydrateLtsmKeyHandles,
  sendGroupMessageViaLtsm,
  sendGroupImagePlainViaObs,
  sendSquareImageViaObs,
  decryptGroupTextViaLtsm,
  validateLtsmStoredKey,
  type StoredE2eeKey,
  type GroupSharedKeyInfo,
} from "./ltsm-bridge.js";
import {
  countHotSessions,
  enforceHotSessionLimit,
  getSessionPoolStats,
  hibernateSession,
  startSessionEvictionSweep,
  stopSessionEvictionSweep,
  touchSession,
  unregisterSession,
} from "./session-pool.js";
import { EncryptedFileStorage } from "./encrypted-storage.js";
import { loadMediaAsset } from "./media.js";
import {
  MAX_IMAGES_PER_MESSAGE,
  uploadMultipleImagesPlainViaObs,
  type ImageUploadInput,
} from "./obs-multi-image.js";
import { loginWithQrV3False } from "./login-qr-v3-false.js";
import {
  stopAutoReplyListener,
  syncAutoReplyListener,
} from "./auto-reply.js";

type ConnectionStatus = "disconnected" | "connecting" | "connected" | "error";

/**
 * linejs types are intentionally loose (self-bot library). We keep a narrow,
 * defensive surface here and cast where the public typings are ambiguous.
 */
type ChatKind = "square" | "group";

type InboundMessage = {
  id?: string;
  from?: string;
  to?: string;
  chunks?: Array<Buffer | Uint8Array | string>;
  contentMetadata?: Record<string, string>;
  contentType?: unknown;
  text?: string;
};

type LineClient = {
  getMyProfile?: () => Promise<{ mid?: string; displayName?: string }>;
  fetchJoinedSquareChats?: () => Promise<unknown[]>;
  fetchJoinedChats?: () => Promise<unknown[]>;
  fetchUsers?: () => Promise<
    Array<{ mid?: string; displayName?: string; raw?: { displayName?: string; targetUserMid?: string } }>
  >;
  getChat?: (chatMid: string) => Promise<{
    sendMessage: (input: string | { text?: string }) => Promise<unknown>;
    fetchMessages?: (limit?: number) => Promise<unknown[]>;
  }>;
  base?: {
    profile?: { mid?: string; displayName?: string };
    square?: {
      sendMessage: (input: {
        squareChatMid: string;
        text: string;
        relatedMessageId?: string;
      }) => Promise<unknown>;
      createSquare: (options: {
        squareName: string;
        displayName: string;
        description?: string;
        searchable?: boolean;
      }) => Promise<{
        squareChat?: { mid?: string; name?: string };
        square?: { mid?: string; name?: string };
      }>;
      fetchSquareChatEvents?: (options: {
        squareChatMid: string;
        syncToken?: string;
        limit?: number;
      }) => Promise<{
        events?: Array<{
          payload?: {
            receiveMessage?: {
              squareMessage?: {
                message?: InboundMessage & { to?: string };
              };
            };
          };
        }>;
        syncToken?: string;
      }>;
      /** Official paginated OpenChat room list (prefer over fetchMyEvents). */
      getJoinedSquareChats?: (input: {
        request: { limit?: number; continuationToken?: string };
      }) => Promise<{
        squareChats?: Array<{
          squareChatMid?: string;
          name?: string;
        }>;
        continuationToken?: string;
      }>;
      getSquareChatStatus?: (input: {
        request: { squareChatMid: string };
      }) => Promise<{
        chatStatus?: {
          otherStatus?: { memberCount?: number };
        };
        /** Some linejs builds nest status under squareChatStatus. */
        squareChatStatus?: {
          otherStatus?: { memberCount?: number };
        };
      }>;
    };
    talk?: {
      getChats?: (options: {
        chatMids: string[];
        withMembers?: boolean;
      }) => Promise<{
        chats?: Array<{
          chatMid?: string;
          memberMids?: string[] | Record<string, unknown>;
          extra?: { groupExtra?: { memberMids?: Record<string, unknown> } };
        }>;
      }>;
      getContactsV2?: (input: {
        mids: string[];
      }) => Promise<{
        contacts?: Record<string, { displayName?: string }>;
      }>;
      getE2EEPublicKeys?: () => Promise<unknown[]>;
      getPreviousMessagesV2WithRequest?: (
        input: { request: { chatMid: string; maxCount: number } },
      ) => Promise<{
        chatMessages?: InboundMessage[];
      }>;
      getLastE2EEGroupSharedKey?: (opts: {
        keyVersion: number;
        chatMid: string;
      }) => Promise<GroupSharedKeyInfo>;
      createChat?: (input: {
        request: {
          type?: number;
          name?: string;
          targetUserMids?: string[];
        };
      }) => Promise<{
        chat?: {
          chatMid?: string;
          chatName?: string;
          extra?: { groupExtra?: { memberMids?: Record<string, number> } };
        };
      }>;
    };
    on?: (event: string, cb: (value: unknown) => void) => void;
    authToken?: string;
    logout?: () => Promise<void>;
    relation?: {
      getUserFriendIds?: (input: {
        request: { blockStatus: string };
      }) => Promise<{ userFriendMids?: string[] }>;
    };
    e2ee?: {
      verifyE2EEKeyPair: (privKey: Buffer, pubKey: Buffer) => boolean;
      verifyStoredKeyAgainstServer: (
        keyId: string | number,
        privKey: Buffer,
      ) => Promise<boolean>;
      getE2EESelfKeyData: (mid: string) => Promise<{
        keyId?: string | number;
        privKey?: string;
        pubKey?: string;
      }>;
      getE2EELocalPublicKey: (
        mid: string,
        keyId?: string | number,
      ) => Promise<{ privKey?: string; keyId?: string | number } | Buffer>;
      tryRegisterE2EEGroupKey: (chatMid: string) => Promise<unknown>;
    };
    storage?: {
      set: (key: string, value: string | null) => Promise<void>;
    };
  };
  logout?: () => Promise<void>;
};

const E2EE_INVALID_ERROR =
  "e2ee_keys_invalid — scan QR on LINE phone to restore encryption keys";

const E2EE_DEGRADED_WINDOW_MS = 5 * 60 * 1000;
const E2EE_DEGRADED_THRESHOLD = 3;

type SessionState = {
  userId: string;
  status: ConnectionStatus;
  client?: LineClient;
  qrUrl?: string;
  pin?: string;
  mid?: string;
  displayName?: string;
  lastError?: string;
  loginInFlight: boolean;
  /** Bumped on disconnect / new login so stale QR callbacks are ignored. */
  loginGeneration: number;
  e2eeDecryptWindow?: { startedAt: number; count: number };
};

type SessionMeta = {
  authToken?: string;
  mid?: string;
  displayName?: string;
};

const sessions = new Map<string, SessionState>();


function stateFor(userId: string): SessionState {
  let s = sessions.get(userId);
  if (!s) {
    s = {
      userId,
      status: "disconnected",
      loginInFlight: false,
      loginGeneration: 0,
    };
    sessions.set(userId, s);
  }
  return s;
}

export function recordE2eeDecryptFailure(userId: string): void {
  const s = stateFor(userId);
  const now = Date.now();
  if (
    !s.e2eeDecryptWindow ||
    now - s.e2eeDecryptWindow.startedAt > E2EE_DEGRADED_WINDOW_MS
  ) {
    s.e2eeDecryptWindow = { startedAt: now, count: 1 };
    return;
  }
  s.e2eeDecryptWindow.count += 1;
}

export function getE2eeStatus(userId: string): "ok" | "degraded" | "invalid" {
  const s = stateFor(userId);
  if (s.lastError === E2EE_INVALID_ERROR) return "invalid";
  const w = s.e2eeDecryptWindow;
  if (
    w &&
    w.count >= E2EE_DEGRADED_THRESHOLD &&
    Date.now() - w.startedAt <= E2EE_DEGRADED_WINDOW_MS
  ) {
    return "degraded";
  }
  return "ok";
}

function sanitize(userId: string): string {
  return userId.replace(/[^a-zA-Z0-9_-]/g, "_");
}

function storagePath(userId: string): string {
  return path.join(env.SESSION_DIR, `${sanitize(userId)}.storage.json`);
}

function metaPath(userId: string): string {
  return path.join(env.SESSION_DIR, `${sanitize(userId)}.meta.json`);
}

function dropClientFromMemory(userId: string): void {
  const state = stateFor(userId);
  state.client = undefined;
}

function hibernateUserSession(userId: string): void {
  hibernateSession(userId, dropClientFromMemory);
}

function hasLiveClient(userId: string): boolean {
  return Boolean(sessions.get(userId)?.client);
}

async function readMeta(userId: string): Promise<SessionMeta | null> {
  try {
    const raw = await fs.readFile(metaPath(userId), "utf8");
    return JSON.parse(decryptSessionPayload(raw)) as SessionMeta;
  } catch {
    return null;
  }
}

async function writeMeta(userId: string, meta: SessionMeta): Promise<void> {
  await fs.mkdir(env.SESSION_DIR, { recursive: true });
  const payload = encryptSessionPayload(JSON.stringify(meta));
  await fs.writeFile(metaPath(userId), payload, "utf8");
}

async function updateConnectionRow(
  userId: string,
  patch: {
    status?: ConnectionStatus;
    mid?: string | null;
    displayName?: string | null;
    lastError?: string | null;
    connectedAt?: Date | null;
    lastSyncedAt?: Date;
  },
): Promise<void> {
  try {
    await db
      .insert(lineConnection)
      .values({ userId, status: patch.status ?? "disconnected", ...patch })
      .onConflictDoUpdate({
        target: lineConnection.userId,
        set: { ...patch, updatedAt: new Date() },
      });
  } catch (err) {
    console.warn(`[line] failed to update connection row for ${userId}:`, err);
  }
}

const MID_IN_USE_ERROR = "line_mid_in_use";

function bumpLoginGeneration(userId: string): number {
  const state = stateFor(userId);
  state.loginGeneration += 1;
  return state.loginGeneration;
}

function isStaleLogin(userId: string, generation: number): boolean {
  const state = stateFor(userId);
  return (
    state.loginGeneration !== generation || state.status === "disconnected"
  );
}

/** Map linejs / LINE HTTP errors to stable codes for the UI. */
function normalizeLoginError(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);
  const lower = msg.toLowerCase();
  if (msg.includes("status=410") || /\b410\b/.test(msg)) {
    return "qr_expired";
  }
  if (
    lower.includes("有効期限") ||
    lower.includes("expired") ||
    lower.includes("expire")
  ) {
    return "qr_expired";
  }
  if (lower.includes("timeout") || lower.includes("timed out")) {
    return "login_timeout";
  }
  if (lower.includes("cancel")) {
    return "login_cancelled";
  }
  return "login_failed";
}

async function isMidTakenByOtherUser(
  userId: string,
  mid: string,
): Promise<boolean> {
  const rows = await db
    .select({ userId: lineConnection.userId })
    .from(lineConnection)
    .where(and(eq(lineConnection.mid, mid), ne(lineConnection.userId, userId)))
    .limit(1);
  return rows.length > 0;
}

async function rejectMidConflict(
  userId: string,
  client?: LineClient,
): Promise<void> {
  const state = stateFor(userId);
  state.status = "error";
  state.loginInFlight = false;
  state.qrUrl = undefined;
  state.pin = undefined;
  state.lastError = MID_IN_USE_ERROR;
  state.client = undefined;
  try {
    await client?.logout?.();
    await client?.base?.logout?.();
  } catch {
    // ignore logout errors
  }
  await updateConnectionRow(userId, {
    status: "error",
    lastError: MID_IN_USE_ERROR,
  });
}

/**
 * linejs exposes both OpenChats (SquareChat: mid/name may be getters) and
 * groups (Chat: mid/name are plain properties, raw.chatMid on the thrift
 * struct). Normalize either shape into { chatMid, name }.
 */
function parseChat(
  c: unknown,
  fallbackName: string,
): { chatMid: string; name: string } | null {
  const anyC = c as {
    mid?: string | (() => string);
    name?: string | (() => string);
    squareChatMid?: string;
    chatMid?: string;
    raw?: { squareChatMid?: string; chatMid?: string; name?: string };
  };
  const mid =
    typeof anyC.mid === "function"
      ? anyC.mid()
      : (anyC.mid ??
        anyC.squareChatMid ??
        anyC.chatMid ??
        anyC.raw?.squareChatMid ??
        anyC.raw?.chatMid);
  const name =
    typeof anyC.name === "function"
      ? anyC.name()
      : (anyC.name ?? anyC.raw?.name ?? fallbackName);
  return mid ? { chatMid: mid, name: name ?? fallbackName } : null;
}

const SYNC_LINE_TIMEOUT_MS = 25_000;
const SYNC_STATUS_CONCURRENCY = 6;
const SYNC_GROUP_CHUNK = 50;
const SYNC_DB_CHUNK = 40;

function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  label: string,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`${label} timed out after ${ms}ms`)),
      ms,
    );
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      },
    );
  });
}

async function mapPool<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  if (items.length === 0) return [];
  const results = new Array<R>(items.length);
  let next = 0;
  const workers = Array.from(
    { length: Math.min(concurrency, items.length) },
    async () => {
      while (true) {
        const i = next++;
        if (i >= items.length) return;
        results[i] = await fn(items[i]!, i);
      }
    },
  );
  await Promise.all(workers);
  return results;
}

/**
 * Prefer the real Square API (`getJoinedSquareChats`) over linejs's
 * `fetchJoinedSquareChats`, which only scrapes recent `fetchMyEvents` payloads
 * and routinely misses older OpenChats.
 */
async function discoverJoinedSquareChats(
  client: LineClient,
): Promise<unknown[]> {
  const square = client.base?.square;
  if (typeof square?.getJoinedSquareChats === "function") {
    const chats: unknown[] = [];
    let continuationToken: string | undefined;
    let pages = 0;
    do {
      const res = await withTimeout(
        square.getJoinedSquareChats({
          request: { limit: 100, continuationToken },
        }),
        SYNC_LINE_TIMEOUT_MS,
        "getJoinedSquareChats",
      );
      for (const chat of res.squareChats ?? []) {
        if (chat) chats.push(chat);
      }
      continuationToken = res.continuationToken || undefined;
      pages += 1;
      if (pages > 50) break;
    } while (continuationToken);
    return chats;
  }

  return (
    (await withTimeout(
      Promise.resolve(client.fetchJoinedSquareChats?.() ?? []),
      SYNC_LINE_TIMEOUT_MS,
      "fetchJoinedSquareChats",
    )) ?? []
  );
}

async function discoverJoinedGroupChats(
  client: LineClient,
): Promise<unknown[]> {
  return (
    (await withTimeout(
      Promise.resolve(client.fetchJoinedChats?.() ?? []),
      SYNC_LINE_TIMEOUT_MS,
      "fetchJoinedChats",
    )) ?? []
  );
}

/** LINE mids: OpenChat rooms start with "m", talk groups with "c". */
function inferChatKindFromMid(chatMid: string): ChatKind | null {
  if (chatMid.startsWith("c")) return "group";
  if (chatMid.startsWith("m")) return "square";
  return null;
}

/** Look up the stored kind for a chat so we can pick the right send path. */
async function chatKindFor(userId: string, chatMid: string): Promise<ChatKind> {
  try {
    const [row] = await db
      .select({ kind: lineChats.kind })
      .from(lineChats)
      .where(and(eq(lineChats.userId, userId), eq(lineChats.chatMid, chatMid)))
      .limit(1);
    if (row?.kind === "group") return "group";
    if (row?.kind === "square") return "square";
  } catch {
    // fall through to mid prefix heuristic
  }
  return inferChatKindFromMid(chatMid) ?? "square";
}

async function getMid(
  client: LineClient,
): Promise<{ mid?: string; name?: string }> {
  const baseProfile = client.base?.profile;
  if (baseProfile?.mid) {
    return { mid: baseProfile.mid, name: baseProfile.displayName };
  }
  try {
    const profile = await client.getMyProfile?.();
    if (profile?.mid) {
      return { mid: profile.mid, name: profile.displayName };
    }
  } catch (err) {
    console.warn("[line] getMyProfile failed:", err);
  }
  return {};
}

async function persistProfile(
  userId: string,
  client: LineClient,
  meta: SessionMeta,
): Promise<{ mid?: string; name?: string }> {
  const { mid, name } = await getMid(client);
  const state = stateFor(userId);
  if (mid) state.mid = mid;
  if (name) state.displayName = name;

  const nextMeta: SessionMeta = {
    authToken: meta.authToken ?? client.base?.authToken,
    mid: mid ?? meta.mid,
    displayName: name ?? meta.displayName,
  };

  if (nextMeta.mid && (await isMidTakenByOtherUser(userId, nextMeta.mid))) {
    await rejectMidConflict(userId, client);
    return { mid: undefined, name: undefined };
  }

  await writeMeta(userId, nextMeta);

  if (mid || name) {
    await updateConnectionRow(userId, {
      mid: nextMeta.mid ?? null,
      displayName: nextMeta.displayName ?? null,
    });
  }

  return { mid: nextMeta.mid, name: nextMeta.displayName };
}

/**
 * Lightweight OpenChat member count via getSquareChatStatus (one RPC).
 * Avoid getMembers() during sync — it pages the entire roster and rate-limits.
 */
async function resolveSquareMemberCount(
  client: LineClient,
  chatMid: string,
): Promise<number | null> {
  try {
    const getStatus = client.base?.square?.getSquareChatStatus;
    if (typeof getStatus !== "function") return null;
    const res = await withTimeout(
      getStatus({ request: { squareChatMid: chatMid } }),
      8_000,
      `getSquareChatStatus:${chatMid}`,
    );
    const count =
      res.chatStatus?.otherStatus?.memberCount ??
      res.squareChatStatus?.otherStatus?.memberCount;
    return typeof count === "number" && count >= 0 ? count : null;
  } catch (err) {
    console.warn(`[line] square member count failed for ${chatMid}:`, err);
  }
  return null;
}

async function resolveSquareMemberCounts(
  client: LineClient,
  chatMids: string[],
): Promise<Map<string, number>> {
  const counts = new Map<string, number>();
  if (chatMids.length === 0) return counts;
  await mapPool(chatMids, SYNC_STATUS_CONCURRENCY, async (chatMid) => {
    const count = await resolveSquareMemberCount(client, chatMid);
    if (count != null) counts.set(chatMid, count);
    return count;
  });
  return counts;
}

async function resolveGroupMemberCounts(
  client: LineClient,
  chatMids: string[],
): Promise<Map<string, number>> {
  const counts = new Map<string, number>();
  if (chatMids.length === 0) return counts;
  const getChats = client.base?.talk?.getChats;
  if (typeof getChats !== "function") return counts;

  for (let i = 0; i < chatMids.length; i += SYNC_GROUP_CHUNK) {
    const chunk = chatMids.slice(i, i + SYNC_GROUP_CHUNK);
    try {
      const res = await withTimeout(
        getChats({ chatMids: chunk, withMembers: true }),
        SYNC_LINE_TIMEOUT_MS,
        "getChats:members",
      );
      for (const chat of res?.chats ?? []) {
        if (!chat.chatMid) continue;
        const fromExtra = chat.extra?.groupExtra?.memberMids;
        const fromTop = chat.memberMids;
        const memberMids = fromExtra ?? fromTop;
        if (memberMids == null) continue;
        const count = Array.isArray(memberMids)
          ? memberMids.length
          : Object.keys(memberMids).length;
        if (count > 0) counts.set(chat.chatMid, count);
      }
    } catch (err) {
      console.warn("[line] group member count batch failed:", err);
    }
  }
  return counts;
}

async function readStorageRaw(userId: string): Promise<Record<string, string>> {
  try {
    const raw = await fs.readFile(storagePath(userId), "utf8");
    return JSON.parse(decryptSessionPayload(raw)) as Record<string, string>;
  } catch {
    return {};
  }
}

async function writeStorageRaw(
  userId: string,
  data: Record<string, string>,
): Promise<void> {
  await fs.mkdir(env.SESSION_DIR, { recursive: true });
  const payload = encryptSessionPayload(JSON.stringify(data));
  await fs.writeFile(storagePath(userId), payload, "utf8");
}

/** Remove corrupted or stale E2EE material from on-disk session storage. */
async function clearE2EEStorageKeys(
  userId: string,
  options?: { groupKeysOnly?: boolean; includeQrCert?: boolean },
): Promise<void> {
  const raw = await readStorageRaw(userId);
  for (const key of Object.keys(raw)) {
    if (options?.groupKeysOnly) {
      if (key.startsWith("e2eeGroupKeys:")) delete raw[key];
    } else if (
      key.startsWith("e2eeKeys:") ||
      key.startsWith("e2eePublicKeys:") ||
      key.startsWith("e2eeGroupKeys:")
    ) {
      delete raw[key];
    }
  }
  if (options?.includeQrCert) {
    delete raw.qrCert;
  }
  await writeStorageRaw(userId, raw);
}

async function setForcePinForE2EE(userId: string): Promise<void> {
  const raw = await readStorageRaw(userId);
  raw.forcePinForE2EE = "1";
  await writeStorageRaw(userId, raw);
}

async function validateSelfE2EEKey(
  client: LineClient,
): Promise<{ valid: boolean; reason?: string }> {
  const e2ee = client.base?.e2ee;
  const mid = client.base?.profile?.mid;
  if (!e2ee || !mid) {
    return { valid: false, reason: "E2EE module unavailable" };
  }

  try {
    const self = (await e2ee.getE2EESelfKeyData(mid)) as StoredE2eeKey & {
      privKey?: string;
      pubKey?: string;
      keyId?: number | string;
      ltsmExport?: string;
    };
    if (!self?.pubKey || self.keyId == null) {
      return { valid: false, reason: "no self E2EE key in storage" };
    }

    const serverKeys = await client.base?.talk?.getE2EEPublicKeys?.();
    let serverPubB64: string | undefined;
    if (serverKeys?.length) {
      for (const key of serverKeys) {
        const entry = key as {
          keyId?: number;
          keyData?: string | Buffer;
          2?: number;
          4?: string | Buffer;
        };
        const keyId = entry.keyId ?? entry[2];
        if (String(keyId) !== String(self.keyId)) continue;
        const keyData = entry.keyData ?? entry[4];
        if (keyData == null) continue;
        serverPubB64 =
          typeof keyData === "string"
            ? keyData
            : Buffer.isBuffer(keyData)
              ? keyData.toString("base64")
              : Buffer.from(keyData).toString("base64");
        break;
      }
    }

    if (self.ltsmExport) {
      const ok = await validateLtsmStoredKey(
        getLtsmBridge(),
        self,
        serverPubB64,
      );
      return ok
        ? { valid: true }
        : { valid: false, reason: "ltsm key does not match LINE server key" };
    }

    if (!self.privKey) {
      return { valid: false, reason: "no self E2EE private key in storage" };
    }

    const priv = Buffer.from(self.privKey, "base64");
    const pub = Buffer.from(self.pubKey, "base64");
    if (!e2ee.verifyE2EEKeyPair(priv, pub)) {
      return { valid: false, reason: "privKey does not derive to pubKey" };
    }
    if (serverPubB64) {
      const serverPub = Buffer.from(serverPubB64, "base64");
      if (!e2ee.verifyE2EEKeyPair(priv, serverPub)) {
        return {
          valid: false,
          reason: "privKey does not match LINE server key",
        };
      }
      return { valid: true };
    }
    const onServer = await e2ee.verifyStoredKeyAgainstServer(
      self.keyId,
      priv,
    );
    if (!onServer) {
      return { valid: false, reason: "privKey does not match LINE server key" };
    }
    return { valid: true };
  } catch (err) {
    return {
      valid: false,
      reason: err instanceof Error ? err.message : String(err),
    };
  }
}

async function ensureGroupE2EE(
  userId: string,
  client: LineClient,
  chatMid: string,
): Promise<void> {
  const e2ee = client.base?.e2ee;
  if (!e2ee) {
    throw new Error("Group E2EE not supported by this LINE client");
  }

  const validation = await validateSelfE2EEKey(client);
  if (!validation.valid) {
    throw new Error(
      `${E2EE_INVALID_ERROR} (${validation.reason ?? "unknown"})`,
    );
  }

  const mid = client.base?.profile?.mid;
  const self =
    mid && e2ee
      ? ((await e2ee.getE2EESelfKeyData(mid)) as StoredE2eeKey)
      : null;
  if (self?.ltsmExport) {
    return;
  }

  await clearE2EEStorageKeys(userId, { groupKeysOnly: true });
  await client.base?.storage?.set?.(`e2eeGroupKeys:${chatMid}`, null);

  try {
    await e2ee.getE2EELocalPublicKey(chatMid, undefined);
  } catch (firstErr) {
    console.warn(
      `[line] group key decrypt failed for ${chatMid}, re-registering:`,
      firstErr instanceof Error ? firstErr.message : firstErr,
    );
    try {
      await e2ee.tryRegisterE2EEGroupKey(chatMid);
      await e2ee.getE2EELocalPublicKey(chatMid, undefined);
    } catch (retryErr) {
      const msg =
        retryErr instanceof Error ? retryErr.message : String(retryErr);
      throw new Error(`Group E2EE setup failed: ${msg}`, { cause: retryErr });
    }
  }
}

function attachTokenPersistence(userId: string, client: LineClient): void {
  try {
    client.base?.on?.("update:authtoken", (token) => {
      if (typeof token === "string") {
        const s = sessions.get(userId);
        void writeMeta(userId, {
          authToken: token,
          mid: s?.mid,
          displayName: s?.displayName,
        });
      }
    });
  } catch {
    // event API not available; ignore
  }
}

async function finalizeLogin(
  userId: string,
  client: LineClient,
  generation: number,
): Promise<void> {
  if (isStaleLogin(userId, generation)) {
    try {
      await client.logout?.();
      await client.base?.logout?.();
    } catch {
      // ignore cleanup errors for abandoned login
    }
    return;
  }

  const state = stateFor(userId);
  state.client = client;
  state.status = "connected";
  state.qrUrl = undefined;
  state.pin = undefined;
  state.lastError = undefined;
  state.loginInFlight = false;

  attachTokenPersistence(userId, client);

  const { mid, name } = await getMid(client);
  state.mid = mid;
  state.displayName = name;

  if (mid && (await isMidTakenByOtherUser(userId, mid))) {
    await rejectMidConflict(userId, client);
    console.warn(`[line] user ${userId} rejected: mid already linked`);
    return;
  }

  const token = client.base?.authToken;
  await writeMeta(userId, { authToken: token, mid, displayName: name });

  const e2eeCheck = await validateSelfE2EEKey(client);
  const lastError = e2eeCheck.valid ? null : E2EE_INVALID_ERROR;
  if (!e2eeCheck.valid) {
    await setForcePinForE2EE(userId);
  }

  await updateConnectionRow(userId, {
    status: "connected",
    mid: mid ?? null,
    displayName: name ?? null,
    lastError,
    connectedAt: new Date(),
  });
  if (e2eeCheck.valid) {
    console.log(`[line] user ${userId} connected (mid=${mid ?? "unknown"})`);
    await warmLtsmSessionForClient(client);
    void syncAutoReplyListener(userId);
  } else {
    state.lastError = E2EE_INVALID_ERROR;
    console.warn(
      `[line] user ${userId} connected but E2EE keys invalid: ${e2eeCheck.reason}`,
    );
  }
}

function handleLoginError(
  userId: string,
  err: unknown,
  generation: number,
): void {
  if (isStaleLogin(userId, generation)) {
    return;
  }

  const state = stateFor(userId);
  state.status = "error";
  state.loginInFlight = false;
  state.qrUrl = undefined;
  state.pin = undefined;
  state.lastError = normalizeLoginError(err);
  void updateConnectionRow(userId, {
    status: "error",
    lastError: state.lastError,
  });
  console.error(`[line] login failed for ${userId}: ${state.lastError}`, err);
}

async function warmLtsmSessionForClient(client: LineClient): Promise<void> {
  const mid = client.base?.profile?.mid;
  const e2ee = client.base?.e2ee;
  if (!mid || !e2ee) return;
  const self = (await e2ee.getE2EESelfKeyData(mid)) as StoredE2eeKey;
  if (!self?.ltsmExport || self.keyId == null) return;
  try {
    await rehydrateLtsmKeyHandles(getLtsmBridge(), [self]);
  } catch (err) {
    console.warn(
      `[line] warmLtsmSession failed:`,
      err instanceof Error ? err.message : err,
    );
  }
}

async function softDisconnectClient(userId: string): Promise<void> {
  stopAutoReplyListener(userId);
  const state = stateFor(userId);
  bumpLoginGeneration(userId);
  try {
    await state.client?.logout?.();
    await state.client?.base?.logout?.();
  } catch {
    // ignore logout failures during soft disconnect
  }
  state.client = undefined;
  state.status = "disconnected";
  state.qrUrl = undefined;
  state.pin = undefined;
  state.lastError = undefined;
  state.loginInFlight = false;
  await updateConnectionRow(userId, {
    status: "disconnected",
    lastError: null,
  });
}

/**
 * Fetch recent messages for a chat (group or square).
 * For groups uses getPreviousMessagesV2WithRequest or chat.fetchMessages.
 * For squares uses fetchSquareChatEvents polling.
 */
export async function fetchRecentMessagesForChat(
  userId: string,
  client: LineClient,
  chatMid: string,
  limit = 50,
  squareSyncByChat?: Map<string, string>,
  _drainBacklog?: boolean,
  onSquareSyncToken?: (chatMid: string, token: string) => void | Promise<void>,
): Promise<InboundMessage[]> {
  const kind = await chatKindFor(userId, chatMid);

  if (kind === "square") {
    const sq = client.base?.square;
    if (!sq?.fetchSquareChatEvents) return [];
    try {
      const syncToken = squareSyncByChat?.get(chatMid);
      const res = await sq.fetchSquareChatEvents({
        squareChatMid: chatMid,
        syncToken,
        limit: limit > 100 ? 100 : limit,
      });
      if (res.syncToken && squareSyncByChat) {
        squareSyncByChat.set(chatMid, res.syncToken);
        void onSquareSyncToken?.(chatMid, res.syncToken);
      }
      const messages: InboundMessage[] = [];
      for (const evt of res.events ?? []) {
        const sqMsg = evt.payload?.receiveMessage?.squareMessage?.message;
        if (sqMsg) {
          messages.push({
            id: sqMsg.id,
            from: sqMsg.from,
            to: sqMsg.to,
            text: sqMsg.text,
            chunks: sqMsg.chunks,
            contentMetadata: sqMsg.contentMetadata,
            contentType: sqMsg.contentType,
          });
        }
      }
      return messages;
    } catch (err) {
      console.warn(`[line] fetchSquareChatEvents failed for ${chatMid}:`, err);
      return [];
    }
  }

  // Group (talk) chat
  const talk = client.base?.talk;
  if (talk?.getPreviousMessagesV2WithRequest) {
    try {
      const res = await talk.getPreviousMessagesV2WithRequest({
        request: { chatMid, maxCount: limit },
      });
      return (res.chatMessages ?? []) as InboundMessage[];
    } catch (err) {
      console.warn(`[line] getPreviousMessagesV2 failed for ${chatMid}:`, err);
    }
  }

  // Fallback: try chat.fetchMessages
  if (client.getChat) {
    try {
      const chat = await client.getChat(chatMid);
      if (chat.fetchMessages) {
        const msgs = await chat.fetchMessages(limit);
        return msgs.map((m: unknown) => {
          const raw = (m as { raw?: InboundMessage }).raw ?? (m as InboundMessage);
          return {
            id: raw.id,
            from: raw.from,
            to: raw.to,
            text: raw.text,
            chunks: raw.chunks,
            contentMetadata: raw.contentMetadata,
            contentType: raw.contentType,
          };
        });
      }
    } catch (err) {
      console.warn(`[line] chat.fetchMessages failed for ${chatMid}:`, err);
    }
  }

  return [];
}

/**
 * Decrypt E2EE text from an inbound chat message.
 * Returns the plaintext or null if not E2EE / decryption is unavailable.
 */
export async function decryptInboundChatText(
  userId: string,
  client: LineClient,
  chatMid: string,
  msg: InboundMessage,
): Promise<string | null> {
  if (msg.text) return msg.text;

  const kind = await chatKindFor(userId, chatMid);
  if (kind !== "group") return msg.text ?? null;

  const chunks = msg.chunks;
  if (!chunks || chunks.length < 5) return msg.text ?? null;

  const mid = client.base?.profile?.mid;
  const e2ee = client.base?.e2ee;
  if (!mid || !e2ee) return msg.text ?? null;

  const self = (await e2ee.getE2EESelfKeyData(mid)) as StoredE2eeKey & {
    pubKey?: string;
  };
  if (!self?.ltsmExport || self.keyId == null) return msg.text ?? null;

  const bridge = getLtsmBridge();
  const talk = client.base?.talk;
  if (!talk?.getLastE2EEGroupSharedKey) return msg.text ?? null;

  let gsk: GroupSharedKeyInfo;
  try {
    gsk = await talk.getLastE2EEGroupSharedKey({
      keyVersion: 2,
      chatMid: chatMid,
    });
  } catch {
    return msg.text ?? null;
  }

  try {
    const plaintext = await decryptGroupTextViaLtsm(bridge, {
      groupMid: chatMid,
      myMid: mid,
      from: msg.from ?? mid,
      selfExport: self.ltsmExport,
      selfKeyId: Number(self.keyId),
      selfPubB64: self.pubKey,
      gsk,
      getCreatorPubB64: async (senderMid: string, keyId: number) => {
        const pub = await e2ee.getE2EELocalPublicKey(senderMid, keyId);
        return Buffer.from(pub as Buffer | Uint8Array).toString("base64");
      },
      chunks,
      contentMetadata: msg.contentMetadata,
      contentType: msg.contentType,
    });
    return plaintext;
  } catch (err) {
    recordE2eeDecryptFailure(userId);
    log("warn", "decryptInboundChatText failed", {
      userId,
      chatMid,
      error: err instanceof Error ? err.message : String(err),
    });
    return msg.text ?? null;
  }
}

export const lineManager = {
  getStatus(userId: string) {
    const s = stateFor(userId);
    const hot = Boolean(s.client);
    const connectionPhase =
      s.status === "connected"
        ? hot
          ? "connected_hot"
          : "connected_cold"
        : s.status;
    return {
      status: s.status,
      connectionPhase,
      hot,
      qrUrl: s.qrUrl ?? null,
      pin: s.pin ?? null,
      mid: s.mid ?? null,
      displayName: s.displayName ?? null,
      lastError: s.lastError ?? null,
      e2eeStatus: getE2eeStatus(userId),
    };
  },

  async startLogin(userId: string, options?: { force?: boolean }) {
    const state = stateFor(userId);
    if (state.status === "connected" && !options?.force) {
      return this.getStatus(userId);
    }
    if (options?.force) {
      await softDisconnectClient(userId);
    }
    // Cancel a stuck/expired QR session so reconnect always gets a fresh code.
    if (state.loginInFlight) {
      bumpLoginGeneration(userId);
    }

    state.status = "connecting";
    state.loginInFlight = true;
    state.qrUrl = undefined;
    state.pin = undefined;
    state.lastError = undefined;
    const generation = bumpLoginGeneration(userId);
    await updateConnectionRow(userId, { status: "connecting", lastError: null });

    const loginTimeoutMs = 6 * 60 * 1000;
    const loginTimeout = setTimeout(() => {
      if (isStaleLogin(userId, generation)) return;
      const s = stateFor(userId);
      if (s.loginInFlight && s.status === "connecting") {
        handleLoginError(userId, new Error("login_timeout"), generation);
      }
    }, loginTimeoutMs);

    await fs.mkdir(env.SESSION_DIR, { recursive: true });
    const storage = new EncryptedFileStorage(storagePath(userId));

    loginWithQrV3False(
      {
        onReceiveQRUrl(url: string) {
          if (isStaleLogin(userId, generation)) return;
          const s = stateFor(userId);
          s.qrUrl = url;
        },
        onPincodeRequest(pin: string) {
          if (isStaleLogin(userId, generation)) return;
          const s = stateFor(userId);
          s.pin = pin;
        },
      },
      storage,
    )
      .then((client) => finalizeLogin(userId, client as LineClient, generation))
      .catch((err) => handleLoginError(userId, err, generation))
      .finally(() => clearTimeout(loginTimeout));

    return this.getStatus(userId);
  },

  /**
   * Return a connected client, attempting a token-based resume if needed.
   * Returns null when the user has no usable session.
   */
  async getReadyClient(userId: string): Promise<LineClient | null> {
    const state = stateFor(userId);
    touchSession(userId);
    if (state.client && state.status === "connected") {
      return state.client;
    }

    const meta = await readMeta(userId);
    if (!meta?.authToken) {
      return null;
    }

    try {
      const storage = new EncryptedFileStorage(storagePath(userId));
      const client = (await loginWithAuthToken(meta.authToken, {
        device: env.LINE_DEVICE,
        storage: storage as never,
      })) as LineClient;
      state.client = client;
      state.status = "connected";
      attachTokenPersistence(userId, client);
      const profile = await persistProfile(userId, client, meta);
      if (state.lastError === MID_IN_USE_ERROR) {
        return null;
      }

      const e2eeCheck = await validateSelfE2EEKey(client);
      const lastError = e2eeCheck.valid ? null : E2EE_INVALID_ERROR;
      state.lastError = e2eeCheck.valid ? undefined : E2EE_INVALID_ERROR;
      if (!e2eeCheck.valid) {
        console.warn(
          `[line] user ${userId} resumed but E2EE keys invalid: ${e2eeCheck.reason}`,
        );
      }

      await warmLtsmSessionForClient(client);

      await updateConnectionRow(userId, {
        status: "connected",
        mid: profile.mid ?? state.mid ?? null,
        displayName: profile.name ?? state.displayName ?? null,
        lastError,
      });
      touchSession(userId);
      await enforceHotSessionLimit(
        hasLiveClient,
        hibernateUserSession,
        userId,
      );
      void syncAutoReplyListener(userId);
      return client;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const permissionDenied =
        /EACCES|EPERM|permission denied/i.test(msg);
      // Storage permission / IO should not present as a "connection failed"
      // red error to users who haven't tried to connect yet this session.
      state.status = permissionDenied ? "disconnected" : "error";
      state.lastError = permissionDenied ? "session_permission" : msg;
      await updateConnectionRow(userId, {
        status: state.status,
        lastError: state.lastError,
      });
      console.warn(
        `[line] resume failed for ${userId}:`,
        state.lastError,
        err,
      );
      return null;
    }
  },

  /**
   * Clear corrupted E2EE keys and start a fresh QR login.
   * Required when priv/pub keys in storage no longer match LINE server keys.
   */
  async resetE2EEAndReconnect(userId: string) {
    const state = stateFor(userId);
    bumpLoginGeneration(userId);
    try {
      await state.client?.logout?.();
      await state.client?.base?.logout?.();
    } catch {
      // drop in-memory client only
    }
    state.client = undefined;
    state.status = "disconnected";
    state.loginInFlight = false;
    state.qrUrl = undefined;
    state.pin = undefined;
    state.lastError = undefined;

    clearLtsmHandleCaches();
    await clearE2EEStorageKeys(userId, { includeQrCert: true });
    await setForcePinForE2EE(userId);
    await updateConnectionRow(userId, {
      status: "disconnected",
      lastError: null,
    });
    return this.startLogin(userId);
  },

  /** Validate self E2EE keys for an active session (used before group campaigns). */
  async validateE2EEForUser(
    userId: string,
  ): Promise<{ valid: boolean; reason?: string }> {
    const client = await this.getReadyClient(userId);
    if (!client) {
      return { valid: false, reason: "LINE session not ready" };
    }
    return validateSelfE2EEKey(client);
  },

  /** Re-login from stored token + storage without wiping E2EE keys. */
  async refreshSession(userId: string) {
    const state = stateFor(userId);
    bumpLoginGeneration(userId);
    try {
      await state.client?.logout?.();
      await state.client?.base?.logout?.();
    } catch {
      // drop in-memory client only; keep on-disk session files
    }
    state.client = undefined;
    state.status = "disconnected";
    state.loginInFlight = false;
    state.qrUrl = undefined;
    state.pin = undefined;

    const client = await this.getReadyClient(userId);
    if (!client) {
      throw new Error("Failed to refresh LINE session from stored token");
    }
    await this.syncChats(userId);
    return this.getStatus(userId);
  },

  async disconnect(userId: string): Promise<void> {
    stopAutoReplyListener(userId);
    unregisterSession(userId);
    const state = stateFor(userId);
    bumpLoginGeneration(userId);
    try {
      await state.client?.logout?.();
      await state.client?.base?.logout?.();
    } catch {
      // ignore logout failures
    }
    state.client = undefined;
    state.status = "disconnected";
    state.qrUrl = undefined;
    state.pin = undefined;
    state.mid = undefined;
    state.displayName = undefined;
    state.lastError = undefined;
    state.loginInFlight = false;

    await Promise.allSettled([
      fs.rm(metaPath(userId), { force: true }),
      fs.rm(storagePath(userId), { force: true }),
    ]);

    await updateConnectionRow(userId, {
      status: "disconnected",
      mid: null,
      displayName: null,
      connectedAt: null,
      lastError: null,
    });
  },

  async syncChats(userId: string): Promise<{ count: number }> {
    const client = await this.getReadyClient(userId);
    if (!client) {
      throw new Error("LINE account not connected");
    }
    const discovered: {
      chatMid: string;
      name: string;
      kind: ChatKind;
    }[] = [];

    // Discover OpenChats + groups in parallel (independent LINE APIs).
    const [squaresSettled, groupsSettled] = await Promise.allSettled([
      discoverJoinedSquareChats(client),
      discoverJoinedGroupChats(client),
    ]);

    if (squaresSettled.status === "fulfilled") {
      for (const c of squaresSettled.value) {
        const parsed = parseChat(c, "OpenChat");
        if (parsed) discovered.push({ ...parsed, kind: "square" });
      }
    } else {
      console.warn(
        `[line] square discovery failed for ${userId}:`,
        squaresSettled.reason,
      );
    }

    if (groupsSettled.status === "fulfilled") {
      for (const c of groupsSettled.value) {
        const parsed = parseChat(c, "Group");
        if (parsed) discovered.push({ ...parsed, kind: "group" });
      }
    } else {
      console.warn(
        `[line] group discovery failed for ${userId}:`,
        groupsSettled.reason,
      );
    }

    // De-dupe by mid (keep first — square vs group mid prefixes don't collide).
    const byMid = new Map<string, (typeof discovered)[number]>();
    for (const chat of discovered) {
      if (!byMid.has(chat.chatMid)) byMid.set(chat.chatMid, chat);
    }
    const unique = [...byMid.values()];

    const squareMids = unique
      .filter((d) => d.kind === "square")
      .map((d) => d.chatMid);
    const groupMids = unique
      .filter((d) => d.kind === "group")
      .map((d) => d.chatMid);

    const [squareMemberCounts, groupMemberCounts] = await Promise.all([
      resolveSquareMemberCounts(client, squareMids),
      resolveGroupMemberCounts(client, groupMids),
    ]);

    const now = new Date();
    const seen = new Set(unique.map((d) => d.chatMid));

    for (let i = 0; i < unique.length; i += SYNC_DB_CHUNK) {
      const chunk = unique.slice(i, i + SYNC_DB_CHUNK);
      await Promise.all(
        chunk.map(async (chat) => {
          const memberCount =
            chat.kind === "square"
              ? (squareMemberCounts.get(chat.chatMid) ?? null)
              : (groupMemberCounts.get(chat.chatMid) ?? null);

          const setFields: {
            name: string;
            kind: ChatKind;
            present: boolean;
            lastSeenAt: Date;
            missingSince: null;
            memberCount?: number;
          } = {
            name: chat.name,
            kind: chat.kind,
            present: true,
            lastSeenAt: now,
            missingSince: null,
          };
          if (memberCount != null) setFields.memberCount = memberCount;

          await db
            .insert(lineChats)
            .values({
              userId,
              chatMid: chat.chatMid,
              name: chat.name,
              kind: chat.kind,
              memberCount,
              present: true,
              firstSeenAt: now,
              lastSeenAt: now,
              missingSince: null,
            })
            .onConflictDoUpdate({
              target: [lineChats.userId, lineChats.chatMid],
              set: setFields,
            });
        }),
      );
    }

    // Mark chats no longer present as missing — only for kinds we successfully
    // discovered, so a transient group/square failure never wipes the other side.
    const squareOk = squaresSettled.status === "fulfilled";
    const groupOk = groupsSettled.status === "fulfilled";
    if (squareOk || groupOk) {
      const markWhere = [
        eq(lineChats.userId, userId),
        eq(lineChats.present, true),
      ];
      if (!(squareOk && groupOk)) {
        markWhere.push(eq(lineChats.kind, squareOk ? "square" : "group"));
      }
      if (seen.size > 0) {
        markWhere.push(notInArray(lineChats.chatMid, [...seen]));
      }
      await db
        .update(lineChats)
        .set({ present: false, missingSince: now })
        .where(and(...markWhere));
    }

    await updateConnectionRow(userId, {
      lastSyncedAt: now,
      status: "connected",
    });

    const { pruneAutoReplyRulesForAbsentChats, syncAutoReplyListener } =
      await import("./auto-reply.js");
    const pruned = await pruneAutoReplyRulesForAbsentChats(userId);
    if (pruned) {
      await syncAutoReplyListener(userId);
    }

    log("info", "line.sync.done", {
      userId,
      count: unique.length,
      squares: squareMids.length,
      groups: groupMids.length,
    });

    return { count: unique.length };
  },

  async sendToChat(
    userId: string,
    chatMid: string,
    text: string,
    options?: { relatedMessageId?: string },
  ): Promise<void> {
    const client = await this.getReadyClient(userId);
    if (!client) {
      throw new Error("LINE account not connected");
    }

    const kind = await chatKindFor(userId, chatMid);

    if (kind === "group") {
      const e2ee = client.base?.e2ee;
      const mid = client.base?.profile?.mid;
      if (e2ee && mid) {
        const self = (await e2ee.getE2EESelfKeyData(
          mid,
        )) as StoredE2eeKey;
        await ensureGroupE2EE(userId, client, chatMid);
        if (self?.ltsmExport) {
          await sendGroupMessageViaLtsm(
            client as Parameters<typeof sendGroupMessageViaLtsm>[0],
            chatMid,
            text,
            self,
            { relatedMessageId: options?.relatedMessageId },
          );
          return;
        }
      }
      if (typeof client.getChat !== "function") {
        throw new Error("Group messaging not supported by this LINE client");
      }
      const chat = await client.getChat(chatMid);
      await chat.sendMessage(text);
      return;
    }

    if (!client.base?.square) {
      throw new Error("LINE account not connected");
    }
    await client.base.square.sendMessage({
      squareChatMid: chatMid,
      text,
      relatedMessageId: options?.relatedMessageId,
    } as {
      squareChatMid: string;
      text: string;
      relatedMessageId?: string;
    });
  },

  async sendImagesToChat(
    userId: string,
    chatMid: string,
    input: {
      assetIds?: string[];
      assetId?: string;
      imageBase64?: string;
      imageBytes?: Buffer;
      filename?: string;
      mimeType?: string;
      relatedMessageId?: string;
    },
  ): Promise<{ messageId?: string; messageIds: string[] }> {
    const client = await this.getReadyClient(userId);
    if (!client) {
      throw new Error("LINE account not connected");
    }

    const assetIds = input.assetIds?.length
      ? input.assetIds.slice(0, MAX_IMAGES_PER_MESSAGE)
      : input.assetId
        ? [input.assetId]
        : [];

    let images: ImageUploadInput[];

    if (assetIds.length > 0) {
      images = [];
      for (const assetId of assetIds) {
        const asset = await loadMediaAsset(userId, assetId);
        if (!asset) {
          throw new Error(`Media asset not found: ${assetId}`);
        }
        images.push({
          bytes: asset.buffer,
          filename: asset.fileName,
          mimeType: asset.mimeType,
        });
      }
    } else if (input.imageBytes) {
      images = [
        {
          bytes: input.imageBytes,
          filename: input.filename ?? "image.jpg",
          mimeType: input.mimeType ?? "image/jpeg",
        },
      ];
    } else if (input.imageBase64) {
      images = [
        {
          bytes: Buffer.from(input.imageBase64, "base64"),
          filename: input.filename ?? "image.jpg",
          mimeType: input.mimeType ?? "image/jpeg",
        },
      ];
    } else {
      throw new Error("No image provided");
    }

    const kind = await chatKindFor(userId, chatMid);

    // Single image: use the proven uploadObjTalk path (renders on mobile + PC).
    if (images.length === 1) {
      const img = images[0]!;
      if (kind === "group") {
        const plain = await sendGroupImagePlainViaObs(
          client as Parameters<typeof sendGroupImagePlainViaObs>[0],
          chatMid,
          img.bytes,
          img.filename,
          img.mimeType,
        );
        return { messageId: plain.id, messageIds: plain.id ? [plain.id] : [] };
      }
      const square = await sendSquareImageViaObs(
        client as Parameters<typeof sendSquareImageViaObs>[0],
        chatMid,
        img.bytes,
        img.filename,
        img.mimeType,
        { relatedMessageId: input.relatedMessageId },
      );
      return { messageId: square.id, messageIds: square.id ? [square.id] : [] };
    }

    // Multiple images: grid via X-Talk-Meta (falls back to separate uploads).
    const result = await uploadMultipleImagesPlainViaObs(
      client as Parameters<typeof uploadMultipleImagesPlainViaObs>[0],
      chatMid,
      images,
    );
    return {
      messageId: result.messageIds[0],
      messageIds: result.messageIds,
    };
  },

  async sendTemplateContent(
    userId: string,
    chatMid: string,
    input: {
      text?: string | null;
      imageAssetIds?: string[];
      relatedMessageId?: string;
    },
  ): Promise<void> {
    const text = input.text?.trim() ?? "";
    const imageAssetIds = (input.imageAssetIds ?? []).slice(
      0,
      MAX_IMAGES_PER_MESSAGE,
    );

    if (text) {
      await this.sendToChat(userId, chatMid, text, {
        relatedMessageId: input.relatedMessageId,
      });
    }
    if (imageAssetIds.length > 0) {
      if (text) {
        await new Promise((r) =>
          setTimeout(r, 1200 + Math.floor(Math.random() * 800)),
        );
      }
      await this.sendImagesToChat(userId, chatMid, {
        assetIds: imageAssetIds,
        relatedMessageId: input.relatedMessageId,
      });
    }
  },

  async sendImageToChat(
    userId: string,
    chatMid: string,
    input: {
      assetId?: string;
      imageBase64?: string;
      imageBytes?: Buffer;
      filename?: string;
      mimeType?: string;
      relatedMessageId?: string;
    },
  ): Promise<{ messageId?: string }> {
    const result = await this.sendImagesToChat(userId, chatMid, input);
    return { messageId: result.messageId };
  },


  isSessionReady(userId: string): boolean {
    const s = sessions.get(userId);
    return !!s && s.status === "connected";
  },

  async getChatKind(userId: string, chatMid: string): Promise<ChatKind> {
    return chatKindFor(userId, chatMid);
  },

  connectedCount(): number {
    let n = 0;
    for (const s of sessions.values()) {
      if (s.status === "connected") n += 1;
    }
    return n;
  },

  async listFriends(
    userId: string,
  ): Promise<Array<{ mid: string; displayName: string }>> {
    const client = await this.getReadyClient(userId);
    if (!client) {
      throw new Error("LINE account not connected");
    }

    const relation = client.base?.relation;
    if (!relation?.getUserFriendIds) {
      throw new Error("Friend list API not available");
    }
    const res = await relation.getUserFriendIds({
      request: { blockStatus: "NORMAL" },
    });
    const mids = res.userFriendMids ?? [];
    if (mids.length === 0) return [];

    const talk = client.base?.talk;
    if (!talk?.getContactsV2) return mids.map((mid) => ({ mid, displayName: mid }));

    const contacts = await talk.getContactsV2({ mids });
    return mids.map((mid) => ({
      mid,
      displayName: contacts?.contacts?.[mid]?.displayName ?? mid,
    }));
  },

  hotSessionCount(): number {
    return countHotSessions(hasLiveClient);
  },
};

/**
 * On startup, resume LINE sessions for users with a stored auth token.
 */
export async function restoreSessionsOnBoot(): Promise<void> {
  startSessionEvictionSweep(hasLiveClient, hibernateUserSession);

  if (env.MAX_BOOT_RESTORE_SESSIONS === 0) {
    console.log("[line] lazy session resume — skip boot restore");
    return;
  }

  try {
    const rows = await db
      .select({ userId: lineConnection.userId })
      .from(lineConnection);
    let restored = 0;
    const limit = env.MAX_BOOT_RESTORE_SESSIONS;
    for (const { userId } of rows) {
      if (restored >= limit) break;
      const meta = await readMeta(userId);
      if (!meta?.authToken) continue;
      const client = await lineManager.getReadyClient(userId);
      if (client) restored += 1;
    }
    if (restored > 0) {
      console.log(`[line] restored ${restored} session(s) on boot (limit ${limit})`);
    }
  } catch (err) {
    console.warn("[line] session restore on boot failed:", err);
  }
}

export function getLineSessionPoolStats(): ReturnType<typeof getSessionPoolStats> {
  return getSessionPoolStats(hasLiveClient, sessions.size);
}

export function hibernateLineSession(userId: string): void {
  hibernateUserSession(userId);
}

export { stopSessionEvictionSweep };

/**
 * On startup, mark any DB rows that claim "connected"/"connecting" back to a
 * safe state until a real resume happens (never report connected on a cold
 * start without a live client).
 */
export async function reconcileOnBoot(): Promise<void> {
  try {
    // Never show a live connected/connecting/error state without a real client.
    // Stale error rows (e.g. permission issues from an earlier container) made
    // the UI look "failed" before the user did anything.
    await db
      .update(lineConnection)
      .set({
        status: "disconnected",
        lastError: null,
        updatedAt: new Date(),
      })
      .where(
        sql`${lineConnection.status} in ('connected','connecting','error')`,
      );
  } catch (err) {
    console.warn("[line] boot reconcile failed:", err);
  }
}
