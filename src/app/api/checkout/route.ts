import { auth } from '@clerk/nextjs/server';
import { createCheckout } from '@lemonsqueezy/lemonsqueezy.js';
import { NextResponse } from 'next/server';
import { Env } from '@/libs/Env';
import '@/libs/LemonSqueezy';

export async function GET(request: Request) {
  if (!Env.LEMONSQUEEZY_STORE_ID) {
    return NextResponse.json({ error: 'Lemon Squeezy is not configured' }, { status: 503 });
  }

  const { userId } = await auth();

  if (!userId) {
    return NextResponse.redirect(new URL('/sign-in', request.url));
  }

  const variantId = new URL(request.url).searchParams.get('variantId');

  if (!variantId) {
    return NextResponse.json({ error: 'Missing variantId' }, { status: 400 });
  }

  const { data, error } = await createCheckout(
    Env.LEMONSQUEEZY_STORE_ID,
    variantId,
    {
      checkoutData: {
        custom: {
          user_id: userId,
        },
      },
      productOptions: {
        redirectUrl: new URL('/dashboard/billing', Env.NEXT_PUBLIC_APP_URL ?? request.url).toString(),
      },
    },
  );

  if (error || !data) {
    return NextResponse.json(
      { error: error?.message ?? 'Unable to create checkout' },
      { status: 502 },
    );
  }

  return NextResponse.redirect(data.data.attributes.url);
}
