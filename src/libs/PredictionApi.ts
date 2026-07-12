import { Env } from './Env';

export type Fixture = {
  id: string;
  league: string;
  homeTeam: string;
  awayTeam: string;
  kickoffAt: string;
};

export type Prediction = {
  homeWinPct: number;
  drawPct: number;
  awayWinPct: number;
  predictedOutcome: 'home' | 'draw' | 'away';
  confidence: number;
};

export class PredictionApiError extends Error {}

function requireBaseUrl(): string {
  if (!Env.PREDICTION_API_URL) {
    throw new PredictionApiError('PREDICTION_API_URL is not configured');
  }

  return Env.PREDICTION_API_URL;
}

function authHeaders(): HeadersInit {
  return { Authorization: `Bearer ${Env.PREDICTION_API_KEY ?? ''}` };
}

export async function fetchFixtures(league: string, date: string): Promise<Fixture[]> {
  const url = new URL('/fixtures', requireBaseUrl());
  url.searchParams.set('league', league);
  url.searchParams.set('date', date);

  const response = await fetch(url, { headers: authHeaders() });

  if (!response.ok) {
    throw new PredictionApiError(`Fixtures request failed with status ${response.status}`);
  }

  return response.json() as Promise<Fixture[]>;
}

export async function fetchPrediction(matchId: string): Promise<Prediction> {
  const url = new URL(`/predict/${matchId}`, requireBaseUrl());

  const response = await fetch(url, { headers: authHeaders() });

  if (!response.ok) {
    throw new PredictionApiError(`Prediction request failed with status ${response.status}`);
  }

  return response.json() as Promise<Prediction>;
}
