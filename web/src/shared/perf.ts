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

/**
 * Renderer-side perf log function. Writes to both the browser console (for DevTools)
 * and to the main process log file via IPC (for CLI/file access).
 */
export function rendererPerfLog(msg: string): void {
  console.log(msg);
  // window.orca is injected by preload in Electron; absent in browser-only / test contexts.
  // Use a type-safe access pattern since shared/ code doesn't have the renderer's global.d.ts.
  const orca = typeof window !== 'undefined' ? (window as { orca?: { perf?: { log: (m: string) => void } } }).orca : undefined;
  orca?.perf?.log(msg);
}
