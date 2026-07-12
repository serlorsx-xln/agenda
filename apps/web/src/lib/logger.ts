type LogLevel = "debug" | "info" | "warn" | "error";

type LogMeta = Record<string, unknown>;

function write(
  level: LogLevel,
  scope: string,
  message: string,
  meta?: LogMeta,
): void {
  const entry = {
    level,
    scope,
    message,
    ts: new Date().toISOString(),
    ...meta,
  };
  const line = JSON.stringify(entry);
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

export function createLogger(scope: string) {
  return {
    debug: (message: string, meta?: LogMeta) =>
      write("debug", scope, message, meta),
    info: (message: string, meta?: LogMeta) =>
      write("info", scope, message, meta),
    warn: (message: string, meta?: LogMeta) =>
      write("warn", scope, message, meta),
    error: (message: string, meta?: LogMeta) =>
      write("error", scope, message, meta),
  };
}
