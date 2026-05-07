import type { OrcaAPI } from '../../preload/index.js';

type Platform = { kind: 'electron'; orca: OrcaAPI } | { kind: 'browser' };

let cached: Platform | null = null;

function resolvePlatform(): Platform {
  // Cache so callers (hooks, useEffect deps) get a stable reference. The
  // platform never flips during the renderer's lifetime, so a one-shot read
  // of window.orca is safe.
  if (cached) return cached;
  if (typeof window !== 'undefined' && window.orca) {
    cached = { kind: 'electron', orca: window.orca };
  } else {
    cached = { kind: 'browser' };
  }
  return cached;
}

export function getPlatform(): Platform {
  return resolvePlatform();
}

export function usePlatform(): Platform {
  return resolvePlatform();
}

/**
 * Test-only helper to reset the cached platform so unit tests can install a
 * fresh `window.orca` mock between cases without leaking state.
 */
export function __resetPlatformCacheForTests(): void {
  cached = null;
}
