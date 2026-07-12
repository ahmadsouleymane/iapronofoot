import { auth } from '@clerk/nextjs/server';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { linkReferral } from '@/libs/Referral';

export async function POST() {
  const { userId } = await auth();

  if (!userId) {
    return NextResponse.json({ linked: false }, { status: 401 });
  }

  const cookieStore = await cookies();
  const code = cookieStore.get('referral_code')?.value;

  if (!code) {
    return NextResponse.json({ linked: false });
  }

  await linkReferral(code, userId);
  cookieStore.delete('referral_code');

  return NextResponse.json({ linked: true });
}
