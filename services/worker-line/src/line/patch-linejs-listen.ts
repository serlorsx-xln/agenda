import { createRequire } from "node:module";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

const LISTEN_PATCH_MARKER = "LINE_PROMO_LTSM_LISTEN";

function resolveLinejsClientMod(): string | null {
  const require = createRequire(import.meta.url);
  try {
    const entry = require.resolve("@evex/linejs");
    return join(dirname(entry), "client.js");
  } catch {
    return null;
  }
}

const originalBlock = `          if (event.type === "SEND_MESSAGE" || event.type === "RECEIVE_MESSAGE") {
            this.emit("message", new TalkMessage({
              raw: await this.base.e2ee.decryptE2EEMessage(event.message),
              client: this
            }));
          }`;

const patchedBlock = `          if (event.type === "SEND_MESSAGE" || event.type === "RECEIVE_MESSAGE") {
            /* ${LISTEN_PATCH_MARKER} — do not crash when LTSM cannot export group keys */
            try {
              this.emit("message", new TalkMessage({
                raw: await this.base.e2ee.decryptE2EEMessage(event.message),
                client: this
              }));
            } catch (decryptErr) {
              console.warn("[line] listen decrypt skipped:", decryptErr instanceof Error ? decryptErr.message : decryptErr);
            }
          }`;

/** Prevent listen() from crashing the worker when inbound E2EE decrypt fails. */
export function patchLinejsListenSafeDecrypt(): void {
  const modPath = resolveLinejsClientMod();
  if (!modPath) {
    console.warn("[line] could not resolve linejs client mod for listen patch");
    return;
  }

  let src = readFileSync(modPath, "utf8");
  if (src.includes(LISTEN_PATCH_MARKER)) return;

  if (!src.includes(originalBlock)) {
    console.warn("[line] linejs listen block not found; listen patch skipped");
    return;
  }

  src = src.replace(originalBlock, patchedBlock);
  writeFileSync(modPath, src, "utf8");
  console.log("[line] patched linejs listen (safe inbound decrypt)");
}
