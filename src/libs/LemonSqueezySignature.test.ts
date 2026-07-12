import crypto from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { isValidLemonSqueezySignature } from './LemonSqueezySignature';

const secret = 'whsec_test_secret';

function sign(body: string, withSecret = secret): string {
  return crypto.createHmac('sha256', withSecret).update(body).digest('hex');
}

describe('isValidLemonSqueezySignature', () => {
  it('accepts a signature computed with the correct secret', () => {
    const body = JSON.stringify({ meta: { event_name: 'subscription_created' } });

    expect(isValidLemonSqueezySignature(body, sign(body), secret)).toBe(true);
  });

  it('rejects a signature computed with the wrong secret', () => {
    const body = JSON.stringify({ meta: { event_name: 'subscription_created' } });

    expect(isValidLemonSqueezySignature(body, sign(body, 'wrong_secret'), secret)).toBe(false);
  });

  it('rejects a signature that does not match a tampered body', () => {
    const body = JSON.stringify({ meta: { event_name: 'subscription_created' } });
    const tamperedBody = JSON.stringify({ meta: { event_name: 'subscription_cancelled' } });

    expect(isValidLemonSqueezySignature(tamperedBody, sign(body), secret)).toBe(false);
  });

  it('rejects a missing signature', () => {
    const body = JSON.stringify({ meta: { event_name: 'subscription_created' } });

    expect(isValidLemonSqueezySignature(body, null, secret)).toBe(false);
  });

  it('rejects a signature of a different length instead of throwing', () => {
    const body = JSON.stringify({ meta: { event_name: 'subscription_created' } });

    expect(isValidLemonSqueezySignature(body, 'too-short', secret)).toBe(false);
  });
});
