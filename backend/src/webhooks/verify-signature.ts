import { createHmac, timingSafeEqual } from 'node:crypto';

export async function verifyGitHubSignature(
  body: ArrayBuffer,
  signatureHeader: string,
  secret: string,
): Promise<boolean> {
  const expected = createHmac('sha256', secret).update(Buffer.from(body)).digest('hex');

  const expectedSig = `sha256=${expected}`;

  if (signatureHeader.length !== expectedSig.length) {
    return false;
  }

  return timingSafeEqual(Buffer.from(signatureHeader), Buffer.from(expectedSig));
}
