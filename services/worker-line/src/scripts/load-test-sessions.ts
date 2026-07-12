/**
 * Realistic session capacity benchmark (hibernation + coordinator model).
 *
 *   pnpm --filter @line/worker-line loadtest:sessions
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { performance } from "node:perf_hooks";

import { db, lineConnection } from "@line/db";

import {
  getAutoReplyCoordinatorStats,
  initAutoReplyRuntime,
  registerAutoReplyBenchmarkUser,
  stopAllAutoReplyListeners,
} from "../line/auto-reply.js";
import { env } from "../env.js";
import { EncryptedFileStorage } from "../line/encrypted-storage.js";
import { installLtsmRuntime } from "../line/ltsm-bridge.js";
import {
  getLineSessionPoolStats,
  hibernateLineSession,
  lineManager,
} from "../line/manager.js";
import {
  enforceHotSessionLimit,
  hibernateSession,
  touchSession,
} from "../line/session-pool.js";
import { decryptSessionPayload, encryptSessionPayload } from "../session-crypto.js";

type MemSnap = { rssMb: number; heapUsedMb: number };

type SessionTemplate = {
  storageJson: Record<string, string>;
  metaJson: { authToken?: string; mid?: string; displayName?: string };
  storageBytes: number;
};

const TARGET_CONNECTIONS = Number(process.env.LOADTEST_TARGET_CONNECTIONS ?? 10_000);
const HOT_TARGET = Number(process.env.LOADTEST_HOT_TARGET ?? env.MAX_HOT_SESSIONS);
const MACHINE_RAM_GB = Number(process.env.LOADTEST_MACHINE_RAM_GB ?? 8);
const RESERVED_RAM_GB = Number(process.env.LOADTEST_RESERVED_RAM_GB ?? 2.5);
const COORDINATOR_TEST_SEC = Number(process.env.LOADTEST_COORDINATOR_SEC ?? 15);
const MOCK_FETCH_MS = Number(process.env.LOADTEST_MOCK_FETCH_MS ?? 80);
const COORDINATOR_USERS = Number(
  process.env.LOADTEST_COORDINATOR_USERS ?? Math.min(TARGET_CONNECTIONS, 3000),
);

function snapMem(): MemSnap {
  const m = process.memoryUsage();
  const toMb = (n: number) => Math.round((n / 1024 / 1024) * 10) / 10;
  return { rssMb: toMb(m.rss), heapUsedMb: toMb(m.heapUsed) };
}

function forceGc(): void {
  (globalThis as { gc?: () => void }).gc?.();
}

async function findSessionTemplate(): Promise<SessionTemplate | null> {
  const dir = env.SESSION_DIR;
  if (!existsSync(dir)) return null;
  const files = readdirSync(dir).filter(
    (f) => f.endsWith(".storage.json") && !f.startsWith("_"),
  );
  if (!files.length) return null;

  const storageFile = files[0]!;
  const userPrefix = storageFile.replace(/\.storage\.json$/, "");
  const metaFile = path.join(dir, `${userPrefix}.meta.json`);
  const storageRaw = readFileSync(path.join(dir, storageFile), "utf8");
  const storageJson = JSON.parse(
    decryptSessionPayload(storageRaw),
  ) as Record<string, string>;
  let metaJson: SessionTemplate["metaJson"] = {};
  if (existsSync(metaFile)) {
    metaJson = JSON.parse(
      decryptSessionPayload(readFileSync(metaFile, "utf8")),
    ) as SessionTemplate["metaJson"];
  }
  return {
    storageJson,
    metaJson,
    storageBytes: Buffer.byteLength(JSON.stringify(storageJson), "utf8"),
  };
}

async function seedColdConnections(
  template: SessionTemplate,
  count: number,
): Promise<{ diskBytes: number; elapsedMs: number }> {
  const t0 = performance.now();
  let diskBytes = 0;
  await fs.mkdir(env.SESSION_DIR, { recursive: true });

  for (let i = 0; i < count; i++) {
    const uid = `cold-${i}`;
    const payload = JSON.stringify(template.storageJson);
    await fs.writeFile(
      path.join(env.SESSION_DIR, `${uid}.storage.json`),
      encryptSessionPayload(payload),
      "utf8",
    );
    await fs.writeFile(
      path.join(env.SESSION_DIR, `${uid}.meta.json`),
      encryptSessionPayload(
        JSON.stringify({
          authToken: `sim-token-${i}`,
          mid: `sim-mid-${i}`,
          displayName: `Cold ${i}`,
        }),
      ),
      "utf8",
    );
    diskBytes += Buffer.byteLength(payload) + 128;
  }

  return { diskBytes, elapsedMs: Math.round(performance.now() - t0) };
}

async function cleanupColdConnections(count: number): Promise<void> {
  for (let i = 0; i < count; i++) {
    const uid = `cold-${i}`;
    await fs.rm(path.join(env.SESSION_DIR, `${uid}.storage.json`), { force: true });
    await fs.rm(path.join(env.SESSION_DIR, `${uid}.meta.json`), { force: true });
  }
}

function simulateHotClients(
  template: SessionTemplate,
  count: number,
): Map<string, unknown> {
  const hot = new Map<string, unknown>();
  for (let i = 0; i < count; i++) {
    const uid = `hot-${i}`;
    touchSession(uid);
    hot.set(uid, {
      storage: structuredClone(template.storageJson),
      storageObj: new EncryptedFileStorage(
        path.join(env.SESSION_DIR, `_hot_${uid}.storage.json`),
        JSON.stringify(template.storageJson),
      ),
      clientStub: { base: { profile: { mid: `mid-${i}` }, talk: {}, e2ee: {} } },
    });
  }
  return hot;
}

async function main(): Promise<void> {
  installLtsmRuntime();
  initAutoReplyRuntime({
    getClient: async (userId) => {
      touchSession(userId);
      return { base: { profile: { mid: `mid-${userId}` } } };
    },
    fetchMessages: async () => {
      await new Promise((r) => setTimeout(r, MOCK_FETCH_MS));
      return [];
    },
    decryptText: async () => null,
    getChatKind: async () => "group" as const,
    sendText: async () => undefined,
    sendImages: async () => undefined,
  });

  console.log("=== Realistic session load test (hibernation model) ===");
  console.log(
    `host ${os.hostname()} | ${os.cpus().length} CPU | ${Math.round(os.totalmem() / 1024 ** 3)} GB RAM`,
  );
  console.log(
    `target=${TARGET_CONNECTIONS} hotCap=${HOT_TARGET} coordinatorUsers=${COORDINATOR_USERS}`,
  );
  console.log(
    `MAX_HOT=${env.MAX_HOT_SESSIONS} bootRestore=${env.MAX_BOOT_RESTORE_SESSIONS} cycle=${env.AUTO_REPLY_CYCLE_SEC}s hibernateAfterPoll=${env.HIBERNATE_AFTER_AUTO_REPLY_POLL}`,
  );
  console.log("");

  forceGc();
  const baseline = snapMem();

  // Phase A — real wake / hibernate (1 account)
  let wakeMs = 0;
  let hibernateMs = 0;
  let realPerSessionMb = 0;

  const rows = await db
    .select({ userId: lineConnection.userId })
    .from(lineConnection)
    .catch(() => [] as { userId: string }[]);

  if (rows.length) {
    const userId = rows[0]!.userId;
    const t0 = performance.now();
    await lineManager.getReadyClient(userId);
    wakeMs = Math.round(performance.now() - t0);
    const afterWake = snapMem();
    realPerSessionMb = Math.round((afterWake.rssMb - baseline.rssMb) * 10) / 10;

    const t1 = performance.now();
    hibernateLineSession(userId);
    hibernateMs = Math.round(performance.now() - t1);
    forceGc();
    console.log(
      `Phase A (real LINE): wake=${wakeMs}ms hibernate=${hibernateMs}ms ΔRSS=${realPerSessionMb} MB`,
    );
  } else {
    console.log("Phase A (real LINE): skipped — no line_connection row");
  }

  const template =
    (await findSessionTemplate()) ??
    ({
      storageJson: { authToken: "sim", "e2eeKeys:1": "{}" },
      metaJson: { authToken: "sim", mid: "sim-mid" },
      storageBytes: 512,
    } satisfies SessionTemplate);

  // Phase B — cold on-disk registry
  const coldCount = Math.max(0, TARGET_CONNECTIONS - HOT_TARGET);
  const cold = await seedColdConnections(template, coldCount);
  console.log(
    `Phase B: ${coldCount} cold accounts on disk in ${cold.elapsedMs}ms (~${Math.round(cold.diskBytes / 1024 / 1024)} MB)`,
  );

  // Phase C — hot pool LRU cap
  const beforeHot = snapMem();
  const hotClients = simulateHotClients(template, HOT_TARGET + 50);
  const evicted = await enforceHotSessionLimit(
    (uid) => hotClients.has(uid),
    (uid) => hibernateSession(uid, (id) => hotClients.delete(id)),
  );
  forceGc();
  const afterHot = snapMem();
  console.log(
    `Phase C: hot cap ${HOT_TARGET} — in RAM ${hotClients.size}, evicted ${evicted}, ΔRSS=${Math.round((afterHot.rssMb - beforeHot.rssMb) * 10) / 10} MB`,
  );

  // Phase D — coordinator soak with mock LINE fetch latency
  stopAllAutoReplyListeners();
  const regT0 = performance.now();
  for (let i = 0; i < COORDINATOR_USERS; i++) {
    registerAutoReplyBenchmarkUser(`bench-${i}`);
  }
  const regMs = Math.round(performance.now() - regT0);
  const coordStats = getAutoReplyCoordinatorStats();
  console.log(
    `Phase D: registered ${COORDINATOR_USERS} auto-reply users in ${regMs}ms (${coordStats.usersPerBatch}/tick, cycle=${coordStats.cycleSec}s)`,
  );

  const memBeforeCoord = snapMem();
  const cpuBefore = process.cpuUsage();
  const wallT0 = performance.now();
  await new Promise((r) => setTimeout(r, COORDINATOR_TEST_SEC * 1000));
  const cpuAfter = process.cpuUsage(cpuBefore);
  const wallMs = Math.round(performance.now() - wallT0);
  const memAfterCoord = snapMem();
  const cpuSec = (cpuAfter.user + cpuAfter.system) / 1e6;
  const cpuPct = Math.round((cpuSec / (wallMs / 1000)) * 100 / os.cpus().length * 10) / 10;

  console.log(
    `Phase D soak ${COORDINATOR_TEST_SEC}s: CPU~${cpuPct}% (1 core equiv) ΔRSS=${Math.round((memAfterCoord.rssMb - memBeforeCoord.rssMb) * 10) / 10} MB`,
  );

  stopAllAutoReplyListeners();

  const perSessionMb = realPerSessionMb > 0 ? realPerSessionMb : 5;
  const availableMb = (MACHINE_RAM_GB - RESERVED_RAM_GB) * 1024 - 200;
  const maxHotByRam = Math.floor(availableMb / perSessionMb);
  const coldDiskGb =
    Math.round(((coldCount * template.storageBytes) / 1024 ** 3) * 100) / 100;
  const pollsPerSec = Math.ceil(COORDINATOR_USERS / env.AUTO_REPLY_CYCLE_SEC);

  const report = {
    generatedAt: new Date().toISOString(),
    model: "hibernation",
    targetConnections: TARGET_CONNECTIONS,
    hotSessionCap: HOT_TARGET,
    phases: {
      realWakeMs: wakeMs,
      realHibernateMs: hibernateMs,
      realPerSessionRssMb: realPerSessionMb,
      coldAccounts: coldCount,
      coldDiskMb: Math.round(cold.diskBytes / 1024 / 1024),
      hotInRam: hotClients.size,
      hotEvicted: evicted,
      coordinatorUsers: COORDINATOR_USERS,
      coordinatorRegMs: regMs,
      coordinatorSoakSec: COORDINATOR_TEST_SEC,
      coordinatorCpuPct: cpuPct,
      mockFetchMs: MOCK_FETCH_MS,
      pollsPerSecEstimate: pollsPerSec,
    },
    feasibility10kOn8Gb: {
      allHotInRam: {
        possible: false,
        ramNeededGb: Math.round((TARGET_CONNECTIONS * perSessionMb) / 1024),
      },
      hibernation: {
        possible: HOT_TARGET <= maxHotByRam && coldDiskGb < 20,
        maxHotByRam,
        coldDiskGbEstimate: coldDiskGb,
        avgPollIntervalSec: env.AUTO_REPLY_CYCLE_SEC,
      },
    },
    sessionPool: getLineSessionPoolStats(),
    coordinator: coordStats,
    baseline,
    memory: { afterHot, afterCoordinator: memAfterCoord },
  };

  const outPath =
    process.env.LOADTEST_REPORT_PATH ??
    path.join(env.SESSION_DIR, "loadtest-report.json");
  await fs.writeFile(outPath, JSON.stringify(report, null, 2), "utf8");

  console.log("");
  console.log("=== VERDICT: 10k connect on 4c/8GB ===");
  console.log(
    `❌ 10k in RAM พร้อมกัน: ไม่ได้ (~${report.feasibility10kOn8Gb.allHotInRam.ramNeededGb} GB RAM)`,
  );
  if (report.feasibility10kOn8Gb.hibernation.possible) {
    console.log(
      `✅ 10k hibernation model: ได้ — ${coldCount} cold (disk ~${coldDiskGb} GB) + ${HOT_TARGET} hot RAM`,
    );
    console.log(
      `   auto-reply ${COORDINATOR_USERS} users: ~${pollsPerSec} mock polls/sec, CPU soak ~${cpuPct}%`,
    );
    console.log(`   wake latency (real): ~${wakeMs}ms per resume`);
  } else {
    console.log(`⚠️  ปรับ MAX_HOT_SESSIONS ≤ ${maxHotByRam} หรือเพิ่ม disk`);
  }
  console.log(`Report: ${outPath}`);

  hotClients.clear();
  await cleanupColdConnections(coldCount);
  if (existsSync(env.SESSION_DIR)) {
    for (const f of readdirSync(env.SESSION_DIR).filter((x) => x.startsWith("_hot_"))) {
      await fs.rm(path.join(env.SESSION_DIR, f), { force: true });
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
