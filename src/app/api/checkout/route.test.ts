import { beforeEach, describe, expect, it, vi } from 'vitest';

const authMock = vi.fn();

vi.mock('@clerk/nextjs/server', () => ({
  auth: authMock,
}));

vi.mock('@/libs/Env', () => ({
  Env: {
    LEMONSQUEEZY_API_KEY: 'test_api_key',
    LEMONSQUEEZY_STORE_ID: 'store_1',
    NEXT_PUBLIC_APP_URL: 'https://app.example.com',
  },
}));

const createCheckoutMock = vi.fn();

vi.mock('@lemonsqueezy/lemonsqueezy.js', () => ({
  lemonSqueezySetup: vi.fn(),
  createCheckout: createCheckoutMock,
}));

const { GET } = await import('./route');

describe('GET /api/checkout', () => {
  beforeEach(() => {
    authMock.mockReset();
    createCheckoutMock.mockReset();
  });

  it('redirects to sign-in when the user is not authenticated', async () => {
    authMock.mockResolvedValue({ userId: null });

    const request = new Request('https://app.example.com/api/checkout?variantId=123');
    const response = await GET(request);

    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toContain('/sign-in');
    expect(createCheckoutMock).not.toHaveBeenCalled();
  });

  it('returns 400 when variantId is missing', async () => {
    authMock.mockResolvedValue({ userId: 'user_123' });

    const request = new Request('https://app.example.com/api/checkout');
    const response = await GET(request);

    expect(response.status).toBe(400);
    expect(createCheckoutMock).not.toHaveBeenCalled();
  });

  it('creates a checkout with the user id and a redirect_url, then redirects to it', async () => {
    authMock.mockResolvedValue({ userId: 'user_123' });
    createCheckoutMock.mockResolvedValue({
      data: { data: { attributes: { url: 'https://checkout.lemonsqueezy.com/abc' } } },
      error: null,
    });

    const request = new Request('https://app.example.com/api/checkout?variantId=123');
    const response = await GET(request);

    expect(createCheckoutMock).toHaveBeenCalledWith(
      'store_1',
      '123',
      expect.objectContaining({
        checkoutData: { custom: { user_id: 'user_123' } },
        productOptions: expect.objectContaining({
          redirectUrl: 'https://app.example.com/dashboard/billing',
        }),
      }),
    );
    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toBe('https://checkout.lemonsqueezy.com/abc');
  });

  it('returns 502 when Lemon Squeezy returns an error', async () => {
    authMock.mockResolvedValue({ userId: 'user_123' });
    createCheckoutMock.mockResolvedValue({ data: null, error: { message: 'boom' } });

    const request = new Request('https://app.example.com/api/checkout?variantId=123');
    const response = await GET(request);

    expect(response.status).toBe(502);
  });
});
