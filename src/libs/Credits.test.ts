import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { db } from '@/libs/DB';
import { creditTransactionSchema, userCreditsSchema } from '@/models/Schema';
import {
  creditPurchase,
  getBalance,
  grantReferralBonus,
  InsufficientCreditsError,
  refundCredit,
  spendCredit,
} from './Credits';

const OWNER_A = 'user_test_credits_a';
const OWNER_B = 'user_test_credits_b';

async function cleanup(ownerId: string) {
  await db.delete(creditTransactionSchema).where(eq(creditTransactionSchema.ownerId, ownerId));
  await db.delete(userCreditsSchema).where(eq(userCreditsSchema.ownerId, ownerId));
}

describe('Credits ledger', () => {
  beforeEach(async () => {
    await cleanup(OWNER_A);
    await cleanup(OWNER_B);
  });

  afterEach(async () => {
    await cleanup(OWNER_A);
    await cleanup(OWNER_B);
  });

  it('starts at a balance of 0 for a new owner', async () => {
    expect(await getBalance(OWNER_A)).toBe(0);
  });

  it('credits the balance on purchase', async () => {
    await creditPurchase(OWNER_A, 18, 'order_1');

    expect(await getBalance(OWNER_A)).toBe(18);
  });

  it('is idempotent for the same Lemon Squeezy order id', async () => {
    await creditPurchase(OWNER_A, 18, 'order_1');
    await creditPurchase(OWNER_A, 18, 'order_1');

    expect(await getBalance(OWNER_A)).toBe(18);
  });

  it('debits one credit on spend', async () => {
    await creditPurchase(OWNER_A, 5, 'order_2');
    await spendCredit(OWNER_A, 'match_1');

    expect(await getBalance(OWNER_A)).toBe(4);
  });

  it('throws InsufficientCreditsError when balance is 0', async () => {
    await expect(spendCredit(OWNER_A, 'match_1')).rejects.toThrow(InsufficientCreditsError);
  });

  it('refunds one credit', async () => {
    await creditPurchase(OWNER_A, 5, 'order_3');
    await spendCredit(OWNER_A, 'match_1');
    await refundCredit(OWNER_A, 'match_1');

    expect(await getBalance(OWNER_A)).toBe(5);
  });

  it('grants a referral bonus to both the referrer and the referee', async () => {
    await grantReferralBonus(OWNER_A, OWNER_B, 5);

    expect(await getBalance(OWNER_A)).toBe(5);
    expect(await getBalance(OWNER_B)).toBe(5);
  });
});
