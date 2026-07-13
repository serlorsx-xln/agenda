/** PromptPay id used for slip QR + receiver verification (digits only). */
function promptPayIdDigits(): string {
  return (process.env.PROMPTPAY_ID ?? "").replace(/\D/g, "");
}

/** Optional override when slip receiver differs from PromptPay display id. */
function slipReceiverOverrideDigits(): string {
  return (process.env.SLIP_RECEIVER_ACCOUNT ?? "").replace(/\D/g, "");
}

function phoneIdentifierVariants(digits: string): string[] {
  if (!digits) return [];
  const ids = new Set<string>([digits]);
  if (digits.startsWith("0") && digits.length > 1) ids.add(digits.slice(1));
  if (digits.length === 9) ids.add(`0${digits}`);
  return [...ids];
}

/** Biller `01` + tax id → also match bare 13-digit tax id on slips. */
function billerIdentifierVariants(digits: string): string[] {
  if (!digits) return [];
  const ids = new Set<string>([digits]);
  if (digits.length === 15 && digits.startsWith("01")) {
    ids.add(digits.slice(2));
  }
  if (digits.length === 13) {
    ids.add(`01${digits}`);
  }
  return [...ids];
}

function expandReceiverDigits(raw: string): string[] {
  const digits = raw.replace(/\D/g, "");
  if (!digits) return [];
  if (digits.length >= 13) return billerIdentifierVariants(digits);
  return phoneIdentifierVariants(digits);
}

/** Identifiers to match on slip receiver. */
export function shopReceiverIdentifiers(): string[] {
  const ids = new Set<string>();
  for (const d of expandReceiverDigits(promptPayIdDigits())) ids.add(d);

  // Comma / space separated overrides (biller, tax id, account tails, etc.)
  const overrideRaw = process.env.SLIP_RECEIVER_ACCOUNT ?? "";
  for (const part of overrideRaw.split(/[,;\s]+/)) {
    for (const d of expandReceiverDigits(part)) ids.add(d);
  }

  return [...ids];
}

function digitRuns(raw: string): string[] {
  const runs = new Set<string>();
  const full = raw.replace(/\D/g, "");
  if (full.length >= 4) runs.add(full);
  for (const m of raw.match(/\d{4,}/g) ?? []) runs.add(m);
  return [...runs];
}

function suffixMatches(a: string, b: string, min = 4): boolean {
  if (!a || !b) return false;
  if (a === b) return true;
  const n = Math.min(a.length, b.length);
  if (n < min) return false;
  return a.slice(-n) === b.slice(-n);
}

function matchesIdentifier(slipDigits: string, shopId: string): boolean {
  if (!slipDigits || !shopId) return false;
  if (slipDigits === shopId) return true;
  if (suffixMatches(slipDigits, shopId)) return true;
  if (slipDigits.length >= 4 && shopId.endsWith(slipDigits)) return true;
  return false;
}

/** Masked PromptPay target on slip (e.g. xxx-xxx-3612). */
function isPromptPayMaskedReceiver(acctRaw: string): boolean {
  const t = acctRaw.trim();
  if (!t) return false;
  const digits = t.replace(/\D/g, "");
  return /x/i.test(t) && digits.length > 0 && digits.length <= 8;
}

export function receiverMatchesShop(acctRaw: string): boolean {
  const ids = shopReceiverIdentifiers();
  if (!ids.length) return false;

  const raw = acctRaw.trim();
  if (!raw) return false;

  for (const run of digitRuns(raw)) {
    for (const id of ids) {
      if (matchesIdentifier(run, id)) return true;
    }
  }

  for (const id of ids) {
    if (id.length >= 4 && raw.includes(id.slice(-4))) return true;
  }

  if (isPromptPayMaskedReceiver(raw)) {
    const visible = raw.replace(/\D/g, "");
    for (const id of ids) {
      if (visible.length >= 4 && matchesIdentifier(visible, id)) return true;
      if (visible.length >= 3 && id.slice(-4).startsWith(visible.slice(-3))) {
        return true;
      }
      if (visible.length >= 4 && id.endsWith(visible.slice(-4))) return true;
      if (
        visible.length >= 4 &&
        suffixMatches(visible.slice(-4), id.slice(-4), 3)
      ) {
        return true;
      }
    }
  }

  return false;
}

/** PromptPay / shop label shown on slip checkout panel. */
export function slipReceiverDisplayLabel(): string {
  const merchant = process.env.PROMPTPAY_MERCHANT_NAME?.trim();
  if (merchant) return merchant;

  const d = promptPayIdDigits();
  if (!d) return "";
  if (d.length === 10 && d.startsWith("0")) {
    return `${d.slice(0, 3)}-${d.slice(3, 6)}-${d.slice(6)}`;
  }
  if (d.length === 15 && d.startsWith("01")) {
    return `Biller ${d}`;
  }
  return process.env.PROMPTPAY_ID?.trim() ?? d;
}
