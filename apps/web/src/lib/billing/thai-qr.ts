/**
 * Thai QR Payment (EMVCo) helpers — PromptPay Bill Payment / Mae Manee (tag 30).
 * Spec: BOT Thai QR Payment; AID A000000677010112 = PromptPay Bill Payment.
 */

const BILL_PAYMENT_AID = "A000000677010112";

/** EMV TLV: 2-digit id + 2-digit length + value */
export function emvTlv(id: string, value: string): string {
  if (!/^\d{2}$/.test(id)) throw new Error(`invalid EMV tag id: ${id}`);
  if (value.length > 99) throw new Error(`EMV value too long for tag ${id}`);
  return `${id}${String(value.length).padStart(2, "0")}${value}`;
}

/** CRC-16/CCITT-FALSE (poly 0x1021, init 0xFFFF) — EMV QR. */
export function emvCrc16(payload: string): string {
  let crc = 0xffff;
  for (let i = 0; i < payload.length; i++) {
    crc ^= payload.charCodeAt(i) << 8;
    for (let bit = 0; bit < 8; bit++) {
      crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, "0");
}

function formatAmount(amountBaht: number): string {
  if (!Number.isFinite(amountBaht) || amountBaht <= 0) {
    throw new Error("amount must be a positive number");
  }
  return amountBaht.toFixed(2);
}

/**
 * Bill payment refs are alphanumeric (BOT). Preserve Mae Manee IDs like
 * `QN122990MB11420395G` — do not invent a different ref1 or banks reject the QR.
 */
export function sanitizeBillRef(raw: string, maxLen = 25): string {
  const cleaned = raw.toUpperCase().replace(/[^A-Z0-9]/g, "");
  return cleaned.slice(0, maxLen);
}

export type BillPaymentQrInput = {
  /** 15-digit PromptPay biller id (e.g. 01 + 13-digit tax id). */
  billerId: string;
  amountBaht: number;
  /**
   * Reference 1 — mandatory for this biller. For Mae Manee must stay the
   * registered QR id (e.g. QN…), not Agenda's PP- payment reference.
   */
  ref1: string;
  /** Reference 2 — shop name (e.g. SLYNX). */
  ref2?: string;
  /**
   * Raw contents of EMV tag 62 (additional data), e.g. terminal id TLV
   * `07200000MgVlF7VzCJoONVp9` from the merchant's original QR.
   */
  additionalData?: string;
  /**
   * Point of initiation. Mae Manee static cards use `11`; keep `11` even with
   * amount for wider bank acceptance (some apps reject `12` for this family).
   */
  pointOfInitiation?: "11" | "12";
};

/**
 * Mae Manee / Bill Payment QR with locked amount.
 * Mirrors the merchant's registered QR structure (biller + QN ref + tag 62).
 */
export function buildBillPaymentPayload(input: BillPaymentQrInput): string {
  const biller = input.billerId.replace(/\D/g, "");
  if (biller.length < 13 || biller.length > 15) {
    throw new Error("biller id must be 13–15 digits");
  }

  const ref1 = sanitizeBillRef(input.ref1, 25);
  if (!ref1) {
    throw new Error("bill payment ref1 (Mae Manee QR id) is required");
  }

  let merchant =
    emvTlv("00", BILL_PAYMENT_AID) +
    emvTlv("01", biller) +
    emvTlv("02", ref1);
  if (input.ref2) {
    const ref2 = sanitizeBillRef(input.ref2, 25);
    if (ref2) merchant += emvTlv("03", ref2);
  }

  const poi = input.pointOfInitiation ?? "11";
  let body =
    emvTlv("00", "01") +
    emvTlv("01", poi) +
    emvTlv("30", merchant) +
    emvTlv("53", "764") +
    emvTlv("54", formatAmount(input.amountBaht)) +
    emvTlv("58", "TH");

  const add = input.additionalData?.trim();
  if (add) {
    body += emvTlv("62", add);
  }

  const withCrcPlaceholder = `${body}6304`;
  return `${body}${emvTlv("63", emvCrc16(withCrcPlaceholder))}`;
}

/** True when PROMPTPAY_ID looks like a bill/biller id (not a phone). */
export function isBillPaymentPromptPayId(id: string): boolean {
  const d = id.replace(/\D/g, "");
  if (d.length === 15 && d.startsWith("01")) return true;
  if (d.length === 13) return true;
  const mode = (process.env.PROMPTPAY_TYPE ?? "").toLowerCase();
  return mode === "bill" || mode === "merchant" || mode === "maemanee";
}

/** Normalize to 15-digit biller (prefix 01 on 13-digit tax id). */
export function toBillerId(id: string): string {
  const d = id.replace(/\D/g, "");
  if (d.length === 15) return d;
  if (d.length === 13) return `01${d}`;
  return d;
}
