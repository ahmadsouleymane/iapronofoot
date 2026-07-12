import { auth } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';
import { fetchFixtures, PredictionApiError } from '@/libs/PredictionApi';

export async function GET(request: Request) {
  const { userId } = await auth();

  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const url = new URL(request.url);
  const league = url.searchParams.get('league');
  const date = url.searchParams.get('date');

  if (!league || !date) {
    return NextResponse.json({ error: 'Missing league or date' }, { status: 400 });
  }

  try {
    const fixtures = await fetchFixtures(league, date);
    return NextResponse.json({ fixtures });
  } catch (error) {
    if (error instanceof PredictionApiError) {
      return NextResponse.json({ error: error.message }, { status: 502 });
    }

    throw error;
  }
}
