import { createRequire } from "node:module";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

const E2EE_PATCH_MARKER = "LINE_PROMO_LTSM_E2EE";

function resolveLinejsE2eeMod(): string | null {
  const require = createRequire(import.meta.url);
  try {
    const entry = require.resolve("@evex/linejs");
    return join(dirname(entry), "..", "base/e2ee/mod.js");
  } catch {
    return null;
  }
}

const originalSelfKeyCheck = `      if (keyData && keyData.privKey && keyData.pubKey) return keyData;`;

const patchedSelfKeyCheck = `      /* ${E2EE_PATCH_MARKER} */
      if (keyData && keyData.pubKey && (keyData.privKey || keyData.ltsmExport)) return keyData;`;

const originalGroupDecrypt = `        const selfKey = Buffer.from((await this.getE2EESelfKeyDataByKeyId(receiverKeyId))["privKey"], "base64");
        const creatorKey = await this.getE2EELocalPublicKey(creator, creatorKeyId);
        const aesKey = this.generateSharedSecret(selfKey, creatorKey);
        const aes_key = this.getSHA256Sum(Buffer.from(aesKey), "Key");
        const aes_iv = this.xor(this.getSHA256Sum(Buffer.from(aesKey), "IV"));
        this.e2eeLog("getE2EELocalPublicKeyAESInfo", {
          aes_key,
          aes_iv,
          encryptedSharedKey
        });
        const decipher = crypto.createDecipheriv("aes-256-cbc", aes_key, aes_iv);
        const plainText = Buffer.concat([
          decipher.update(encryptedSharedKey),
          decipher.final()
        ]);`;

const patchedGroupDecrypt = `        /* ${E2EE_PATCH_MARKER} group shared key */
        const selfKeyData = await this.getE2EESelfKeyDataByKeyId(receiverKeyId);
        const creatorKey = await this.getE2EELocalPublicKey(creator, creatorKeyId);
        let plainText;
        if (selfKeyData?.privKey) {
          const selfKey = Buffer.from(selfKeyData["privKey"], "base64");
          const aesKey = this.generateSharedSecret(selfKey, creatorKey);
          const aes_key = this.getSHA256Sum(Buffer.from(aesKey), "Key");
          const aes_iv = this.xor(this.getSHA256Sum(Buffer.from(aesKey), "IV"));
          this.e2eeLog("getE2EELocalPublicKeyAESInfo", {
            aes_key,
            aes_iv,
            encryptedSharedKey
          });
          const decipher = crypto.createDecipheriv("aes-256-cbc", aes_key, aes_iv);
          plainText = Buffer.concat([
            decipher.update(encryptedSharedKey),
            decipher.final()
          ]);
        } else if (selfKeyData?.ltsmExport && globalThis.__linePromoLtsmRuntime) {
          plainText = await globalThis.__linePromoLtsmRuntime.unwrapGroupSharedKey(
            selfKeyData.ltsmExport,
            creatorKey.toString("base64"),
            encryptedSharedKey.toString("base64"),
            selfKeyData.pubKey,
            selfKeyData.keyId
          );
        } else {
          throw new InternalError("NoE2EEKey", "Missing self E2EE private key for group unwrap");
        }`;

const legacyGroupDecrypt = `        /* ${E2EE_PATCH_MARKER} group shared key */
        const selfKeyData = await this.getE2EESelfKeyDataByKeyId(receiverKeyId);
        const creatorKey = await this.getE2EELocalPublicKey(creator, creatorKeyId);
        let plainText;
        if (selfKeyData?.ltsmExport && globalThis.__linePromoLtsmRuntime) {
          plainText = await globalThis.__linePromoLtsmRuntime.unwrapGroupSharedKey(
            selfKeyData.ltsmExport,
            creatorKey.toString("base64"),
            encryptedSharedKey.toString("base64"),
            selfKeyData.pubKey
          );
        } else {
          const selfKey = Buffer.from(selfKeyData["privKey"], "base64");
          const aesKey = this.generateSharedSecret(selfKey, creatorKey);
          const aes_key = this.getSHA256Sum(Buffer.from(aesKey), "Key");
          const aes_iv = this.xor(this.getSHA256Sum(Buffer.from(aesKey), "IV"));
          this.e2eeLog("getE2EELocalPublicKeyAESInfo", {
            aes_key,
            aes_iv,
            encryptedSharedKey
          });
          const decipher = crypto.createDecipheriv("aes-256-cbc", aes_key, aes_iv);
          plainText = Buffer.concat([
            decipher.update(encryptedSharedKey),
            decipher.final()
          ]);
        }`;

