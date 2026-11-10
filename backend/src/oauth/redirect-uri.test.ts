import { describe, expect, it } from 'vitest';
import { isAllowedRedirectUri, matchesRegisteredRedirectUri } from './redirect-uri.js';

describe('isAllowedRedirectUri', () => {
  it.each([
    'https://claude.ai/api/mcp/auth_callback',
    'http://localhost:33418/callback',
    'http://127.0.0.1/callback',
  ])('allows %s', (uri) => {
    expect(isAllowedRedirectUri(uri)).toBe(true);
  });

  it.each([
    'http://evil.example/callback',
    'https://claude.ai/callback#frag',
    'https://user:pass@claude.ai/callback',
    'myapp://callback',
    'javascript:alert(1)',
    'not a url',
  ])('rejects %s', (uri) => {
    expect(isAllowedRedirectUri(uri)).toBe(false);
  });
});

describe('matchesRegisteredRedirectUri', () => {
  it('requires an exact match for HTTPS', () => {
    const registered = ['https://claude.ai/api/mcp/auth_callback'];
    expect(matchesRegisteredRedirectUri(registered[0], registered)).toBe(true);
    expect(matchesRegisteredRedirectUri(`${registered[0]}?x=1`, registered)).toBe(false);
    expect(matchesRegisteredRedirectUri('https://claude.ai/other', registered)).toBe(false);
  });

  it('allows any port for a registered loopback redirect', () => {
    const registered = ['http://localhost:3000/callback'];
    expect(matchesRegisteredRedirectUri('http://localhost:51234/callback', registered)).toBe(true);
    expect(matchesRegisteredRedirectUri('http://localhost:51234/other', registered)).toBe(false);
    expect(matchesRegisteredRedirectUri('http://127.0.0.1:3000/callback', registered)).toBe(false);
  });
});
