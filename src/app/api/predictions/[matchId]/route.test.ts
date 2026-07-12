import { beforeEach, describe, expect, it, vi } from 'vitest';

const authMock = vi.fn();

vi.mock('@clerk/nextjs/server', () => ({
  auth: authMock,
}));

const spendCreditMock = vi.fn();
const refundCreditMock = vi.fn();
const getBalanceMock = vi.fn();

vi.mock('@/libs/Credits', async () => {
  const actual = await vi.importActual<typeof import('@/libs/Credits')>('@/libs/Credits');
  return { ...actual, spendCredit: spendCreditMock, refundCredit: refundCreditMock, getBalance: getBalanceMock };
});

const fetchPredictionMock = vi.fn();

vi.mock('@/libs/PredictionApi', async () => {
  const actual = await vi.importActual<typeof import('@/libs/PredictionApi')>('@/libs/PredictionApi');
  return { ...actual, fetchPrediction: fetchPredictionMock };
});

const { InsufficientCreditsError } = await import('@/libs/Credits');
const { PredictionApiError } = await import('@/libs/PredictionApi');
const { POST } = await import('./route');

function makeRequest() {
  return new Request('https://app.example.com/api/predictions/match_1', { method: 'POST' });
}

describe('POST /api/predictions/[matchId]', () => {
  beforeEach(() => {
    authMock.mockReset();
    spendCreditMock.mockReset();
    refundCreditMock.mockReset();
    getBalanceMock.mockReset();
    fetchPredictionMock.mockReset();
  });

  it('returns 401 when the user is not authenticated', async () => {
    authMock.mockResolvedValue({ userId: null });

    const response = await POST(makeRequest(), { params: Promise.resolve({ matchId: 'match_1' }) });

    expect(response.status).toBe(401);
    expect(spendCreditMock).not.toHaveBeenCalled();
  });

  it('returns 402 when the user has insufficient credits', async () => {
    authMock.mockResolvedValue({ userId: 'user_123' });
    spendCreditMock.mockRejectedValue(new InsufficientCreditsError('no credits'));

    const response = await POST(makeRequest(), { params: Promise.resolve({ matchId: 'match_1' }) });

    expect(response.status).toBe(402);
    expect(fetchPredictionMock).not.toHaveBeenCalled();
  });

  it('returns the prediction and remaining balance on success', async () => {
    authMock.mockResolvedValue({ userId: 'user_123' });
    spendCreditMock.mockResolvedValue(undefined);
    const prediction = { homeWinPct: 55, drawPct: 25, awayWinPct: 20, predictedOutcome: 'home', confidence: 0.78 };
    fetchPredictionMock.mockResolvedValue(prediction);
    getBalanceMock.mockResolvedValue(17);

    const response = await POST(makeRequest(), { params: Promise.resolve({ matchId: 'match_1' }) });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({ prediction, balance: 17 });
    expect(spendCreditMock).toHaveBeenCalledWith('user_123', 'match_1');
    expect(refundCreditMock).not.toHaveBeenCalled();
  });

  it('refunds the credit when the external prediction call fails', async () => {
    authMock.mockResolvedValue({ userId: 'user_123' });
    spendCreditMock.mockResolvedValue(undefined);
    fetchPredictionMock.mockRejectedValue(new PredictionApiError('boom'));
    refundCreditMock.mockResolvedValue(undefined);

    const response = await POST(makeRequest(), { params: Promise.resolve({ matchId: 'match_1' }) });

    expect(response.status).toBe(502);
    expect(refundCreditMock).toHaveBeenCalledWith('user_123', 'match_1');
  });
});
