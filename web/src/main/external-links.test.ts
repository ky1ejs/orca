import { describe, expect, it } from 'vitest';
import { isAllowedExternalUrl } from './external-links.js';

describe('isAllowedExternalUrl', () => {
  it.each(['https://orca.dev', 'http://localhost:5173/x', 'mailto:team@example.com'])(
    'allows %s',
    (url) => expect(isAllowedExternalUrl(url)).toBe(true),
  );

  it.each([
    'file:///Applications/Calculator.app',
    'orca://github/callback?installation_id=1&workspaceId=w',
    'javascript:alert(1)',
    'smb://server/share',
    '../../x.command',
    '',
  ])('refuses %s', (url) => expect(isAllowedExternalUrl(url)).toBe(false));
});
