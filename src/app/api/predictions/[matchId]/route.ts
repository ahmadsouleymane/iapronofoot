import { auth } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';
import { getBalance, InsufficientCreditsError, refundCredit, spendCredit } from '@/libs/Credits';
import { fetchPrediction, PredictionApiError } from '@/libs/PredictionApi';

export async function POST(_request: Request, props: { params: Promise<{ matchId: string }> }) {
  const { userId } = await auth();

  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { matchId } = await props.params;

  try {
    await spendCredit(userId, matchId);
  } catch (error) {
    if (error instanceof InsufficientCreditsError) {
      return NextResponse.json({ error: 'insufficient_credits' }, { status: 402 });
    }

    throw error;
  }

  try {
    const prediction = await fetchPrediction(matchId);
    const balance = await getBalance(userId);
    return NextResponse.json({ prediction, balance });
  } catch (error) {
    await refundCredit(userId, matchId);

    if (error instanceof PredictionApiError) {
      return NextResponse.json({ error: error.message }, { status: 502 });
    }

    throw error;
  }
}
