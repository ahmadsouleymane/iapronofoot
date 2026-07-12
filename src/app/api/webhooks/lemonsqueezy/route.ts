import { eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { getCreditPackByVariantId } from '@/libs/CreditPacks';
import { creditPurchase } from '@/libs/Credits';
import { db } from '@/libs/DB';
import { Env } from '@/libs/Env';
import { isValidLemonSqueezySignature } from '@/libs/LemonSqueezySignature';
import { logger } from '@/libs/Logger';
import { grantBonusIfEligible } from '@/libs/Referral';
import { subscriptionSchema } from '@/models/Schema';

type LemonSqueezySubscriptionPayload = {
  meta: {
    event_name: string;
    custom_data?: { user_id?: string };
  };
  data: {
    id: string;
    attributes: {
      customer_id: number;
      variant_id: number;
      status: string;
      renews_at: string | null;
      ends_at: string | null;
      urls: { customer_portal?: string };
    };
  };
};

type LemonSqueezyOrderPayload = {
  meta: {
    event_name: string;
    custom_data?: { user_id?: string };
  };
  data: {
    id: string;
    attributes: {
      first_order_item: { variant_id: number };
    };
  };
};

export async function POST(request: Request) {
  if (!Env.LEMONSQUEEZY_WEBHOOK_SECRET) {
    return NextResponse.json({ error: 'Lemon Squeezy is not configured' }, { status: 503 });
  }

  const rawBody = await request.text();
  const signature = request.headers.get('X-Signature');

  if (!isValidLemonSqueezySignature(rawBody, signature, Env.LEMONSQUEEZY_WEBHOOK_SECRET)) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
  }

  const payload = JSON.parse(rawBody) as LemonSqueezySubscriptionPayload;
  const eventName = payload.meta.event_name;
  const subscriptionId = payload.data.id;
  const { attributes } = payload.data;

  switch (eventName) {
    case 'subscription_created': {
      const ownerId = payload.meta.custom_data?.user_id;

      if (!ownerId) {
        return NextResponse.json({ error: 'Missing user_id in custom_data' }, { status: 400 });
      }

      await db.insert(subscriptionSchema).values({
        ownerId,
        lemonsqueezyCustomerId: String(attributes.customer_id),
        lemonsqueezySubscriptionId: subscriptionId,
        lemonsqueezyVariantId: String(attributes.variant_id),
        status: attributes.status,
        renewsAt: attributes.renews_at ? new Date(attributes.renews_at) : null,
        endsAt: attributes.ends_at ? new Date(attributes.ends_at) : null,
        customerPortalUrl: attributes.urls.customer_portal ?? null,
      });
      break;
    }

    case 'subscription_updated':
    case 'subscription_payment_success':
    case 'subscription_cancelled':
    case 'subscription_expired': {
      await db
        .update(subscriptionSchema)
        .set({
          status: attributes.status,
          renewsAt: attributes.renews_at ? new Date(attributes.renews_at) : null,
          endsAt: attributes.ends_at ? new Date(attributes.ends_at) : null,
          customerPortalUrl: attributes.urls.customer_portal ?? null,
        })
        .where(eq(subscriptionSchema.lemonsqueezySubscriptionId, subscriptionId));
      break;
    }

    case 'order_created': {
      const orderPayload = JSON.parse(rawBody) as LemonSqueezyOrderPayload;
      const ownerId = orderPayload.meta.custom_data?.user_id;
      const orderId = orderPayload.data.id;
      const variantId = String(orderPayload.data.attributes.first_order_item.variant_id);

      if (!ownerId) {
        return NextResponse.json({ error: 'Missing user_id in custom_data' }, { status: 400 });
      }

      const pack = await getCreditPackByVariantId(variantId);

      if (!pack) {
        logger.error(`Lemon Squeezy order ${orderId} references unknown variant ${variantId}`);
        return NextResponse.json({ error: 'Unknown credit pack' }, { status: 400 });
      }

      await creditPurchase(ownerId, pack.creditsAmount, orderId);
      await grantBonusIfEligible(ownerId);
      break;
    }

    default:
      break;
  }

  return NextResponse.json({ received: true });
}
