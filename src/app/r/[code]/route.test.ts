import { describe, expect, it } from 'vitest';
import { GET } from './route';

describe('GET /r/[code]', () => {
  it('redirects to sign-up and sets the referral_code cookie', async () => {
    const request = new Request('https://app.example.com/r/abc123');
    const response = await GET(request, { params: Promise.resolve({ code: 'abc123' }) });

    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toBe('https://app.example.com/sign-up');

    const setCookie = response.headers.get('set-cookie') ?? '';

    expect(setCookie).toContain('referral_code=abc123');
  });
});
