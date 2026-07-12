import { randomBytes } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { referralSchema } from '@/models/Schema';
import { grantReferralBonus } from './Credits';
import { db } from './DB';

const REFERRAL_BONUS_CREDITS = 5;

function generateCode(): string {
  return randomBytes(5).toString('hex');
}

export async function getOrCreateReferralCode(ownerId: string): Promise<string> {
  const [existing] = await db.select().from(referralSchema).where(eq(referralSchema.ownerId, ownerId)).limit(1);

  if (existing) {
    return existing.code;
  }

  const code = generateCode();
  await db.insert(referralSchema).values({ ownerId, code });

  return code;
}

export async function linkReferral(code: string, refereeOwnerId: string): Promise<void> {
  const [referral] = await db.select().from(referralSchema).where(eq(referralSchema.code, code)).limit(1);

  if (!referral || referral.ownerId === refereeOwnerId || referral.referredOwnerId) {
    return;
  }

  await db.update(referralSchema).set({ referredOwnerId: refereeOwnerId }).where(eq(referralSchema.id, referral.id));
}

export async function grantBonusIfEligible(refereeOwnerId: string): Promise<void> {
  const [referral] = await db
    .select()
    .from(referralSchema)
    .where(eq(referralSchema.referredOwnerId, refereeOwnerId))
    .limit(1);

  if (!referral || referral.bonusGranted) {
    return;
  }

  await db.update(referralSchema).set({ bonusGranted: true }).where(eq(referralSchema.id, referral.id));
  await grantReferralBonus(referral.ownerId, refereeOwnerId, REFERRAL_BONUS_CREDITS);
}
