import { eq } from 'drizzle-orm';
import { creditTransactionSchema, userCreditsSchema } from '@/models/Schema';
import { db } from './DB';

export class InsufficientCreditsError extends Error {}

export async function getBalance(ownerId: string): Promise<number> {
  const [row] = await db
    .select()
    .from(userCreditsSchema)
    .where(eq(userCreditsSchema.ownerId, ownerId))
    .limit(1);

  return row?.balance ?? 0;
}

export async function creditPurchase(ownerId: string, amount: number, lemonsqueezyOrderId: string): Promise<void> {
  await db.transaction(async (tx) => {
    const [existingOrder] = await tx
      .select()
      .from(creditTransactionSchema)
      .where(eq(creditTransactionSchema.lemonsqueezyOrderId, lemonsqueezyOrderId))
      .limit(1);

    if (existingOrder) {
      return;
    }

    const [existingBalance] = await tx
      .select()
      .from(userCreditsSchema)
      .where(eq(userCreditsSchema.ownerId, ownerId))
      .limit(1);

    const newBalance = (existingBalance?.balance ?? 0) + amount;

    await tx.insert(creditTransactionSchema).values({
      ownerId,
      type: 'purchase',
      amount,
      balanceAfter: newBalance,
      lemonsqueezyOrderId,
    });

    if (existingBalance) {
      await tx.update(userCreditsSchema).set({ balance: newBalance }).where(eq(userCreditsSchema.ownerId, ownerId));
    } else {
      await tx.insert(userCreditsSchema).values({ ownerId, balance: newBalance });
    }
  });
}

export async function spendCredit(ownerId: string, relatedReference: string): Promise<void> {
  await db.transaction(async (tx) => {
    const [existingBalance] = await tx
      .select()
      .from(userCreditsSchema)
      .where(eq(userCreditsSchema.ownerId, ownerId))
      .limit(1);

    const currentBalance = existingBalance?.balance ?? 0;

    if (currentBalance < 1) {
      throw new InsufficientCreditsError(`Owner ${ownerId} has insufficient credits`);
    }

    const newBalance = currentBalance - 1;

    await tx.insert(creditTransactionSchema).values({
      ownerId,
      type: 'spend',
      amount: -1,
      balanceAfter: newBalance,
      relatedReference,
    });

    await tx.update(userCreditsSchema).set({ balance: newBalance }).where(eq(userCreditsSchema.ownerId, ownerId));
  });
}

export async function refundCredit(ownerId: string, relatedReference: string): Promise<void> {
  await db.transaction(async (tx) => {
    const [existingBalance] = await tx
      .select()
      .from(userCreditsSchema)
      .where(eq(userCreditsSchema.ownerId, ownerId))
      .limit(1);

    const newBalance = (existingBalance?.balance ?? 0) + 1;

    await tx.insert(creditTransactionSchema).values({
      ownerId,
      type: 'refund',
      amount: 1,
      balanceAfter: newBalance,
      relatedReference,
    });

    if (existingBalance) {
      await tx.update(userCreditsSchema).set({ balance: newBalance }).where(eq(userCreditsSchema.ownerId, ownerId));
    } else {
      await tx.insert(userCreditsSchema).values({ ownerId, balance: newBalance });
    }
  });
}

export async function grantReferralBonus(referrerOwnerId: string, refereeOwnerId: string, bonusAmount: number): Promise<void> {
  for (const ownerId of [referrerOwnerId, refereeOwnerId]) {
    await db.transaction(async (tx) => {
      const [existingBalance] = await tx
        .select()
        .from(userCreditsSchema)
        .where(eq(userCreditsSchema.ownerId, ownerId))
        .limit(1);

      const newBalance = (existingBalance?.balance ?? 0) + bonusAmount;

      await tx.insert(creditTransactionSchema).values({
        ownerId,
        type: 'referral_bonus',
        amount: bonusAmount,
        balanceAfter: newBalance,
        relatedReference: ownerId === referrerOwnerId ? refereeOwnerId : referrerOwnerId,
      });

      if (existingBalance) {
        await tx.update(userCreditsSchema).set({ balance: newBalance }).where(eq(userCreditsSchema.ownerId, ownerId));
      } else {
        await tx.insert(userCreditsSchema).values({ ownerId, balance: newBalance });
      }
    });
  }
}
