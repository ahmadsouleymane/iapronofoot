import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/libs/Env', () => ({
  Env: { PREDICTION_API_URL: 'https://prediction.example.com', PREDICTION_API_KEY: 'test_key' },
}));

const { fetchFixtures, fetchPrediction, PredictionApiError } = await import('./PredictionApi');

describe('PredictionApi', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('fetches fixtures for a league and date', async () => {
    const fixtures = [{ id: '1', league: 'premier-league', homeTeam: 'A', awayTeam: 'B', kickoffAt: '2026-08-01T15:00:00Z' }];
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify(fixtures), { status: 200 }));

    const result = await fetchFixtures('premier-league', '2026-08-01');

    expect(result).toEqual(fixtures);

    const calledUrl = vi.mocked(fetch).mock.calls[0]?.[0] as URL;

    expect(calledUrl.toString()).toBe('https://prediction.example.com/fixtures?league=premier-league&date=2026-08-01');
  });

  it('throws PredictionApiError when the fixtures request fails', async () => {
    vi.mocked(fetch).mockResolvedValue(new Response('error', { status: 500 }));

    await expect(fetchFixtures('premier-league', '2026-08-01')).rejects.toThrow(PredictionApiError);
  });

  it('fetches a prediction for a match id', async () => {
    const prediction = { homeWinPct: 55, drawPct: 25, awayWinPct: 20, predictedOutcome: 'home', confidence: 0.78 };
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify(prediction), { status: 200 }));

    const result = await fetchPrediction('match_1');

    expect(result).toEqual(prediction);
  });

  it('throws PredictionApiError when the prediction request fails', async () => {
    vi.mocked(fetch).mockResolvedValue(new Response('error', { status: 502 }));

    await expect(fetchPrediction('match_1')).rejects.toThrow(PredictionApiError);
  });
});
