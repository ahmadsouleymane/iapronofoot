import { NextResponse } from 'next/server';

export async function GET(request: Request, props: { params: Promise<{ code: string }> }) {
  const { code } = await props.params;
  const response = NextResponse.redirect(new URL('/sign-up', request.url));

  response.cookies.set('referral_code', code, {
    maxAge: 60 * 60 * 24 * 30,
    path: '/',
  });

  return response;
}
