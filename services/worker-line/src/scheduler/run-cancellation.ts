const cancelledRuns = new Set<string>();

export function cancelRun(runId: string): void {
  cancelledRuns.add(runId);
}

export function isRunCancelled(runId: string): boolean {
  return cancelledRuns.has(runId);
}

export function clearRunCancellation(runId: string): void {
  cancelledRuns.delete(runId);
}

/** @internal Test helper */
export function resetRunCancellation(): void {
  cancelledRuns.clear();
}
