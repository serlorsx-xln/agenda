import { anyUserSendInFlight } from "./send-queue.js";
import {
  cancelRun,
  clearRunCancellation,
  isRunCancelled,
  resetRunCancellation,
} from "./run-cancellation.js";

export {
  currentHourInTz,
  isHourWithinWindow,
  isWithinWindow,
  sameDayInTz,
} from "./send-queue-utils.js";

export {
  cancelRun,
  clearRunCancellation,
  isRunCancelled,
  resetRunCancellation,
};

export function anyRunning(): boolean {
  return anyUserSendInFlight();
}

export { runCampaignManual } from "./send-queue.js";