const legacyGroupEncrypt = `    } else {
      /* ${E2EE_PATCH_MARKER} encrypt group */
      if (selfKeyData.ltsmExport && selfKeyData.pubKey && globalThis.__linePromoLtsmRuntime?.encryptGroupE2EEMessage) {
        return await globalThis.__linePromoLtsmRuntime.encryptGroupE2EEMessage(
          this.client,
          to,
          _from,
          selfKeyData,
          data,
          contentType
        );
      }
      const groupK = await this.getE2EELocalPublicKey(to, undefined);`;

/** Patch linejs E2EE to support ltsm.wasm export blobs for group messaging. */
export function patchLinejsLtsmE2EE(): void {
  const modPath = resolveLinejsE2eeMod();
  if (!modPath) {
    console.warn("[line] could not resolve linejs e2ee mod for LTSM patch");
    return;
  }

  let src = readFileSync(modPath, "utf8");
  const alreadyPatched = src.includes(E2EE_PATCH_MARKER);

  if (!alreadyPatched) {
    if (!src.includes(originalSelfKeyCheck)) {
      console.warn("[line] linejs getE2EESelfKeyData check not found; E2EE patch skipped");
      return;
    }
    src = src.replace(originalSelfKeyCheck, patchedSelfKeyCheck);

    if (!src.includes(originalGroupDecrypt)) {
      console.warn("[line] linejs group decrypt block not found; E2EE patch skipped");
      return;
    }
    src = src.replace(originalGroupDecrypt, patchedGroupDecrypt);
  }

  const originalGroupEncrypt = `    } else {
      const groupK = await this.getE2EELocalPublicKey(to, undefined);`;
  const patchedGroupEncrypt = `    } else {
      /* ${E2EE_PATCH_MARKER} encrypt group */
      let __ltsmGroupEncrypt = selfKeyData.ltsmExport && !selfKeyData.privKey && selfKeyData.pubKey && globalThis.__linePromoLtsmRuntime?.encryptGroupE2EEMessage;
      if (__ltsmGroupEncrypt) {
        try {
          const __gk = await this.client.storage.get(\`e2eeGroupKeys:\${to}\`);
          if (__gk) __ltsmGroupEncrypt = false;
        } catch {}
      }
      if (__ltsmGroupEncrypt) {
        return await globalThis.__linePromoLtsmRuntime.encryptGroupE2EEMessage(
          this.client,
          to,
          _from,
          selfKeyData,
          data,
          contentType
        );
      }
      const groupK = await this.getE2EELocalPublicKey(to, undefined);`;

  let upgraded = false;
  if (src.includes(legacyGroupDecrypt) && !src.includes("selfKeyData?.privKey")) {
    src = src.replace(legacyGroupDecrypt, patchedGroupDecrypt);
    upgraded = true;
  }
  if (src.includes(legacyGroupEncrypt) && !src.includes("__ltsmGroupEncrypt")) {
    src = src.replace(legacyGroupEncrypt, patchedGroupEncrypt);
    upgraded = true;
  }
  if (upgraded) {
    writeFileSync(modPath, src, "utf8");
    console.log("[line] upgraded linejs E2EE (native group path when privKey cached)");
    return;
  }

  if (!src.includes("encryptGroupE2EEMessage") && src.includes(originalGroupEncrypt)) {
    src = src.replace(originalGroupEncrypt, patchedGroupEncrypt);
    writeFileSync(modPath, src, "utf8");
    console.log("[line] patched linejs E2EE (LTSM group encrypt hook)");
  } else if (!alreadyPatched) {
    writeFileSync(modPath, src, "utf8");
    console.log("[line] patched linejs E2EE (LTSM group key unwrap)");
  }
}
