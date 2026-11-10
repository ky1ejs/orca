/**
 * The origin clients use to reach this server, e.g. `https://orca-api.fly.dev`.
 * `PUBLIC_URL` wins when set. Otherwise it comes from the request, honouring
 * `X-Forwarded-Proto` because Fly terminates TLS in front of the app.
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
