import { patchLinejsQrE2EELogin } from "./line/patch-linejs-login.js";
import { patchLinejsLtsmE2EE } from "./line/patch-linejs-e2ee.js";
import { patchLinejsListenSafeDecrypt } from "./line/patch-linejs-listen.js";

// Patch linejs on disk BEFORE any module imports @evex/linejs (ESM hoists static imports).
patchLinejsQrE2EELogin();
patchLinejsLtsmE2EE();
patchLinejsListenSafeDecrypt();

async function main() {
  const { initSentry } = await import("@line/shared/sentry");
  await initSentry("worker-line");

  const { env } = await import("./env.js");
  const { installLtsmRuntime } = await import("./line/ltsm-bridge.js");
  installLtsmRuntime();
  const { createServer } = await import("./api/server.js");
  const { reconcileOnBoot, restoreSessionsOnBoot } = await import(
    "./line/manager.js"
  );
  const {
    decryptInboundChatText,
    fetchRecentMessagesForChat,
    lineManager,
  } = await import("./line/manager.js");
  const {
    initAutoReplyRuntime,
    restoreAutoReplyOnBoot,
    stopAllAutoReplyListeners,
  } = await import("./line/auto-reply.js");
  const { startDaemon, stopDaemon } = await import("./scheduler/daemon.js");

  initAutoReplyRuntime({
    getClient: (userId) => lineManager.getReadyClient(userId),
    fetchMessages: (userId, client, chatMid, limit, squareSyncByChat, drainBacklog) =>
      fetchRecentMessagesForChat(
        userId,
        client as Parameters<typeof fetchRecentMessagesForChat>[1],
        chatMid,
        limit,
        squareSyncByChat,
        drainBacklog,
        (mid, token) =>
          import("./line/square-sync-store.js").then((m) =>
            m.persistSquareSyncToken(userId, mid, token),
          ),
      ),
    decryptText: (userId, client, chatMid, msg) =>
      decryptInboundChatText(
        userId,
        client as Parameters<typeof decryptInboundChatText>[1],
        chatMid,
        msg as Parameters<typeof decryptInboundChatText>[3],
      ),
    getChatKind: (userId, chatMid) => lineManager.getChatKind(userId, chatMid),
    sendText: (userId, chatMid, text, relatedMessageId) =>
      lineManager.sendToChat(userId, chatMid, text, { relatedMessageId }),
    sendImages: (userId, chatMid, assetIds, relatedMessageId) =>
      lineManager
        .sendImagesToChat(userId, chatMid, { assetIds, relatedMessageId })
        .then(() => undefined),
  });

  await reconcileOnBoot();
  await restoreSessionsOnBoot();
  await restoreAutoReplyOnBoot();

  const { notifyStartup } = await import("@line/shared/sentry");
  void notifyStartup("worker-line");

  const app = createServer();
  const { log } = await import("./logger.js");
  const server = app.listen(env.WORKER_PORT, () => {
    log("info", "worker listening", { port: env.WORKER_PORT });
  });

  startDaemon();

  const shutdown = (signal: string) => {
    console.log(`[worker-line] received ${signal}, shutting down...`);
    stopAllAutoReplyListeners();
    void import("./line/manager.js").then(({ stopSessionEvictionSweep }) => {
      stopSessionEvictionSweep();
    });
    stopDaemon();
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 5000).unref();
  };

  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
}

main().catch(async (err) => {
  console.error("[worker-line] fatal:", err);
  try {
    const { captureException } = await import("@line/shared/sentry");
    await captureException(err, { service: "worker-line", phase: "boot" });
  } catch {
    // ignore
  }
  process.exit(1);
});
