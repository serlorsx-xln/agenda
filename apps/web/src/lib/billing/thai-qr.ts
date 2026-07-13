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

/** Keep only A–Z / 0–9 for bill payment refs (bank apps are picky). */
export function sanitizeBillRef(raw: string, maxLen = 20): string {
  const cleaned = raw.toUpperCase().replace(/[^A-Z0-9]/g, "");
  return (cleaned || "AGENDA").slice(0, maxLen);
}

export type BillPaymentQrInput = {
  /** 15-digit PromptPay biller id (e.g. 01 + 13-digit tax id). */
  billerId: string;
  amountBaht: number;
  /** Reference 1 — usually invoice / payment ref. */
  ref1?: string;
  /** Reference 2 — often shop name (e.g. SLYNX). */
  ref2?: string;
};

/**
 * Dynamic Mae Manee / Bill Payment QR with locked amount (POI method 12).
 */
export function buildBillPaymentPayload(input: BillPaymentQrInput): string {
  const biller = input.billerId.replace(/\D/g, "");
  if (biller.length < 13 || biller.length > 15) {
    throw new Error("biller id must be 13–15 digits");
  }

  let merchant = emvTlv("00", BILL_PAYMENT_AID) + emvTlv("01", biller);
  if (input.ref1) merchant += emvTlv("02", sanitizeBillRef(input.ref1));
  if (input.ref2) {
    merchant += emvTlv("03", sanitizeBillRef(input.ref2, 25));
  }

  const body =
    emvTlv("00", "01") +
    emvTlv("01", "12") +
    emvTlv("30", merchant) +
    emvTlv("53", "764") +
    emvTlv("54", formatAmount(input.amountBaht)) +
    emvTlv("58", "TH");

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
