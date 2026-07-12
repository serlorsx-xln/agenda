import { createRequire } from "node:module";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

const SQR_PATCH_MARKER = "LINE_PROMO_SQR_V13";

function resolveLinejsLoginMod(): string | null {
  const require = createRequire(import.meta.url);
  try {
    const entry = require.resolve("@evex/linejs");
    return join(dirname(entry), "..", "base/login/mod.js");
  } catch {
    return null;
  }
}

/** Unpatched linejs requestSQR body (non-ForSecure QR login). */
const originalSqrBlock = `  async requestSQR() {
    const { 1: sqr } = await this.createSession();
    let { 1: url } = await this.createQrCode(sqr);
    const [secret, secretUrl] = this.client.e2ee.createSqrSecret();
    url = url + secretUrl;
    this.client.emit("qrcall", url);
    if (await this.checkQrCodeVerified(sqr)) {
      try {
        await this.verifyCertificate(sqr, await this.getQrCert());
      } catch (_e) {
        const { 1: pincode } = await this.createPinCode(sqr);
        this.client.emit("pincall", pincode);
        await this.checkPinCodeVerified(sqr);
      }
      const response = await this.qrCodeLogin(sqr);
      const { 1: pem, 2: authToken, 4: e2eeInfo, 5: _mid } = response;
      if (pem) {
        this.client.emit("update:qrcert", pem);
        await this.registerQrCert(pem);
      }
      let e2eeKeyResult = undefined;
      if (e2eeInfo) {
        e2eeKeyResult = await this.client.e2ee.decodeE2EEKeyV1(e2eeInfo, Buffer.from(secret));
      }
      if (!e2eeKeyResult) {
        await this.client.e2ee.registerE2EEKeyPair();
      }
      return authToken;
    }
    throw new InternalError("TimeoutError", "checkQrCodeVerified timed out");
  }`;

