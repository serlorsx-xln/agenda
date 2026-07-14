/** Hard floor between any campaign sends on the same account (seconds). */
export const MIN_ACCOUNT_SEND_DELAY_SEC = 300;

/** Sensible defaults for new campaigns (account inter-send). */
export const DEFAULT_SEND_DELAY_SEC = 300;
export const DEFAULT_SEND_JITTER_SEC = 60;

/** Hard floor before sending to the same chat again (seconds). */
export const MIN_PER_CHAT_COOLDOWN_SEC = 1800;
/** Default wait before the same chat again (3 hours). */
export const DEFAULT_PER_CHAT_COOLDOWN_SEC = 3 * 60 * 60;
