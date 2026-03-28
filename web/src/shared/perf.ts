/**
 * Lightweight performance timer for tracing operation latency.
 * Browser-safe (no Node dependencies) — usable in renderer, main, and daemon.
 *
 * Usage:
 *   const mark = createPerfTimer('agent.launch', (msg) => logger.info(msg));
 *   mark('dir-validated');   // → [perf] agent.launch dir-validated +2ms
 *   mark('session-created'); // → [perf] agent.launch session-created +15ms
 */
export function createPerfTimer(
  scope: string,
  log: (msg: string) => void,
): (label: string) => void {
  const t0 = Date.now();
  return (label: string) => log(`[perf] ${scope} ${label} +${Date.now() - t0}ms`);
}
