import { createHmac, timingSafeEqual } from 'node:crypto';

export const SIGNATURE_HEADER = 'X-Signature';

export function signBody(secretKey: string, rawBody: string | Buffer): string {
  return createHmac('sha256', secretKey).update(rawBody).digest('hex');
}

export function signatureMatches(secretKey: string, rawBody: Buffer, signature: string): boolean {
  const expected = Buffer.from(signBody(secretKey, rawBody));
  const given = Buffer.from(signature);
  return given.length === expected.length && timingSafeEqual(given, expected);
}
