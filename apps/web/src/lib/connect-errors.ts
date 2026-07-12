const CONNECT_ERROR_KEYS = {
  line_mid_in_use: "midInUse",
  qr_expired: "qrExpired",
  login_timeout: "loginTimeout",
  login_failed: "loginFailed",
  login_cancelled: "loginCancelled",
  e2ee_keys_invalid: "e2eeInvalid",
  session_permission: "sessionPermission",
} as const;

type ConnectErrorKey = keyof typeof CONNECT_ERROR_KEYS;

function isConnectErrorCode(value: string): value is ConnectErrorKey {
  return value in CONNECT_ERROR_KEYS;
}

/** Resolve worker `lastError` codes to connect.errors.* i18n keys. */
export function connectErrorMessageKey(
  lastError: string,
): `errors.${(typeof CONNECT_ERROR_KEYS)[ConnectErrorKey]}` | null {
  if (isConnectErrorCode(lastError)) {
    return `errors.${CONNECT_ERROR_KEYS[lastError]}`;
  }
  if (lastError.startsWith("e2ee_keys_invalid")) {
    return "errors.e2eeInvalid";
  }
  return null;
}
