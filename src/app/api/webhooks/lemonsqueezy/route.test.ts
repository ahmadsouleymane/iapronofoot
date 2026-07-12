import crypto from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const secret = 'whsec_test_secret';

vi.mock('@/libs/Env', () => ({
  Env: { LEMONSQUEEZY_WEBHOOK_SECRET: secret },
}));

const insertValues = vi.fn().mockResolvedValue(undefined);
const updateWhere = vi.fn().mockResolvedValue(undefined);
const updateSet = vi.fn(() => ({ where: updateWhere }));

vi.mock('@/libs/DB', () => ({
  db: {
    insert: vi.fn(() => ({ values: insertValues })),
    update: vi.fn(() => ({ set: updateSet })),
  },
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
    insertValues.mockClear();
    updateSet.mockClear();
    updateWhere.mockClear();
  });

  it('rejects a request with an invalid signature', async () => {
    const request = makeRequest(
      { meta: { event_name: 'subscription_created' }, data: { id: '1', attributes: {} } },
      'not-the-right-signature',
    );
    const result = await POST(request);

    expect(result.status).toBe(401);
    expect(insertValues).not.toHaveBeenCalled();
  });

  it('inserts a subscription row on subscription_created', async () => {
    const request = makeRequest({
      meta: { event_name: 'subscription_created', custom_data: { user_id: 'user_123' } },
      data: {
        id: 'sub_1',
        attributes: {
          customer_id: 42,
          variant_id: 99,
          status: 'active',
          renews_at: '2026-08-01T00:00:00Z',
          ends_at: null,
          urls: { customer_portal: 'https://portal.example' },
        },
      },
    });

    const result = await POST(request);

    expect(result.status).toBe(200);
    expect(insertValues).toHaveBeenCalledWith(expect.objectContaining({
      ownerId: 'user_123',
      lemonsqueezySubscriptionId: 'sub_1',
      status: 'active',
    }));
  });

  it('rejects subscription_created without a user_id in custom_data', async () => {
    const request = makeRequest({
      meta: { event_name: 'subscription_created' },
      data: {
        id: 'sub_1',
        attributes: {
          customer_id: 42,
          variant_id: 99,
          status: 'active',
          renews_at: null,
          ends_at: null,
          urls: {},
        },
      },
    });

    const result = await POST(request);

    expect(result.status).toBe(400);
    expect(insertValues).not.toHaveBeenCalled();
  });

  it.each(['subscription_updated', 'subscription_payment_success', 'subscription_cancelled', 'subscription_expired'])(
    'updates the subscription row on %s',
    async (eventName) => {
      const request = makeRequest({
        meta: { event_name: eventName },
        data: {
          id: 'sub_1',
          attributes: {
            customer_id: 42,
            variant_id: 99,
            status: eventName === 'subscription_cancelled' ? 'cancelled' : 'active',
            renews_at: null,
            ends_at: null,
            urls: {},
          },
        },
      });

      const result = await POST(request);

      expect(result.status).toBe(200);
      expect(updateSet).toHaveBeenCalled();
      expect(updateWhere).toHaveBeenCalled();
    },
  );

  it('acknowledges order_created without touching the database', async () => {
    const request = makeRequest({
      meta: { event_name: 'order_created' },
      data: { id: 'order_1', attributes: {} },
    });

    const result = await POST(request);

    expect(result.status).toBe(200);
    expect(insertValues).not.toHaveBeenCalled();
    expect(updateSet).not.toHaveBeenCalled();
  });
});
