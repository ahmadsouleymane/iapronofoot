import { beforeEach, describe, expect, it, vi } from 'vitest';

const authMock = vi.fn();

vi.mock('@clerk/nextjs/server', () => ({
  auth: authMock,
}));

const fetchFixturesMock = vi.fn();

vi.mock('@/libs/PredictionApi', async () => {
  const actual = await vi.importActual<typeof import('@/libs/PredictionApi')>('@/libs/PredictionApi');
  return { ...actual, fetchFixtures: fetchFixturesMock };
});

const { GET } = await import('./route');

describe('GET /api/predictions', () => {
  beforeEach(() => {
    authMock.mockReset();
    fetchFixturesMock.mockReset();
  });

  it('returns 401 when the user is not authenticated', async () => {
    authMock.mockResolvedValue({ userId: null });

    const request = new Request('https://app.example.com/api/predictions?league=premier-league&date=2026-08-01');
    const response = await GET(request);

    expect(response.status).toBe(401);
    expect(fetchFixturesMock).not.toHaveBeenCalled();
  });

  it('returns 400 when league or date is missing', async () => {
    authMock.mockResolvedValue({ userId: 'user_123' });

    const request = new Request('https://app.example.com/api/predictions?league=premier-league');
    const response = await GET(request);

    expect(response.status).toBe(400);
  });

  it('returns the fixtures for the given league and date', async () => {
    authMock.mockResolvedValue({ userId: 'user_123' });
    const fixtures = [{ id: '1', league: 'premier-league', homeTeam: 'A', awayTeam: 'B', kickoffAt: '2026-08-01T15:00:00Z' }];
    fetchFixturesMock.mockResolvedValue(fixtures);

    const request = new Request('https://app.example.com/api/predictions?league=premier-league&date=2026-08-01');
    const response = await GET(request);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({ fixtures });
    expect(fetchFixturesMock).toHaveBeenCalledWith('premier-league', '2026-08-01');
  });
});
