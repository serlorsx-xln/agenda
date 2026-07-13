import "server-only";

import type { ScbSlipResult } from "@/lib/billing/scb-slip-types";

const DEFAULT_TIMEOUT_MS = 120_000;

function baseUrl(): string | null {
  const url = process.env.SCB_SLIP_URL?.trim();
  return url ? url.replace(/\/$/, "") : null;
}

function authHeaders(): Record<string, string> {
  const key = process.env.SCB_API_KEY?.trim();
  const project = process.env.SCB_PROJECT?.trim();
  const headers: Record<string, string> = {};
  if (key) headers.Authorization = `Bearer ${key}`;
  if (project) headers["X-Project"] = project;
  return headers;
}

export async function verifySlipImage(
  imageBytes: Buffer,
  amountBaht: number,
  filename = "slip.jpg",
): Promise<ScbSlipResult> {
  const url = baseUrl();
  const key = process.env.SCB_API_KEY?.trim();
  const project = process.env.SCB_PROJECT?.trim();
  if (!url || !key || !project) throw new Error("SCB_SLIP_NOT_CONFIGURED");

  const form = new FormData();
  form.append(
    "file",
    new Blob([new Uint8Array(imageBytes)], { type: "image/jpeg" }),
    filename,
  );
  form.append("amount", amountBaht.toFixed(2));

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);

  try {
    const res = await fetch(`${url}/v1/verify/image`, {
      method: "POST",
      body: form,
      signal: controller.signal,
      headers: authHeaders(),
    });
    clearTimeout(timer);

    const text = await res.text();
    let body: ScbSlipResult | { error?: string };
    try {
      body = JSON.parse(text) as ScbSlipResult;
    } catch {
      throw new Error(`SCB_SLIP_BAD_RESPONSE: ${text.slice(0, 200)}`);
    }

    if (!res.ok) {
      const err = "error" in body ? body.error : text;
      throw new Error(`SCB_SLIP_HTTP_${res.status}: ${err}`);
    }

    return body as ScbSlipResult;
  } catch (e) {
    clearTimeout(timer);
    if (e instanceof Error && e.name === "AbortError") {
      throw new Error("SCB_SLIP_TIMEOUT", { cause: e });
    }
    throw e;
  }
}
