import { eq } from 'drizzle-orm';
import { creditPackSchema } from '@/models/Schema';
import { db } from './DB';

export async function getActiveCreditPacks() {
  return db.select().from(creditPackSchema).where(eq(creditPackSchema.active, true));
}

export async function getCreditPackByVariantId(variantId: string) {
  const [pack] = await db
    .select()
    .from(creditPackSchema)
    .where(eq(creditPackSchema.lemonSqueezyVariantId, variantId))
    .limit(1);

  return pack ?? null;
}
