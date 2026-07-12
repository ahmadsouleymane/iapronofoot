import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { db } from '@/libs/DB';
import { creditTransactionSchema, referralSchema, userCreditsSchema } from '@/models/Schema';
import { getOrCreateReferralCode, grantBonusIfEligible, linkReferral } from './Referral';

const REFERRER = 'user_test_referral_referrer';
const REFEREE = 'user_test_referral_referee';

async function cleanup() {
  await db.delete(creditTransactionSchema).where(eq(creditTransactionSchema.ownerId, REFERRER));
  await db.delete(creditTransactionSchema).where(eq(creditTransactionSchema.ownerId, REFEREE));
  await db.delete(userCreditsSchema).where(eq(userCreditsSchema.ownerId, REFERRER));
  await db.delete(userCreditsSchema).where(eq(userCreditsSchema.ownerId, REFEREE));
  await db.delete(referralSchema).where(eq(referralSchema.ownerId, REFERRER));
}

describe('Referral', () => {
  beforeEach(cleanup);

  afterEach(cleanup);

  it('creates a referral code once and returns the same one afterwards', async () => {
    const code1 = await getOrCreateReferralCode(REFERRER);
    const code2 = await getOrCreateReferralCode(REFERRER);

    expect(code1).toBe(code2);
    expect(code1).toHaveLength(10);
  });

  it('links a referee to the referrer by code', async () => {
    const code = await getOrCreateReferralCode(REFERRER);
    await linkReferral(code, REFEREE);

    const [referral] = await db.select().from(referralSchema).where(eq(referralSchema.ownerId, REFERRER)).limit(1);

    expect(referral?.referredOwnerId).toBe(REFEREE);
  });

  it('does not link a user to their own referral code', async () => {
    const code = await getOrCreateReferralCode(REFERRER);
    await linkReferral(code, REFERRER);

    const [referral] = await db.select().from(referralSchema).where(eq(referralSchema.ownerId, REFERRER)).limit(1);

    expect(referral?.referredOwnerId).toBeNull();
  });

  it('grants the bonus once to both sides on the referee first purchase, and is a no-op afterwards', async () => {
    const code = await getOrCreateReferralCode(REFERRER);
    await linkReferral(code, REFEREE);

    await grantBonusIfEligible(REFEREE);
    await grantBonusIfEligible(REFEREE);

    const [referrerCredits] = await db.select().from(userCreditsSchema).where(eq(userCreditsSchema.ownerId, REFERRER)).limit(1);
    const [refereeCredits] = await db.select().from(userCreditsSchema).where(eq(userCreditsSchema.ownerId, REFEREE)).limit(1);

    expect(referrerCredits?.balance).toBe(5);
    expect(refereeCredits?.balance).toBe(5);
  });

  it('does nothing when the referee has no linked referrer', async () => {
    await grantBonusIfEligible('user_with_no_referrer');

    const [credits] = await db.select().from(userCreditsSchema).where(eq(userCreditsSchema.ownerId, 'user_with_no_referrer')).limit(1);

    expect(credits).toBeUndefined();
  });
});
