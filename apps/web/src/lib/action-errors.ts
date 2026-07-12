export function resolveActionError(
  t: (key: string) => string,
  code?: string | null,
  fallback?: string,
): string {
  if (!code) {
    return fallback ?? t("generic");
  }
  const msg = t(code as never);
  if (msg && msg !== code) return msg;
  return fallback ?? code;
}
