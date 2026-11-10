import { randomUUID } from 'node:crypto';
import type { PrismaClient } from '@prisma/client';
import { SignJWT, jwtVerify } from 'jose';
import { getSecret } from '../auth/jwt.js';
import { verifyPassword } from '../auth/password.js';
import { escapeHtml } from '../webhooks/render-page.js';
import {
  ACCESS_TOKEN_TTL_SECONDS,
  AUTHORIZATION_CODE_TTL_MS,
  REFRESH_REUSE_GRACE_MS,
  REFRESH_TOKEN_TTL_MS,
  getPublicOrigin,
  mcpResourceUrl,
} from './config.js';
import { isAllowedRedirectUri, matchesRegisteredRedirectUri } from './redirect-uri.js';
import { hashToken, randomToken, signAccessToken, verifyPkce } from './tokens.js';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Authorization, Content-Type, Mcp-Protocol-Version',
};

const MAX_FORM_BYTES = 16 * 1024;

function json(body: unknown, status = 200, headers?: HeadersInit): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS_HEADERS, ...headers },
  });
}

/** OAuth error response (RFC 6749 §5.2). Token responses must not be cached. */
function oauthError(error: string, description: string, status = 400): Response {
  return json({ error, error_description: description }, status, { 'Cache-Control': 'no-store' });
}