const patchedSqrBlock = `  async requestSQR() {
    /* ${SQR_PATCH_MARKER} — OkLine QR + LINE ltsm.wasm E2EE unwrap, ANDROIDSECONDARY API */
    const ltsm = globalThis.__linePromoLtsm;
    const { 1: sqr } = await this.createSession();
    const qrResp = await this.createQrCode(sqr);
    let url = qrResp[1];
    const pollMax = qrResp[2] ?? 12;
    const pollIntervalSec = qrResp[3] ?? 10;
    console.log("[login] QR v3=false pollMax=" + pollMax + " ltsm=" + !!ltsm);
    let secretUrl;
    if (ltsm) {
      secretUrl = await ltsm.createQrSecretUrl();
    } else {
      secretUrl = this.client.e2ee.createSqrSecret()[1];
    }
    url = url + secretUrl;
    this.client.emit("qrcall", url);
    if (await this.checkQrCodeVerified(sqr, pollMax, pollIntervalSec)) {
      try {
        await this.verifyCertificate(sqr, await this.getQrCert());
        console.log("[login] certificate verified");
      } catch (_certErr) {
        try {
          const { 1: pincode } = await this.createPinCode(sqr);
          this.client.emit("pincall", pincode);
          console.log("[login] PIN — enter on phone Settings > Account > Login:", pincode);
          const pinPollMax = Math.max(pollMax, 18);
          await this.checkPinCodeVerified(sqr, pinPollMax, pollIntervalSec);
        } catch (pinErr) {
          console.warn("[login] PIN skipped, continuing login:", pinErr?.data?.reason ?? pinErr);
        }
      }
      const response = await this.qrCodeLoginV2(sqr);
      const { 1: pem, 3: tokenInfo, 4: mid, 6: metaData } = response;
      if (pem) {
        this.client.emit("update:qrcert", pem);
        await this.registerQrCert(pem);
      }
      const authToken = tokenInfo[1];
      this.client.authToken = authToken;
      this.client.emit("update:authtoken", authToken);
      let e2eeInfo = undefined;
      if (metaData?.publicKey && metaData?.encryptedKeyChain) {
        e2eeInfo = metaData;
      } else if (metaData?.["publicKey"] && metaData?.["encryptedKeyChain"]) {
        e2eeInfo = {
          keyId: metaData["keyId"] ?? metaData.keyId,
          publicKey: metaData["publicKey"],
          encryptedKeyChain: metaData["encryptedKeyChain"],
          e2eeVersion: metaData["e2eeVersion"] ?? 1
        };
      } else {
        e2eeInfo = response[10] ?? metaData?.["e2eeInfo"];
        if (typeof e2eeInfo === "string") {
          try {
            e2eeInfo = JSON.parse(e2eeInfo);
          } catch (_parseErr) {
          /* keep raw string */ }
        }
      }
      console.log("[login] E2EE meta:", e2eeInfo?.encryptedKeyChain ? "has keychain" : "missing");
      let e2eeKeyResult = undefined;
      if (ltsm && e2eeInfo?.encryptedKeyChain && e2eeInfo?.publicKey) {
        try {
          const saved = await ltsm.unwrapAndSave(e2eeInfo, this.client.storage, mid);
          if (saved) {
            e2eeKeyResult = { keyId: saved.keyId };
            console.log("[login] E2EE keys saved (keyId=" + saved.keyId + ")");
          } else {
            console.warn("[login] E2EE unwrap returned no keys");
          }
        } catch (ltsmErr) {
          console.warn("[login] E2EE unwrap failed:", ltsmErr?.message ?? ltsmErr);
        }
      }
      if (!e2eeKeyResult && e2eeInfo && !ltsm) {
        const [secret] = this.client.e2ee.createSqrSecret();
        e2eeKeyResult = await this.client.e2ee.decodeE2EEKeyV1(e2eeInfo, Buffer.from(secret));
        if (e2eeKeyResult) {
          await this.client.e2ee.saveE2EESelfKeyData({
            keyId: e2eeKeyResult.keyId,
            privKey: e2eeKeyResult.privKey.toString("base64"),
            pubKey: e2eeKeyResult.pubKey.toString("base64"),
            e2eeVersion: e2eeKeyResult.e2eeVersion ?? 1
          });
          console.log("[login] E2EE keys via linejs decode (keyId=" + e2eeKeyResult.keyId + ")");
        }
      }
      if (!e2eeKeyResult) {
        let serverHasKeys = false;
        try {
          const keys = await this.client.talk.getE2EEPublicKeys();
          serverHasKeys = (keys?.length ?? 0) > 0;
        } catch (_e) {
        /* ignore */ }
        if (!serverHasKeys) {
          e2eeKeyResult = await this.client.e2ee.registerE2EEKeyPair();
          if (e2eeKeyResult) {
            console.log("[login] registered new E2EE key pair");
          }
        } else {
          await this.client.storage.set("forcePinForE2EE", "1");
          console.warn("[login] E2EE unwrap failed — enter PIN on phone next login");
        }
      } else {
        await this.client.storage.set("forcePinForE2EE", null);
      }
      await this.client.storage.set("refreshToken", tokenInfo[2]);
      await this.client.storage.set("expire", tokenInfo[3] + tokenInfo[6]);
      return authToken;
    }
    throw new InternalError("TimeoutError", "checkQrCodeVerified timed out");
  }`;

const priorSqrMarkers = [
  "LINE_PROMO_SQR_V13",
  "LINE_PROMO_SQR_V12",
  "LINE_PROMO_SQR_V11",
  "LINE_PROMO_SQR_V10",
  "LINE_PROMO_SQR_V9",
  "LINE_PROMO_SQR_V8",
];

/**
 * QR login patch: OkLine flow + ltsm.wasm key unwrap (device stays ANDROIDSECONDARY).
 * Must run before @evex/linejs is imported (see index.ts).
 */
export function patchLinejsQrE2EELogin(): void {
  const modPath = resolveLinejsLoginMod();
  if (!modPath) {
    console.warn("[line] could not resolve linejs login mod for E2EE patch");
    return;
  }

  let src = readFileSync(modPath, "utf8");
  if (src.includes(SQR_PATCH_MARKER)) return;

  if (src.includes(originalSqrBlock)) {
    src = src.replace(originalSqrBlock, patchedSqrBlock);
  } else if (priorSqrMarkers.some((m) => src.includes(m))) {
    const start = src.indexOf("async requestSQR()");
    const end = src.indexOf("async requestSQR2()", start);
    if (start === -1 || end === -1) {
      console.warn("[line] could not locate requestSQR block for patch upgrade");
      return;
    }
    src = src.slice(0, start) + patchedSqrBlock.trimStart() + "\n  " + src.slice(end);
  } else {
    console.warn("[line] linejs requestSQR block not found; patch skipped");
    return;
  }

  writeFileSync(modPath, src, "utf8");
  console.log("[line] patched linejs requestSQR (V13: ltsm.wasm E2EE)");
}
