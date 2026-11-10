/**
 * The origin clients use to reach this server, e.g. `https://orca-api.fly.dev`.
 * `PUBLIC_URL` wins when set, and is required in production (see
 * assertPublicUrlConfigured) because the fallback trusts the `Host` and
 * `X-Forwarded-Proto` headers, which any caller can set. The fallback exists
 * for local development and tests.
 */
export function getPublicOrigin(request: Request): string {
  const configured = process.env.PUBLIC_URL;
  if (configured) return configured.replace(/\/+$/, '');

  const url = new URL(request.url);
  const proto = request.headers.get('x-forwarded-proto')?.split(',')[0]?.trim();
  if (proto === 'https' || proto === 'http') url.protocol = `${proto}:`;
  return url.origin;
}

/** The OAuth resource identifier (RFC 8707) for the MCP endpoint. */
export function mcpResourceUrl(origin: string): string {
  return `${origin}/mcp`;
}

export function protectedResourceMetadataUrl(origin: string): string {
  return `${origin}/.well-known/oauth-protected-resource/mcp`;
}

export const ACCESS_TOKEN_TTL_SECONDS = 60 * 60;
export const REFRESH_TOKEN_TTL_MS = 90 * 24 * 60 * 60 * 1000;
export const AUTHORIZATION_CODE_TTL_MS = 10 * 60 * 1000;
/** How long a just-rotated refresh token still works (retries, races). */
export const REFRESH_REUSE_GRACE_MS = 30 * 1000;
/** Registered clients that never completed a sign-in are deleted after this. */
export const UNUSED_CLIENT_TTL_MS = 24 * 60 * 60 * 1000;

export function assertPublicUrlConfigured(): void {
  if (process.env.NODE_ENV === 'production' && !process.env.PUBLIC_URL) {
    throw new Error(
      'PUBLIC_URL must be set in production: OAuth metadata and token audiences are built from it.',
    );
  }
}