export function corsPreflight(): Response {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

async function readForm(request: Request): Promise<URLSearchParams | null> {
  const text = await request.text();
  if (text.length > MAX_FORM_BYTES) return null;
  return new URLSearchParams(text);
}

// ─── Metadata ───────────────────────────────────────────────────────

/** RFC 9728 protected resource metadata for /mcp. */
export function protectedResourceMetadata(request: Request): Response {
  const origin = getPublicOrigin(request);
  return json({
    resource: mcpResourceUrl(origin),
    authorization_servers: [origin],
    bearer_methods_supported: ['header'],
    resource_name: 'Orca',
  });
}

/** RFC 8414 authorization server metadata. */
export function authorizationServerMetadata(request: Request): Response {
  const origin = getPublicOrigin(request);
  return json({
    issuer: origin,
    authorization_endpoint: `${origin}/oauth/authorize`,
    token_endpoint: `${origin}/oauth/token`,
    registration_endpoint: `${origin}/oauth/register`,
    response_types_supported: ['code'],
    grant_types_supported: ['authorization_code', 'refresh_token'],
    code_challenge_methods_supported: ['S256'],
    token_endpoint_auth_methods_supported: ['none'],
    authorization_response_iss_parameter_supported: true,
  });
}

// ─── Dynamic Client Registration (RFC 7591) ─────────────────────────

const MAX_REDIRECT_URIS = 10;
const MAX_CLIENT_NAME = 100;

export async function registerClient(request: Request, prisma: PrismaClient): Promise<Response> {
  const text = await request.text();
  if (text.length > MAX_FORM_BYTES) {
    return oauthError('invalid_client_metadata', 'Registration request is too large.');
  }

  let body: {
    redirect_uris?: unknown;
    client_name?: unknown;
    token_endpoint_auth_method?: unknown;
    grant_types?: unknown;
    response_types?: unknown;
  };
  try {
    body = JSON.parse(text);
  } catch {
    return oauthError('invalid_client_metadata', 'Body must be JSON.');
  }

  const redirectUris = body.redirect_uris;
  if (
    !Array.isArray(redirectUris) ||
    redirectUris.length === 0 ||
    redirectUris.length > MAX_REDIRECT_URIS ||
    !redirectUris.every((uri) => typeof uri === 'string' && isAllowedRedirectUri(uri))
  ) {
    return oauthError(
      'invalid_redirect_uri',
      'redirect_uris must list 1-10 HTTPS or http://localhost URLs without fragments.',
    );
  }

  const authMethod = body.token_endpoint_auth_method ?? 'none';
  if (authMethod !== 'none') {
    return oauthError(
      'invalid_client_metadata',
      'Only public clients are supported (token_endpoint_auth_method "none").',
    );
  }

  const grantTypes = body.grant_types ?? ['authorization_code', 'refresh_token'];
  if (
    !Array.isArray(grantTypes) ||
    !grantTypes.every((g) => g === 'authorization_code' || g === 'refresh_token')
  ) {
    return oauthError('invalid_client_metadata', 'Unsupported grant_types.');
  }

  const responseTypes = body.response_types ?? ['code'];
  if (!Array.isArray(responseTypes) || !responseTypes.every((r) => r === 'code')) {
    return oauthError('invalid_client_metadata', 'Unsupported response_types.');
  }

  const name =
    typeof body.client_name === 'string' && body.client_name.trim()
      ? body.client_name.trim().slice(0, MAX_CLIENT_NAME)
      : 'MCP client';

  const client = await prisma.oAuthClient.create({
    data: { name, redirectUris: redirectUris as string[] },
  });

  return json(
    {
      client_id: client.id,
      client_id_issued_at: Math.floor(client.createdAt.getTime() / 1000),
      client_name: client.name,
      redirect_uris: client.redirectUris,
      token_endpoint_auth_method: 'none',
      grant_types: grantTypes,
      response_types: responseTypes,
    },
    201,
  );
}

// ─── Authorization endpoint ─────────────────────────────────────────

interface AuthorizationRequest {
  clientId: string;
  clientName: string;
  redirectUri: string;
  codeChallenge: string;
  state: string | null;
  resource: string;
}

/**
 * Browsers apply `form-action` to redirects that follow a form submission, so
 * the sign-in page must also allow the origin of the client's redirect URI.
 * Otherwise the 302 back to the client is blocked after Allow or Cancel.
 */
function pageHeaders(redirectOrigin?: string): HeadersInit {
  const formAction = ["'self'", redirectOrigin].filter(Boolean).join(' ');
  return {
    'Content-Type': 'text/html; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Frame-Options': 'DENY',
    'Content-Security-Policy': `default-src 'none'; style-src 'unsafe-inline'; form-action ${formAction}; frame-ancestors 'none'`,
    'Referrer-Policy': 'no-referrer',
  };
}

function page(title: string, body: string, status = 200, redirectOrigin?: string): Response {
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Orca — ${escapeHtml(title)}</title>
  <style>
    :root { color-scheme: dark; }
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; display: flex; justify-content: center; align-items: center; min-height: 100vh; margin: 0; padding: 0 16px; background: #0e0d0c; color: #e5e3de; box-sizing: border-box; }
    .card { width: 100%; max-width: 380px; padding: 2rem 0; }
    h1 { font-size: 1.25rem; margin: 0 0 0.5rem; }
    p { color: #9b9a97; font-size: 0.875rem; line-height: 1.5; margin: 0 0 1rem; }
    strong { color: #e5e3de; }
    label { display: block; font-size: 0.8125rem; color: #9b9a97; margin: 0.75rem 0 0.25rem; }
    input { width: 100%; box-sizing: border-box; padding: 0.6rem 0.75rem; border-radius: 6px; border: 1px solid #333; background: #1c1b1a; color: #e5e3de; font-size: 1rem; }
    .actions { display: flex; gap: 0.5rem; margin-top: 1.25rem; }
    button { flex: 1; padding: 0.6rem; border-radius: 6px; border: 1px solid #333; font-size: 0.9375rem; cursor: pointer; background: #1c1b1a; color: #e5e3de; }
    button.primary { background: #e5e3de; color: #0e0d0c; border-color: #e5e3de; }
    .error { color: #e55; }
  </style>
</head>
<body><div class="card">${body}</div></body>
</html>`;
  return new Response(html, { status, headers: pageHeaders(redirectOrigin) });
}

function errorPage(message: string, status = 400): Response {
  return page(
    'Authorization error',
    `<h1>Can't connect to Orca</h1><p class="error">${escapeHtml(message)}</p>`,
    status,
  );
}

function redirectWithParams(redirectUri: string, params: Record<string, string | null>): Response {
  const url = new URL(redirectUri);
  for (const [key, value] of Object.entries(params)) {
    if (value !== null) url.searchParams.set(key, value);
  }
  return new Response(null, {
    status: 302,
    headers: { Location: url.toString(), 'Cache-Control': 'no-store' },
  });
}

/** Signs the validated request into the login form so POST can trust it. */
async function sealRequest(req: AuthorizationRequest): Promise<string> {
  return new SignJWT({ ...req })
    .setProtectedHeader({ alg: 'HS256', typ: 'orca-oauth-request' })
    .setIssuedAt()
    .setExpirationTime('15m')
    .sign(getSecret());
}

async function unsealRequest(sealed: string): Promise<AuthorizationRequest | null> {
  try {
    const { payload } = await jwtVerify(sealed, getSecret(), { typ: 'orca-oauth-request' });
    return payload as unknown as AuthorizationRequest;
  } catch {
    return null;
  }
}

/**
 * Anyone can register a client and pick its name, so the page identifies the
 * app by where it sends you back to, which Orca checked at registration, and
 * shows the self-declared name only as a claim.
 */
function describeDestination(redirectUri: string): string {
  const url = new URL(redirectUri);
  return url.protocol === 'http:' ? 'an app on this computer' : url.hostname;
}

function loginForm(
  req: AuthorizationRequest,
  sealed: string,
  error?: string,
  email = '',
): Response {
  const destination = escapeHtml(describeDestination(req.redirectUri));
  return page(
    'Connect',
    `<h1>Allow ${destination} to access Orca?</h1>
    <p>It will be able to read and change your Orca workspaces, projects and tasks. After you allow it, you'll return to <strong>${destination}</strong>.</p>
    <p>The app calls itself <strong>${escapeHtml(req.clientName)}</strong>. Orca doesn't verify this name. Only continue if you started connecting from ${destination}.</p>
    ${error ? `<p class="error">${escapeHtml(error)}</p>` : ''}
    <form method="post" action="/oauth/authorize">
      <input type="hidden" name="request" value="${escapeHtml(sealed)}">
      <label for="email">Email</label>
      <input id="email" name="email" type="email" autocomplete="username" required value="${escapeHtml(email)}">
      <label for="password">Password</label>
      <input id="password" name="password" type="password" autocomplete="current-password" required>
      <div class="actions">
        <button type="submit" name="action" value="deny" formnovalidate>Cancel</button>
        <button type="submit" name="action" value="allow" class="primary">Allow</button>
      </div>
    </form>`,
    error ? 401 : 200,
    new URL(req.redirectUri).origin,
  );
}

export async function authorizeGet(request: Request, prisma: PrismaClient): Promise<Response> {
  const params = new URL(request.url).searchParams;
  const clientId = params.get('client_id');
  const redirectUri = params.get('redirect_uri');

  // Until client_id and redirect_uri are validated, errors must not redirect
  // (RFC 6749 §4.1.2.1): show them on the page instead.
  if (!clientId) return errorPage('The request is missing client_id.');
  const client = await prisma.oAuthClient.findUnique({ where: { id: clientId } });
  if (!client) return errorPage('This app is not registered with Orca. Try connecting again.');
  if (!redirectUri || !matchesRegisteredRedirectUri(redirectUri, client.redirectUris)) {
    return errorPage('The redirect_uri does not match the app’s registration.');
  }

  const state = params.get('state');
  const fail = (error: string, description: string) =>
    redirectWithParams(redirectUri, {
      error,
      error_description: description,
      state,
      iss: getPublicOrigin(request),
    });

  if (params.get('response_type') !== 'code') {
    return fail('unsupported_response_type', 'Only response_type=code is supported.');
  }
  const codeChallenge = params.get('code_challenge');
  if (!codeChallenge || params.get('code_challenge_method') !== 'S256') {
    return fail('invalid_request', 'PKCE with code_challenge_method=S256 is required.');
  }
  const expectedResource = mcpResourceUrl(getPublicOrigin(request));
  const resource = params.get('resource') ?? expectedResource;
  if (resource !== expectedResource) {
    return fail('invalid_target', `resource must be ${expectedResource}.`);
  }

  const req: AuthorizationRequest = {
    clientId: client.id,
    clientName: client.name,
    redirectUri,
    codeChallenge,
    state,
    resource,
  };
  return loginForm(req, await sealRequest(req));
}

export async function authorizePost(request: Request, prisma: PrismaClient): Promise<Response> {
  const form = await readForm(request);
  if (!form) return errorPage('The request is too large.', 413);

  const sealed = form.get('request') ?? '';
  const req = await unsealRequest(sealed);
  if (!req) return errorPage('This sign-in link expired. Start connecting again from your app.');

  const iss = getPublicOrigin(request);
  if (form.get('action') !== 'allow') {
    return redirectWithParams(req.redirectUri, {
      error: 'access_denied',
      error_description: 'The user declined access.',
      state: req.state,
      iss,
    });
  }

  const email = form.get('email')?.trim() ?? '';
  const password = form.get('password') ?? '';
  const user = email ? await prisma.user.findUnique({ where: { email } }) : null;
  const valid = user ? await verifyPassword(password, user.passwordHash) : false;
  if (!user || !valid) {
    return loginForm(req, sealed, 'Incorrect email or password.', email);
  }

  const code = randomToken();
  await prisma.oAuthAuthorizationCode.create({
    data: {
      codeHash: hashToken(code),
      clientId: req.clientId,
      userId: user.id,
      redirectUri: req.redirectUri,
      codeChallenge: req.codeChallenge,
      resource: req.resource,
      expiresAt: new Date(Date.now() + AUTHORIZATION_CODE_TTL_MS),
    },
  });

  return redirectWithParams(req.redirectUri, { code, state: req.state, iss });
}

// ─── Token endpoint ─────────────────────────────────────────────────

interface TokenGrant {
  clientId: string;
  userId: string;
  resource: string;
}

type Db = Pick<PrismaClient, 'oAuthRefreshToken'>;

/**
 * Stores a new refresh token. A new sign-in starts a family; a refresh
 * continues it and keeps its absolute expiry, so a sign-in lasts at most
 * REFRESH_TOKEN_TTL_MS however often it is refreshed.
 */
async function createRefreshToken(
  db: Db,
  grant: TokenGrant,
  family?: { familyId: string; expiresAt: Date },
): Promise<string> {
  const refreshToken = randomToken();
  await db.oAuthRefreshToken.create({
    data: {
      tokenHash: hashToken(refreshToken),
      familyId: family?.familyId ?? randomUUID(),
      clientId: grant.clientId,
      userId: grant.userId,
      resource: grant.resource,
      expiresAt: family?.expiresAt ?? new Date(Date.now() + REFRESH_TOKEN_TTL_MS),
    },
  });
  return refreshToken;
}

async function tokenResponse(grant: TokenGrant, refreshToken: string): Promise<Response> {
  const accessToken = await signAccessToken({
    clientId: grant.clientId,
    userId: grant.userId,
    resource: grant.resource,
  });
  return json(
    {
      access_token: accessToken,
      token_type: 'Bearer',
      expires_in: ACCESS_TOKEN_TTL_SECONDS,
      refresh_token: refreshToken,
    },
    200,
    { 'Cache-Control': 'no-store' },
  );
}

async function exchangeAuthorizationCode(
  form: URLSearchParams,
  prisma: PrismaClient,
): Promise<Response> {
  const code = form.get('code');
  const clientId = form.get('client_id');
  const redirectUri = form.get('redirect_uri');
  const codeVerifier = form.get('code_verifier');
  if (!code || !clientId || !redirectUri || !codeVerifier) {
    return oauthError(
      'invalid_request',
      'code, client_id, redirect_uri and code_verifier are required.',
    );
  }

  // Deleting the row makes the code single-use, even under concurrent requests.
  let grant;
  try {
    grant = await prisma.oAuthAuthorizationCode.delete({ where: { codeHash: hashToken(code) } });
  } catch {
    return oauthError('invalid_grant', 'The authorization code is invalid or was already used.');
  }

  if (
    grant.expiresAt < new Date() ||
    grant.clientId !== clientId ||
    grant.redirectUri !== redirectUri
  ) {
    return oauthError('invalid_grant', 'The authorization code is invalid or expired.');
  }
  if (!verifyPkce(codeVerifier, grant.codeChallenge)) {
    return oauthError('invalid_grant', 'code_verifier does not match the code challenge.');
  }
  const resource = form.get('resource');
  if (resource && resource !== grant.resource) {
    return oauthError('invalid_target', 'resource does not match the authorization request.');
  }

  return tokenResponse(grant, await createRefreshToken(prisma, grant));
}

async function exchangeRefreshToken(
  form: URLSearchParams,
  prisma: PrismaClient,
): Promise<Response> {
  const refreshToken = form.get('refresh_token');
  const clientId = form.get('client_id');
  if (!refreshToken || !clientId) {
    return oauthError('invalid_request', 'refresh_token and client_id are required.');
  }

  const tokenHash = hashToken(refreshToken);
  const existing = await prisma.oAuthRefreshToken.findUnique({ where: { tokenHash } });
  if (!existing || existing.clientId !== clientId) {
    return oauthError('invalid_grant', 'The refresh token is invalid.');
  }
  if (existing.expiresAt < new Date()) {
    return oauthError('invalid_grant', 'The refresh token expired.');
  }

  if (!existing.revokedAt) {
    // Rotating and storing the successor in one transaction means a concurrent
    // request never sees the family without an active token. The conditional
    // update makes rotation single-use: a racing request blocks on the row
    // lock, then updates nothing and falls through to the grace check.
    const rotated = await prisma.$transaction(async (tx) => {
      const now = new Date();
      const { count } = await tx.oAuthRefreshToken.updateMany({
        where: { id: existing.id, revokedAt: null },
        data: { revokedAt: now, rotatedAt: now },
      });
      return count === 1 ? createRefreshToken(tx, existing, existing) : null;
    });
    if (rotated) return tokenResponse(existing, rotated);
  }

  // The token was already rotated or revoked, possibly by a concurrent request
  // between our read and our update, so re-read it.
  const current = await prisma.oAuthRefreshToken.findUnique({ where: { tokenHash } });
  const familyActive =
    (await prisma.oAuthRefreshToken.count({
      where: { familyId: existing.familyId, revokedAt: null },
    })) > 0;
  const withinGrace =
    current?.rotatedAt != null &&
    Date.now() - current.rotatedAt.getTime() <= REFRESH_REUSE_GRACE_MS;

  // Retries after a lost response, and clients racing on one stored token,
  // present the old token again within seconds. Give them a token in the same
  // family instead of signing everyone out.
  if (withinGrace && familyActive) {
    return tokenResponse(existing, await createRefreshToken(prisma, existing, existing));
  }

  // Otherwise the old token may have leaked: revoke the whole family
  // (OAuth 2.1 §4.3.1).
  await prisma.oAuthRefreshToken.updateMany({
    where: { familyId: existing.familyId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
  return oauthError('invalid_grant', 'The refresh token was already used.');
}

export async function token(request: Request, prisma: PrismaClient): Promise<Response> {
  const form = await readForm(request);
  if (!form) return oauthError('invalid_request', 'The request is too large.');

  switch (form.get('grant_type')) {
    case 'authorization_code':
      return exchangeAuthorizationCode(form, prisma);
    case 'refresh_token':
      return exchangeRefreshToken(form, prisma);
    default:
      return oauthError('unsupported_grant_type', 'Use authorization_code or refresh_token.');
  }
}
