/**
 * Limits on task intake, which buffers up to 52 MiB per request in a process
 * that also serves the app. They are per process: Orca runs one machine.
 */

/** Intake requests handled at once; more get 429 and retry. */
export const MAX_CONCURRENT_INTAKES = 4;
/** Intake requests per API key per minute. */
export const MAX_INTAKES_PER_KEY_PER_MINUTE = 60;
const WINDOW_MS = 60 * 1000;

let inFlight = 0;
const recentRequests = new Map<string, number[]>();

/**
 * Claims a slot for one intake request, or says why it can't. Call `release`
 * when the request finishes.
 */
export function acquireIntakeSlot(
  apiKeyId: string,
  now: number = Date.now(),
): { release: () => void } | { retryAfterSeconds: number; reason: string } {
  const timestamps = (recentRequests.get(apiKeyId) ?? []).filter((t) => now - t < WINDOW_MS);
  if (timestamps.length >= MAX_INTAKES_PER_KEY_PER_MINUTE) {
    recentRequests.set(apiKeyId, timestamps);
    const retryAfterMs = WINDOW_MS - (now - timestamps[0]);
    return {
      retryAfterSeconds: Math.max(1, Math.ceil(retryAfterMs / 1000)),
      reason: `This API key is limited to ${MAX_INTAKES_PER_KEY_PER_MINUTE} tasks a minute`,
    };
  }
  if (inFlight >= MAX_CONCURRENT_INTAKES) {
    return { retryAfterSeconds: 5, reason: 'Too many tasks are being created right now' };
  }
  timestamps.push(now);
  recentRequests.set(apiKeyId, timestamps);
  inFlight += 1;
  let released = false;
  return {
    release: () => {
      if (released) return;
      released = true;
      inFlight -= 1;
    },
  };
}

/** For tests. */
export function resetIntakeLimits(): void {
  inFlight = 0;
  recentRequests.clear();
}
