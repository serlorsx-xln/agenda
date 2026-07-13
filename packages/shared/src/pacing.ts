/** Hard floor between campaign sends (seconds). Prevents bursty LINE traffic. */
export const MIN_SEND_DELAY_SEC = 300;

/** Sensible defaults for new campaigns. */
export const DEFAULT_SEND_DELAY_SEC = 300;
export const DEFAULT_SEND_JITTER_SEC = 60;
