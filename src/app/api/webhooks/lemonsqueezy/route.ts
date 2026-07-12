import { NextResponse } from 'next/server';
import { getCreditPackByVariantId } from '@/libs/CreditPacks';
import { creditPurchase } from '@/libs/Credits';
import { Env } from '@/libs/Env';
import { isValidLemonSqueezySignature } from '@/libs/LemonSqueezySignature';
import { logger } from '@/libs/Logger';
import { grantBonusIfEligible } from '@/libs/Referral';

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

  const payload = JSON.parse(rawBody) as { meta: { event_name: string } };
  const eventName = payload.meta.event_name;

  switch (eventName) {
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
