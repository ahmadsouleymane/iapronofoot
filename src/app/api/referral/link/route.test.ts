import { beforeEach, describe, expect, it, vi } from 'vitest';

const authMock = vi.fn();

vi.mock('@clerk/nextjs/server', () => ({
  auth: authMock,
}));

const linkReferralMock = vi.fn();

vi.mock('@/libs/Referral', () => ({
  linkReferral: linkReferralMock,
}));

const cookiesGetMock = vi.fn();
const cookiesDeleteMock = vi.fn();

vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: cookiesGetMock,
    delete: cookiesDeleteMock,
  }),
}));

const { POST } = await import('./route');

describe('POST /api/referral/link', () => {
  beforeEach(() => {
    authMock.mockReset();
    linkReferralMock.mockReset();
    cookiesGetMock.mockReset();
    cookiesDeleteMock.mockReset();
  });

  it('returns 401 when the user is not authenticated', async () => {
    authMock.mockResolvedValue({ userId: null });

    const response = await POST();

    expect(response.status).toBe(401);
    expect(linkReferralMock).not.toHaveBeenCalled();
  });

  it('does nothing when there is no referral cookie', async () => {
    authMock.mockResolvedValue({ userId: 'user_123' });
    cookiesGetMock.mockReturnValue(undefined);

    const response = await POST();
    const body = await response.json();

    expect(body).toEqual({ linked: false });
    expect(linkReferralMock).not.toHaveBeenCalled();
  });

  it('links the referral code and clears the cookie', async () => {
    authMock.mockResolvedValue({ userId: 'user_123' });
    cookiesGetMock.mockReturnValue({ value: 'abc123' });
    linkReferralMock.mockResolvedValue(undefined);

    const response = await POST();
    const body = await response.json();

    expect(body).toEqual({ linked: true });
    expect(linkReferralMock).toHaveBeenCalledWith('abc123', 'user_123');
    expect(cookiesDeleteMock).toHaveBeenCalledWith('referral_code');
  });
});
