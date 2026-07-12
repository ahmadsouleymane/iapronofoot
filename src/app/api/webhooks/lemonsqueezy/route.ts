import { eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { db } from '@/libs/DB';
import { Env } from '@/libs/Env';
import { isValidLemonSqueezySignature } from '@/libs/LemonSqueezySignature';
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
      // L'order précède la création de l'abonnement : géré par `subscription_created`, rien à faire ici.
      break;
    }

    default:
      break;
  }

  return NextResponse.json({ received: true });
}
