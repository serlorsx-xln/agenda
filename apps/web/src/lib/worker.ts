import "server-only";

import {
  createWorkerUserToken,
  extractLineUserIdFromPath,
} from "@line/shared/worker-token";

const WORKER_URL = process.env.WORKER_LINE_URL ?? "http://localhost:4000";
const INTERNAL_API_KEY = process.env.INTERNAL_API_KEY ?? "";

export class WorkerError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
    this.name = "WorkerError";
  }
}

/**
 * Server-only client for the worker-line internal API. Authenticated with the
 * shared INTERNAL_API_KEY plus a short-lived user-scoped token.
 */
const DEFAULT_WORKER_TIMEOUT_MS = 90_000;

export async function workerFetch<T = unknown>(
  path: string,
  init?: RequestInit,
  actingUserId?: string,
): Promise<T> {
  const userId =
    actingUserId ?? extractLineUserIdFromPath(path.split("?")[0] ?? path);

  const headers: Record<string, string> = {
    "content-type": "application/json",
    "x-internal-key": INTERNAL_API_KEY,
    ...(init?.headers as Record<string, string> | undefined),
  };

  if (userId && INTERNAL_API_KEY) {
    headers["x-worker-user-token"] = createWorkerUserToken(
      userId,
      INTERNAL_API_KEY,
    );
  }

  const timeoutMs =
    Number(process.env.WORKER_FETCH_TIMEOUT_MS) || DEFAULT_WORKER_TIMEOUT_MS;
  const externalSignal = init?.signal;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const onExternalAbort = () => controller.abort();
  externalSignal?.addEventListener("abort", onExternalAbort, { once: true });

  let res: Response;
  try {
    res = await fetch(`${WORKER_URL}${path}`, {
      ...init,
      headers,
      cache: "no-store",
      signal: controller.signal,
    });
  } catch (err) {
    if (controller.signal.aborted && !externalSignal?.aborted) {
      throw new WorkerError(`Worker request timed out after ${timeoutMs}ms`, 504);
    }
    throw err;
  } finally {
    clearTimeout(timer);
    externalSignal?.removeEventListener("abort", onExternalAbort);
  }

  if (!res.ok) {
    let message = `Worker request failed (${res.status})`;
    try {
      const body = (await res.json()) as { error?: string };
      if (body?.error) message = body.error;
    } catch {
      // ignore body parse errors
    }
    throw new WorkerError(message, res.status);
  }

  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}
