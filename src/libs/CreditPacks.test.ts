import { beforeEach, describe, expect, it, vi } from 'vitest';

const whereMock = vi.fn();
const limitMock = vi.fn();
const fromMock = vi.fn(() => ({ where: whereMock }));
const selectMock = vi.fn(() => ({ from: fromMock }));

vi.mock('@/libs/DB', () => ({
  db: { select: selectMock },
}));

const { getActiveCreditPacks, getCreditPackByVariantId } = await import('./CreditPacks');

describe('CreditPacks', () => {
  beforeEach(() => {
    selectMock.mockClear();
    fromMock.mockClear();
    whereMock.mockReset();
    limitMock.mockReset();
  });

  it('returns the active credit packs', async () => {
    const packs = [{ id: 1, name: 'Découverte', active: true }];
    whereMock.mockResolvedValue(packs);

    const result = await getActiveCreditPacks();

    expect(result).toBe(packs);
  });

  it('returns the pack matching a variant id', async () => {
    whereMock.mockReturnValue({ limit: limitMock });
    limitMock.mockResolvedValue([{ id: 1, lemonSqueezyVariantId: '999' }]);

    const result = await getCreditPackByVariantId('999');

    expect(result).toEqual({ id: 1, lemonSqueezyVariantId: '999' });
  });

  it('returns null when no pack matches the variant id', async () => {
    whereMock.mockReturnValue({ limit: limitMock });
    limitMock.mockResolvedValue([]);

    const result = await getCreditPackByVariantId('unknown');

    expect(result).toBeNull();
  });
});
