import { BaseClient } from "@evex/linejs/base";
import { Client } from "@evex/linejs";

import { env } from "../env.js";
import {
  clearLtsmLoginHook,
  createLtsmLoginHook,
  getLtsmBridge,
  installLtsmLoginHook,
} from "./ltsm-bridge.js";
import type { EncryptedFileStorage } from "./encrypted-storage.js";

/** OkLine-style QR login with ltsm.wasm E2EE; API device stays ANDROIDSECONDARY. */
export async function loginWithQrV3False(
  opts: {
    onReceiveQRUrl(url: string): void;
    onPincodeRequest(pin: string): void;
  },
  storage: EncryptedFileStorage,
): Promise<Client> {
  const bridge = getLtsmBridge();
  const base = new BaseClient({
    device: env.LINE_DEVICE,
    // EncryptedFileStorage implements the BaseStorage surface linejs needs.
    storage: storage as never,
  });
  installLtsmLoginHook(createLtsmLoginHook(bridge, base.e2ee));
  base.on("qrcall", opts.onReceiveQRUrl);
  base.on("pincall", opts.onPincodeRequest);

  try {
    await base.loginProcess.withQrCode({ v3: false });
    await base.loginProcess.ready();
    return new Client(base);
  } finally {
    clearLtsmLoginHook();
  }
}
