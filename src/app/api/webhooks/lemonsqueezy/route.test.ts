import crypto from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const secret = 'whsec_test_secret';

vi.mock('@/libs/Env', () => ({
  Env: { LEMONSQUEEZY_WEBHOOK_SECRET: secret },
}));

const getCreditPackByVariantIdMock = vi.fn();

vi.mock('@/libs/CreditPacks', () => ({
  getCreditPackByVariantId: getCreditPackByVariantIdMock,
}));

const creditPurchaseMock = vi.fn().mockResolvedValue(undefined);

vi.mock('@/libs/Credits', () => ({
  creditPurchase: creditPurchaseMock,
}));

const grantBonusIfEligibleMock = vi.fn().mockResolvedValue(undefined);

vi.mock('@/libs/Referral', () => ({
  grantBonusIfEligible: grantBonusIfEligibleMock,
}));

const loggerErrorMock = vi.fn();

vi.mock('@/libs/Logger', () => ({
  logger: { error: loggerErrorMock },
}));

const { POST } = await import('./route');

function sign(body: string): string {
  return crypto.createHmac('sha256', secret).update(body).digest('hex');
}

function makeRequest(payload: object, signature?: string): Request {
  const body = JSON.stringify(payload);

  return new Request('http://localhost/api/webhooks/lemonsqueezy', {
    method: 'POST',
    body,
    headers: { 'X-Signature': signature ?? sign(body) },
  });
}

describe('POST /api/webhooks/lemonsqueezy', () => {
  beforeEach(() => {
    getCreditPackByVariantIdMock.mockReset();
    creditPurchaseMock.mockClear();
    grantBonusIfEligibleMock.mockClear();
    loggerErrorMock.mockClear();
  });

  it('rejects a request with an invalid signature', async () => {
    const request = makeRequest(
      { meta: { event_name: 'order_created' }, data: { id: '1', attributes: {} } },
      'not-the-right-signature',
    );
    const result = await POST(request);

    expect(result.status).toBe(401);
    expect(creditPurchaseMock).not.toHaveBeenCalled();
  });

  it('credits the buyer balance when the order matches a known credit pack', async () => {
    getCreditPackByVariantIdMock.mockResolvedValue({ id: 1, creditsAmount: 18, lemonSqueezyVariantId: '999' });

    const request = makeRequest({
      meta: { event_name: 'order_created', custom_data: { user_id: 'user_123' } },
      data: { id: 'order_1', attributes: { first_order_item: { variant_id: 999 } } },
    });

    const result = await POST(request);

    expect(result.status).toBe(200);
    expect(getCreditPackByVariantIdMock).toHaveBeenCalledWith('999');
    expect(creditPurchaseMock).toHaveBeenCalledWith('user_123', 18, 'order_1');
    expect(grantBonusIfEligibleMock).toHaveBeenCalledWith('user_123');
  });

  it('rejects an order for an unknown variant id without crediting anything', async () => {
    getCreditPackByVariantIdMock.mockResolvedValue(null);

    const request = makeRequest({
      meta: { event_name: 'order_created', custom_data: { user_id: 'user_123' } },
      data: { id: 'order_1', attributes: { first_order_item: { variant_id: 999 } } },
    });

    const result = await POST(request);

    expect(result.status).toBe(400);
    expect(creditPurchaseMock).not.toHaveBeenCalled();
    expect(loggerErrorMock).toHaveBeenCalled();
  });

  it('rejects order_created without a user_id in custom_data', async () => {
    const request = makeRequest({
      meta: { event_name: 'order_created' },
      data: { id: 'order_1', attributes: { first_order_item: { variant_id: 999 } } },
    });

    const result = await POST(request);

    expect(result.status).toBe(400);
    expect(creditPurchaseMock).not.toHaveBeenCalled();
  });
});
