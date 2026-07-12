type LogLevel = "debug" | "info" | "warn" | "error";

type LogFields = Record<string, unknown>;

export function log(
  level: LogLevel,
  message: string,
  fields?: LogFields,
): void {
  const entry = {
    ts: new Date().toISOString(),
    level,
    service: "worker-line",
    msg: message,
    ...fields,
  };
  const line = JSON.stringify(entry);
  if (level === "error") {
    console.error(line);
  } else if (level === "warn") {
    console.warn(line);
  } else {
    console.log(line);
  }
}

/** Strip internal details from errors returned to API clients. */
export function publicErrorMessage(err: unknown): string {
  if (!(err instanceof Error)) return "Request failed";
  const msg = err.message;
  if (msg.includes("Unauthorized") || msg.includes("not connected")) {
    return msg;
  }
  if (msg.startsWith("e2ee_keys_invalid")) return msg;
  if (msg.startsWith("Group E2EE")) return msg;
  if (msg.length > 200) return "Request failed";
  return msg;
}
