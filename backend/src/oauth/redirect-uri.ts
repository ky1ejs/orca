const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);

function parse(uri: string): URL | null {
  try {
    return new URL(uri);
  } catch {
    return null;
  }
}

function isLoopback(url: URL): boolean {
  return url.protocol === 'http:' && LOOPBACK_HOSTS.has(url.hostname);
}

/**
 * Registration accepts HTTPS URLs and HTTP loopback URLs (RFC 8252 §7.3),
 * with no fragment. Custom schemes are not accepted.
 */
export function isAllowedRedirectUri(uri: string): boolean {
  const url = parse(uri);
  if (!url || url.hash || url.username || url.password) return false;
  return url.protocol === 'https:' || isLoopback(url);
}

/**
 * Exact string match, except that loopback redirects may use any port
 * (RFC 8252 §7.3), because native clients pick a free port at runtime.
 */
export function matchesRegisteredRedirectUri(uri: string, registered: string[]): boolean {
  if (registered.includes(uri)) return true;
  const url = parse(uri);
  if (!url || !isLoopback(url)) return false;
  return registered.some((candidate) => {
    const reg = parse(candidate);
    if (!reg || !isLoopback(reg)) return false;
    return (
      reg.hostname === url.hostname && reg.pathname === url.pathname && reg.search === url.search
    );
  });
}
