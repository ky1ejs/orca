import { describe, it, expect } from 'vitest';
import { createHmac } from 'node:crypto';
import { verifyGitHubSignature } from './verify-signature.js';

function sign(body: string, secret: string): string {
  const hmac = createHmac('sha256', secret).update(body).digest('hex');
  return `sha256=${hmac}`;
}

describe('verifyGitHubSignature', () => {
  const secret = 'test-secret';

  it('accepts a valid signature', async () => {
    const body = '{"action":"opened"}';
    const sig = sign(body, secret);
    const result = await verifyGitHubSignature(
      new TextEncoder().encode(body).buffer as ArrayBuffer,
      sig,
      secret,
    );
    expect(result).toBe(true);
  });

  it('rejects an invalid signature', async () => {
    const body = '{"action":"opened"}';
    const result = await verifyGitHubSignature(
      new TextEncoder().encode(body).buffer as ArrayBuffer,
      'sha256=0000000000000000000000000000000000000000000000000000000000000000',
      secret,
    );
    expect(result).toBe(false);
  });

  it('rejects a tampered body', async () => {
    const body = '{"action":"opened"}';
    const sig = sign(body, secret);
    const tampered = '{"action":"closed"}';
    const result = await verifyGitHubSignature(
      new TextEncoder().encode(tampered).buffer as ArrayBuffer,
      sig,
      secret,
    );
    expect(result).toBe(false);
  });

  it('works with empty body', async () => {
    const body = '';
    const sig = sign(body, secret);
    const result = await verifyGitHubSignature(
      new TextEncoder().encode(body).buffer as ArrayBuffer,
      sig,
      secret,
    );
    expect(result).toBe(true);
  });
});
