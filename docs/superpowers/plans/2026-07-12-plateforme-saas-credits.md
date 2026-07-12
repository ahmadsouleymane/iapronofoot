# Plateforme SaaS — Système de crédits, paiement, pronostics et parrainage — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remplacer le modèle d'abonnement par équipe du template par un système de crédits à usage unique (achat via Lemon Squeezy, dépense sur les pronostics 1-clic, bonus de parrainage bilatéral), et exposer les pronostics via une API de prédiction externe traitée comme une dépendance.

**Architecture:** Portefeuille de crédits basé sur un grand livre (ledger) auditable (`credit_transaction`) avec un solde mis en cache par utilisateur (`user_credits`), alimenté par le webhook Lemon Squeezy (achats uniques de packs) et consommé par une route API proxy vers l'API de prédiction externe (fixtures + pronostic). Le parrainage est un module séparé qui déclenche un bonus bilatéral via le ledger au premier achat réussi du filleul.

**Tech Stack:** Next.js 16 (App Router), Drizzle ORM (`drizzle-orm/node-postgres`), PostgreSQL, Clerk (auth, inchangé), Lemon Squeezy (paiement, achats uniques), Vitest, Playwright.

## Global Constraints

- Authentification : Clerk conservé tel quel (email/mot de passe + Google) — ne pas modifier `src/libs/LemonSqueezy.ts`, la config Clerk, ni le flux `/api/checkout`.
- Paiement : Lemon Squeezy en achat unique (pas d'abonnement) pour les packs de crédits.
- 1 crédit = 1 pronostic consulté.
- Packs de crédits configurables en base (table `credit_pack`), pas de montants codés en dur dans le code applicatif.
- Parrainage : bonus de crédits aux deux côtés (parrain + filleul), déclenché au **premier achat réussi** du filleul (pas à l'inscription).
- Pronostic affiché : résultat 1X2 + score de confiance uniquement (pas de BTTS/Over-Under, pas d'explication LLM).
- Une seule API de prédiction externe fait à la fois la liste des matchs à venir (fixtures) et le pronostic à la demande — contrat : `GET /fixtures?league=<id>&date=<yyyy-mm-dd>` et `GET /predict/<matchId>` → `{ homeWinPct, drawPct, awayWinPct, predictedOutcome, confidence }`.
- Devise : FCFA (XOF) uniquement, pas de gestion multi-devise.
- Spec de référence : `docs/superpowers/specs/2026-07-12-plateforme-saas-design.md`.

---

### Task 1: Modèle de données crédits (schéma, migration, seed)

**Files:**
- Modify: `src/models/Schema.ts`
- Modify: `eslint.config.mjs` (ignorer `scripts/**/*`)
- Create: `scripts/seed-credit-packs.mjs`
- Modify: `package.json` (ajouter le script npm `db:seed`)

**Interfaces:**
- Produces: `creditPackSchema`, `userCreditsSchema`, `creditTransactionSchema`, `referralSchema` (tables Drizzle exportées depuis `@/models/Schema`), consommées par toutes les tâches suivantes.

Ce projet n'a pas de table `user` locale (Clerk est la seule source de vérité pour les utilisateurs, identifiés par leur `ownerId` — l'id Clerk). Le solde de crédits en cache vit donc dans sa propre table `user_credits` indexée par `ownerId`, pas comme colonne sur une table utilisateur.

- [ ] **Step 1: Ajouter les quatre nouvelles tables dans le schéma**

Ajouter à la fin de `src/models/Schema.ts` (ne pas toucher `todoSchema` ni `subscriptionSchema` pour l'instant — ils seront retirés dans la tâche de nettoyage finale) :

```ts
import { boolean, integer, pgTable, serial, text, timestamp } from 'drizzle-orm/pg-core';

// ... (imports et todoSchema/subscriptionSchema existants inchangés)

export const creditPackSchema = pgTable('credit_pack', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  priceFcfa: integer('price_fcfa').notNull(),
  creditsAmount: integer('credits_amount').notNull(),
  lemonSqueezyVariantId: text('lemonsqueezy_variant_id').notNull(),
  active: boolean('active').notNull().default(true),
  createdAt: timestamp('created_at', { mode: 'date' }).defaultNow().notNull(),
});

export const userCreditsSchema = pgTable('user_credits', {
  ownerId: text('owner_id').primaryKey(),
  balance: integer('balance').notNull().default(0),
  updatedAt: timestamp('updated_at', { mode: 'date' })
    .defaultNow()
    .$onUpdate(() => new Date())
    .notNull(),
});

export const creditTransactionSchema = pgTable('credit_transaction', {
  id: serial('id').primaryKey(),
  ownerId: text('owner_id').notNull(),
  type: text('type').notNull(), // 'purchase' | 'spend' | 'refund' | 'referral_bonus'
  amount: integer('amount').notNull(), // signé : positif = crédit, négatif = débit
  balanceAfter: integer('balance_after').notNull(),
  relatedReference: text('related_reference'), // id de pronostic, ou owner_id de l'autre partie pour un bonus parrainage
  lemonsqueezyOrderId: text('lemonsqueezy_order_id').unique(), // dédoublonnage des webhooks d'achat
  createdAt: timestamp('created_at', { mode: 'date' }).defaultNow().notNull(),
});

export const referralSchema = pgTable('referral', {
  id: serial('id').primaryKey(),
  ownerId: text('owner_id').notNull(), // le parrain
  code: text('code').notNull().unique(),
  referredOwnerId: text('referred_owner_id'), // le filleul, une fois lié
  bonusGranted: boolean('bonus_granted').notNull().default(false),
  createdAt: timestamp('created_at', { mode: 'date' }).defaultNow().notNull(),
});
```

- [ ] **Step 2: Générer et appliquer la migration**

Run: `npm run db:generate`
Expected: un nouveau fichier `migrations/000X_<nom>.sql` est créé, contenant les `CREATE TABLE` pour `credit_pack`, `user_credits`, `credit_transaction`, `referral`.

Run: `npm run db:migrate`
Expected: `[✓] migrations applied successfully!`

- [ ] **Step 3: Vérifier les tables en base**

Run: `docker exec backend-postgres-1 psql -U postgres -d iapronofoot -tAc "\dt"`
Expected: la liste inclut désormais `credit_pack`, `user_credits`, `credit_transaction`, `referral` en plus de `subscription` et `todo`.

- [ ] **Step 4: Exclure `scripts/**` du lint**

Dans `eslint.config.mjs`, ajouter `'scripts/**/*'` à côté de `'migrations/**/*'` dans le tableau `ignores` :

```ts
    ignores: [
      '.alchemy/**/*',
      'migrations/**/*',
      'scripts/**/*',

      // explicitly allow .claude
      '!.claude/',
    ],
```

- [ ] **Step 5: Écrire le script de seed des packs de crédits**

Create `scripts/seed-credit-packs.mjs` :

```js
import { Pool } from 'pg';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const packs = [
  { name: 'Découverte', priceFcfa: 500, creditsAmount: 5 },
  { name: 'Standard', priceFcfa: 1500, creditsAmount: 18 },
  { name: 'Avantage', priceFcfa: 3000, creditsAmount: 40 },
  { name: 'Pro', priceFcfa: 5000, creditsAmount: 75 },
];

async function main() {
  for (const pack of packs) {
    const { rows } = await pool.query('SELECT id FROM credit_pack WHERE name = $1', [pack.name]);

    if (rows.length > 0) {
      continue;
    }

    await pool.query(
      `INSERT INTO credit_pack (name, price_fcfa, credits_amount, lemonsqueezy_variant_id, active)
       VALUES ($1, $2, $3, '', true)`,
      [pack.name, pack.priceFcfa, pack.creditsAmount],
    );
  }

  await pool.end();
}

main().catch((error) => {
  process.exitCode = 1;
  throw error;
});
```

Note : `lemonsqueezy_variant_id` est laissé vide (`''`) — à renseigner manuellement une fois les produits/variants créés dans le dashboard Lemon Squeezy (packs désactivés côté achat tant que le variant est vide, cf. Task 8).

- [ ] **Step 6: Ajouter le script npm et l'exécuter**

Dans `package.json`, ajouter à côté de `"db:migrate"` :

```json
    "db:seed": "dotenv -c -- node scripts/seed-credit-packs.mjs",
```

Run: `npm run db:seed`
Expected: aucune erreur, code de sortie 0.

Run: `docker exec backend-postgres-1 psql -U postgres -d iapronofoot -tAc "SELECT name, price_fcfa, credits_amount FROM credit_pack ORDER BY price_fcfa;"`
Expected :
```
Découverte|500|5
Standard|1500|18
Avantage|3000|40
Pro|5000|75
```

- [ ] **Step 7: Commit**

```bash
git add src/models/Schema.ts migrations eslint.config.mjs scripts/seed-credit-packs.mjs package.json
git commit -m "feat: add credit system database schema"
```

---

### Task 2: Module ledger de crédits (`src/libs/Credits.ts`)

**Files:**
- Create: `src/libs/Credits.ts`
- Test: `src/libs/Credits.test.ts`

**Interfaces:**
- Consumes: `db` (`@/libs/DB`), `userCreditsSchema`, `creditTransactionSchema` (`@/models/Schema`)
- Produces: `getBalance(ownerId: string): Promise<number>`, `creditPurchase(ownerId: string, amount: number, lemonsqueezyOrderId: string): Promise<void>`, `spendCredit(ownerId: string, relatedReference: string): Promise<void>`, `refundCredit(ownerId: string, relatedReference: string): Promise<void>`, `grantReferralBonus(referrerOwnerId: string, refereeOwnerId: string, bonusAmount: number): Promise<void>`, `InsufficientCreditsError` (classe d'erreur) — utilisés par les tâches 3, 4, 6.

**Important sur la stratégie de test :** contrairement au test du webhook existant (`route.test.ts`) qui mocke intégralement `@/libs/DB`, ce module utilise des transactions Drizzle (`db.transaction`). Mocker fidèlement une transaction avec des `select`/`insert`/`update` chaînés serait plus fragile que de vérifier le vrai comportement transactionnel (atomicité, idempotence). Ces tests utilisent donc la vraie connexion Postgres (déjà disponible via le conteneur Docker `backend-postgres-1`, base `iapronofoot`, cf. `DATABASE_URL` dans `.env.local`) et nettoient leurs propres lignes avant/après chaque test.

- [ ] **Step 1: Écrire les tests (ils vont échouer, le module n'existe pas encore)**

Create `src/libs/Credits.test.ts` :

```ts
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
```

- [ ] **Step 2: Vérifier que les tests échouent**

Run: `npx vitest run src/libs/Credits.test.ts`
Expected: FAIL — `Cannot find module './Credits'`.

- [ ] **Step 3: Implémenter `src/libs/Credits.ts`**

```ts
import { eq } from 'drizzle-orm';
import { db } from './DB';
import { creditTransactionSchema, userCreditsSchema } from '@/models/Schema';

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
    // eslint-disable-next-line no-await-in-loop -- deux écritures séquentielles indépendantes, pas de parallélisation utile ici
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
```

- [ ] **Step 4: Vérifier que les tests passent**

Prérequis : le conteneur Docker Postgres doit tourner (`docker ps` doit lister `backend-postgres-1`) et `DATABASE_URL` doit pointer vers la base `iapronofoot` (déjà le cas dans `.env.local`).

Run: `npx vitest run src/libs/Credits.test.ts`
Expected: PASS — 7 tests.

- [ ] **Step 5: Commit**

```bash
git add src/libs/Credits.ts src/libs/Credits.test.ts
git commit -m "feat: add credit ledger module"
```

---

### Task 3: Module parrainage (`src/libs/Referral.ts`)

**Files:**
- Create: `src/libs/Referral.ts`
- Test: `src/libs/Referral.test.ts`

**Interfaces:**
- Consumes: `db` (`@/libs/DB`), `referralSchema` (`@/models/Schema`), `grantReferralBonus` (`@/libs/Credits`, Task 2)
- Produces: `getOrCreateReferralCode(ownerId: string): Promise<string>`, `linkReferral(code: string, refereeOwnerId: string): Promise<void>`, `grantBonusIfEligible(refereeOwnerId: string): Promise<void>` — utilisés par les tâches 4, 7, 8.

Même remarque que Task 2 : tests contre la vraie base Postgres locale, pas de mock.

- [ ] **Step 1: Écrire les tests**

Create `src/libs/Referral.test.ts` :

```ts
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
```

- [ ] **Step 2: Vérifier que les tests échouent**

Run: `npx vitest run src/libs/Referral.test.ts`
Expected: FAIL — `Cannot find module './Referral'`.

- [ ] **Step 3: Implémenter `src/libs/Referral.ts`**

```ts
import { randomBytes } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { grantReferralBonus } from './Credits';
import { db } from './DB';
import { referralSchema } from '@/models/Schema';

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
```

- [ ] **Step 4: Vérifier que les tests passent**

Run: `npx vitest run src/libs/Referral.test.ts`
Expected: PASS — 5 tests.

- [ ] **Step 5: Commit**

```bash
git add src/libs/Referral.ts src/libs/Referral.test.ts
git commit -m "feat: add referral module"
```

---

### Task 4: Extension du webhook Lemon Squeezy pour l'achat de packs de crédits

**Files:**
- Create: `src/libs/CreditPacks.ts`
- Test: `src/libs/CreditPacks.test.ts`
- Modify: `src/app/api/webhooks/lemonsqueezy/route.ts`
- Modify: `src/app/api/webhooks/lemonsqueezy/route.test.ts`

**Interfaces:**
- Consumes: `db` (`@/libs/DB`), `creditPackSchema` (`@/models/Schema`), `creditPurchase` (`@/libs/Credits`, Task 2), `grantBonusIfEligible` (`@/libs/Referral`, Task 3), `logger` (`@/libs/Logger`)
- Produces: `getActiveCreditPacks(): Promise<CreditPack[]>`, `getCreditPackByVariantId(variantId: string): Promise<CreditPack | null>` (`@/libs/CreditPacks`) — réutilisés par Task 8 (page d'achat de crédits).

- [ ] **Step 1: Écrire les tests de `CreditPacks.ts` (mock de `@/libs/DB`, cohérent avec les autres tests du repo)**

Create `src/libs/CreditPacks.test.ts` :

```ts
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
```

- [ ] **Step 2: Vérifier que les tests échouent**

Run: `npx vitest run src/libs/CreditPacks.test.ts`
Expected: FAIL — `Cannot find module './CreditPacks'`.

- [ ] **Step 3: Implémenter `src/libs/CreditPacks.ts`**

```ts
import { eq } from 'drizzle-orm';
import { db } from './DB';
import { creditPackSchema } from '@/models/Schema';

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
```

- [ ] **Step 4: Vérifier que les tests passent**

Run: `npx vitest run src/libs/CreditPacks.test.ts`
Expected: PASS — 3 tests.

- [ ] **Step 5: Commit**

```bash
git add src/libs/CreditPacks.ts src/libs/CreditPacks.test.ts
git commit -m "feat: add credit packs repository"
```

- [ ] **Step 6: Étendre le webhook — remplacer le cas `order_created`**

Dans `src/app/api/webhooks/lemonsqueezy/route.ts`, ajouter les imports :

```ts
import { getCreditPackByVariantId } from '@/libs/CreditPacks';
import { creditPurchase } from '@/libs/Credits';
import { logger } from '@/libs/Logger';
import { grantBonusIfEligible } from '@/libs/Referral';
```

Ajouter le type de payload d'order (au-dessus de `POST`, à côté de `LemonSqueezySubscriptionPayload`) :

```ts
type LemonSqueezyOrderPayload = {
  meta: {
    event_name: string;
    custom_data?: { user_id?: string };
  };
  data: {
    id: string;
    attributes: {
      first_order_item: { variant_id: number };
    };
  };
};
```

Remplacer entièrement le cas existant :

```ts
    case 'order_created': {
      // L'order précède la création de l'abonnement : géré par `subscription_created`, rien à faire ici.
      break;
    }
```

par :

```ts
    case 'order_created': {
      const orderPayload = JSON.parse(rawBody) as LemonSqueezyOrderPayload;
      const ownerId = orderPayload.meta.custom_data?.user_id;
      const orderId = orderPayload.data.id;
      const variantId = String(orderPayload.data.attributes.first_order_item.variant_id);

      if (!ownerId) {
        return NextResponse.json({ error: 'Missing user_id in custom_data' }, { status: 400 });
      }

      const pack = await getCreditPackByVariantId(variantId);

      if (!pack) {
        logger.error(`Lemon Squeezy order ${orderId} references unknown variant ${variantId}`);
        return NextResponse.json({ error: 'Unknown credit pack' }, { status: 400 });
      }

      await creditPurchase(ownerId, pack.creditsAmount, orderId);
      await grantBonusIfEligible(ownerId);
      break;
    }
```

- [ ] **Step 7: Mettre à jour les tests du webhook**

Dans `src/app/api/webhooks/lemonsqueezy/route.test.ts`, ajouter les mocks (à côté du mock existant de `@/libs/DB`) :

```ts
const getCreditPackByVariantIdMock = vi.fn();

vi.mock('@/libs/CreditPacks', () => ({
  getCreditPackByVariantId: getCreditPackByVariantIdMock,
}));

const creditPurchaseMock = vi.fn().mockResolvedValue(undefined);

vi.mock('@/libs/Credits', () => ({
  creditPurchase: creditPurchaseMock,
}));

const grantBonusIfEligibleMock = vi.fn().mockResolvedValue(undefined);

vi.mock('@/libs/Referral', () => ({
  grantBonusIfEligible: grantBonusIfEligibleMock,
}));

const loggerErrorMock = vi.fn();

vi.mock('@/libs/Logger', () => ({
  logger: { error: loggerErrorMock },
}));
```

Ajouter le reset de ces mocks dans le `beforeEach` existant :

```ts
  beforeEach(() => {
    insertValues.mockClear();
    updateSet.mockClear();
    updateWhere.mockClear();
    getCreditPackByVariantIdMock.mockReset();
    creditPurchaseMock.mockClear();
    grantBonusIfEligibleMock.mockClear();
    loggerErrorMock.mockClear();
  });
```

Remplacer le test existant `'acknowledges order_created without touching the database'` par :

```ts
  it('credits the buyer balance when the order matches a known credit pack', async () => {
    getCreditPackByVariantIdMock.mockResolvedValue({ id: 1, creditsAmount: 18, lemonSqueezyVariantId: '999' });

    const request = makeRequest({
      meta: { event_name: 'order_created', custom_data: { user_id: 'user_123' } },
      data: { id: 'order_1', attributes: { first_order_item: { variant_id: 999 } } },
    });

    const result = await POST(request);

    expect(result.status).toBe(200);
    expect(getCreditPackByVariantIdMock).toHaveBeenCalledWith('999');
    expect(creditPurchaseMock).toHaveBeenCalledWith('user_123', 18, 'order_1');
    expect(grantBonusIfEligibleMock).toHaveBeenCalledWith('user_123');
  });

  it('rejects an order for an unknown variant id without crediting anything', async () => {
    getCreditPackByVariantIdMock.mockResolvedValue(null);

    const request = makeRequest({
      meta: { event_name: 'order_created', custom_data: { user_id: 'user_123' } },
      data: { id: 'order_1', attributes: { first_order_item: { variant_id: 999 } } },
    });

    const result = await POST(request);

    expect(result.status).toBe(400);
    expect(creditPurchaseMock).not.toHaveBeenCalled();
    expect(loggerErrorMock).toHaveBeenCalled();
  });

  it('rejects order_created without a user_id in custom_data', async () => {
    const request = makeRequest({
      meta: { event_name: 'order_created' },
      data: { id: 'order_1', attributes: { first_order_item: { variant_id: 999 } } },
    });

    const result = await POST(request);

    expect(result.status).toBe(400);
    expect(creditPurchaseMock).not.toHaveBeenCalled();
  });
```

- [ ] **Step 8: Vérifier que tous les tests du webhook passent**

Run: `npx vitest run src/app/api/webhooks/lemonsqueezy/route.test.ts`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add src/app/api/webhooks/lemonsqueezy/route.ts src/app/api/webhooks/lemonsqueezy/route.test.ts
git commit -m "feat: credit purchases on Lemon Squeezy order_created"
```

---

### Task 5: Client de l'API de prédiction externe

**Files:**
- Modify: `src/libs/Env.ts`
- Create: `src/libs/PredictionApi.ts`
- Test: `src/libs/PredictionApi.test.ts`

**Interfaces:**
- Produces: `type Fixture`, `type Prediction`, `class PredictionApiError`, `fetchFixtures(league: string, date: string): Promise<Fixture[]>`, `fetchPrediction(matchId: string): Promise<Prediction>` (`@/libs/PredictionApi`) — utilisés par Task 6.

- [ ] **Step 1: Ajouter les variables d'environnement**

Dans `src/libs/Env.ts`, ajouter dans `server` :

```ts
    PREDICTION_API_URL: z.string().optional(),
    PREDICTION_API_KEY: z.string().optional(),
```

et dans `runtimeEnv` :

```ts
    PREDICTION_API_URL: process.env.PREDICTION_API_URL,
    PREDICTION_API_KEY: process.env.PREDICTION_API_KEY,
```

- [ ] **Step 2: Écrire les tests**

Create `src/libs/PredictionApi.test.ts` :

```ts
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
```

- [ ] **Step 3: Vérifier que les tests échouent**

Run: `npx vitest run src/libs/PredictionApi.test.ts`
Expected: FAIL — `Cannot find module './PredictionApi'`.

- [ ] **Step 4: Implémenter `src/libs/PredictionApi.ts`**

```ts
import { Env } from './Env';

export type Fixture = {
  id: string;
  league: string;
  homeTeam: string;
  awayTeam: string;
  kickoffAt: string;
};

export type Prediction = {
  homeWinPct: number;
  drawPct: number;
  awayWinPct: number;
  predictedOutcome: 'home' | 'draw' | 'away';
  confidence: number;
};

export class PredictionApiError extends Error {}

function requireBaseUrl(): string {
  if (!Env.PREDICTION_API_URL) {
    throw new PredictionApiError('PREDICTION_API_URL is not configured');
  }

  return Env.PREDICTION_API_URL;
}

function authHeaders(): HeadersInit {
  return { Authorization: `Bearer ${Env.PREDICTION_API_KEY ?? ''}` };
}

export async function fetchFixtures(league: string, date: string): Promise<Fixture[]> {
  const url = new URL('/fixtures', requireBaseUrl());
  url.searchParams.set('league', league);
  url.searchParams.set('date', date);

  const response = await fetch(url, { headers: authHeaders() });

  if (!response.ok) {
    throw new PredictionApiError(`Fixtures request failed with status ${response.status}`);
  }

  return response.json() as Promise<Fixture[]>;
}

export async function fetchPrediction(matchId: string): Promise<Prediction> {
  const url = new URL(`/predict/${matchId}`, requireBaseUrl());

  const response = await fetch(url, { headers: authHeaders() });

  if (!response.ok) {
    throw new PredictionApiError(`Prediction request failed with status ${response.status}`);
  }

  return response.json() as Promise<Prediction>;
}
```

- [ ] **Step 5: Vérifier que les tests passent**

Run: `npx vitest run src/libs/PredictionApi.test.ts`
Expected: PASS — 4 tests.

- [ ] **Step 6: Commit**

```bash
git add src/libs/Env.ts src/libs/PredictionApi.ts src/libs/PredictionApi.test.ts
git commit -m "feat: add external prediction API client"
```

---

### Task 6: Routes API pronostics (fixtures + pronostic 1-clic)

**Files:**
- Create: `src/app/api/predictions/route.ts`
- Test: `src/app/api/predictions/route.test.ts`
- Create: `src/app/api/predictions/[matchId]/route.ts`
- Test: `src/app/api/predictions/[matchId]/route.test.ts`

**Interfaces:**
- Consumes: `fetchFixtures`, `fetchPrediction`, `PredictionApiError` (`@/libs/PredictionApi`, Task 5), `spendCredit`, `refundCredit`, `getBalance`, `InsufficientCreditsError` (`@/libs/Credits`, Task 2), `auth` (`@clerk/nextjs/server`)
- Produces: `GET /api/predictions?league=&date=` → `{ fixtures: Fixture[] }`, `POST /api/predictions/:matchId` → `{ prediction: Prediction, balance: number }` — consommés par l'UI (hors scope de ce plan backend, à brancher plus tard).

- [ ] **Step 1: Écrire les tests de la route fixtures**

Create `src/app/api/predictions/route.test.ts` :

```ts
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
```

- [ ] **Step 2: Vérifier que les tests échouent**

Run: `npx vitest run src/app/api/predictions/route.test.ts`
Expected: FAIL — `Cannot find module './route'`.

- [ ] **Step 3: Implémenter `src/app/api/predictions/route.ts`**

```ts
import { auth } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';
import { fetchFixtures, PredictionApiError } from '@/libs/PredictionApi';

export async function GET(request: Request) {
  const { userId } = await auth();

  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const url = new URL(request.url);
  const league = url.searchParams.get('league');
  const date = url.searchParams.get('date');

  if (!league || !date) {
    return NextResponse.json({ error: 'Missing league or date' }, { status: 400 });
  }

  try {
    const fixtures = await fetchFixtures(league, date);
    return NextResponse.json({ fixtures });
  } catch (error) {
    if (error instanceof PredictionApiError) {
      return NextResponse.json({ error: error.message }, { status: 502 });
    }

    throw error;
  }
}
```

- [ ] **Step 4: Vérifier que les tests passent**

Run: `npx vitest run src/app/api/predictions/route.test.ts`
Expected: PASS — 3 tests.

- [ ] **Step 5: Écrire les tests de la route pronostic 1-clic**

Create `src/app/api/predictions/[matchId]/route.test.ts` :

```ts
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
```

- [ ] **Step 6: Vérifier que les tests échouent**

Run: `npx vitest run "src/app/api/predictions/[matchId]/route.test.ts"`
Expected: FAIL — `Cannot find module './route'`.

- [ ] **Step 7: Implémenter `src/app/api/predictions/[matchId]/route.ts`**

```ts
import { auth } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';
import { getBalance, InsufficientCreditsError, refundCredit, spendCredit } from '@/libs/Credits';
import { fetchPrediction, PredictionApiError } from '@/libs/PredictionApi';

export async function POST(_request: Request, props: { params: Promise<{ matchId: string }> }) {
  const { userId } = await auth();

  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { matchId } = await props.params;

  try {
    await spendCredit(userId, matchId);
  } catch (error) {
    if (error instanceof InsufficientCreditsError) {
      return NextResponse.json({ error: 'insufficient_credits' }, { status: 402 });
    }

    throw error;
  }

  try {
    const prediction = await fetchPrediction(matchId);
    const balance = await getBalance(userId);
    return NextResponse.json({ prediction, balance });
  } catch (error) {
    await refundCredit(userId, matchId);

    if (error instanceof PredictionApiError) {
      return NextResponse.json({ error: error.message }, { status: 502 });
    }

    throw error;
  }
}
```

- [ ] **Step 8: Vérifier que tous les tests de pronostics passent**

Run: `npx vitest run src/app/api/predictions`
Expected: PASS — 7 tests au total.

- [ ] **Step 9: Commit**

```bash
git add src/app/api/predictions
git commit -m "feat: add fixtures and one-click prediction routes"
```

---

### Task 7: Capture et liaison du lien de parrainage

**Files:**
- Create: `src/app/r/[code]/route.ts`
- Test: `src/app/r/[code]/route.test.ts`
- Create: `src/app/api/referral/link/route.ts`
- Test: `src/app/api/referral/link/route.test.ts`
- Create: `src/features/referral/ReferralLinker.tsx`
- Modify: `src/app/[locale]/(auth)/dashboard/page.tsx`

**Interfaces:**
- Consumes: `linkReferral` (`@/libs/Referral`, Task 3), `auth` (`@clerk/nextjs/server`)
- Produces: `GET /r/:code` (redirige vers `/sign-up`, pose le cookie `referral_code`), `POST /api/referral/link` (`{ linked: boolean }`), composant `<ReferralLinker />` — utilisé par Task 8 dans la page dashboard.

Le template n'a pas de fichier `middleware.ts`. Plutôt que d'en introduire un, le lien de parrainage partagé est directement `https://.../r/<code>` : une route qui pose un cookie puis redirige vers l'inscription — pas besoin de middleware.

- [ ] **Step 1: Écrire le test de la route de capture**

Create `src/app/r/[code]/route.test.ts` :

```ts
import { describe, expect, it } from 'vitest';
import { GET } from './route';

describe('GET /r/[code]', () => {
  it('redirects to sign-up and sets the referral_code cookie', async () => {
    const request = new Request('https://app.example.com/r/abc123');
    const response = await GET(request, { params: Promise.resolve({ code: 'abc123' }) });

    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toBe('https://app.example.com/sign-up');

    const setCookie = response.headers.get('set-cookie') ?? '';
    expect(setCookie).toContain('referral_code=abc123');
  });
});
```

- [ ] **Step 2: Vérifier que le test échoue**

Run: `npx vitest run "src/app/r/[code]/route.test.ts"`
Expected: FAIL — `Cannot find module './route'`.

- [ ] **Step 3: Implémenter `src/app/r/[code]/route.ts`**

```ts
import { NextResponse } from 'next/server';

export async function GET(request: Request, props: { params: Promise<{ code: string }> }) {
  const { code } = await props.params;
  const response = NextResponse.redirect(new URL('/sign-up', request.url));

  response.cookies.set('referral_code', code, {
    maxAge: 60 * 60 * 24 * 30,
    path: '/',
  });

  return response;
}
```

- [ ] **Step 4: Vérifier que le test passe**

Run: `npx vitest run "src/app/r/[code]/route.test.ts"`
Expected: PASS.

- [ ] **Step 5: Écrire le test de la route de liaison**

Create `src/app/api/referral/link/route.test.ts` :

```ts
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
```

- [ ] **Step 6: Vérifier que le test échoue**

Run: `npx vitest run src/app/api/referral/link/route.test.ts`
Expected: FAIL — `Cannot find module './route'`.

- [ ] **Step 7: Implémenter `src/app/api/referral/link/route.ts`**

```ts
import { auth } from '@clerk/nextjs/server';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { linkReferral } from '@/libs/Referral';

export async function POST() {
  const { userId } = await auth();

  if (!userId) {
    return NextResponse.json({ linked: false }, { status: 401 });
  }

  const cookieStore = await cookies();
  const code = cookieStore.get('referral_code')?.value;

  if (!code) {
    return NextResponse.json({ linked: false });
  }

  await linkReferral(code, userId);
  cookieStore.delete('referral_code');

  return NextResponse.json({ linked: true });
}
```

- [ ] **Step 8: Vérifier que le test passe**

Run: `npx vitest run src/app/api/referral/link/route.test.ts`
Expected: PASS — 3 tests.

- [ ] **Step 9: Créer le composant client qui déclenche la liaison une fois au chargement**

Create `src/features/referral/ReferralLinker.tsx` :

```tsx
'use client';

import { useEffect } from 'react';

export const ReferralLinker = () => {
  useEffect(() => {
    fetch('/api/referral/link', { method: 'POST' }).catch(() => {});
  }, []);

  return null;
};
```

Dans `src/app/[locale]/(auth)/dashboard/page.tsx`, ajouter l'import :

```ts
import { ReferralLinker } from '@/features/referral/ReferralLinker';
```

et rendre le composant en première ligne du fragment retourné (juste après `<>`), par exemple :

```tsx
  return (
    <>
      <ReferralLinker />
      <TitleBar
```

- [ ] **Step 10: Vérifier le typecheck**

Run: `npm run check:types`
Expected: aucune erreur.

- [ ] **Step 11: Commit**

```bash
git add src/app/r src/app/api/referral src/features/referral "src/app/[locale]/(auth)/dashboard/page.tsx"
git commit -m "feat: capture and link referral codes"
```

---

### Task 8: UI — page de crédits et page de parrainage

**Files:**
- Create: `src/features/credits/CreditPackCard.tsx`
- Modify: `src/app/[locale]/(auth)/dashboard/billing/page.tsx`
- Create: `src/app/[locale]/(auth)/dashboard/referral/page.tsx`
- Modify: `src/app/[locale]/(auth)/dashboard/layout.tsx`
- Modify: `src/locales/fr.json`, `src/locales/en.json`

**Interfaces:**
- Consumes: `getActiveCreditPacks` (`@/libs/CreditPacks`, Task 4), `getBalance` (`@/libs/Credits`, Task 2), `getOrCreateReferralCode` (`@/libs/Referral`, Task 3)

- [ ] **Step 1: Créer la carte d'affichage d'un pack de crédits**

Create `src/features/credits/CreditPackCard.tsx` :

```tsx
import type { InferSelectModel } from 'drizzle-orm';
import { useTranslations } from 'next-intl';
import { buttonVariants } from '@/components/ui/buttonVariants';
import type { creditPackSchema } from '@/models/Schema';

export const CreditPackCard = (props: { pack: InferSelectModel<typeof creditPackSchema> }) => {
  const t = useTranslations('CreditPackCard');

  return (
    <div className="rounded-xl border border-border px-6 py-8 text-center">
      <div className="text-lg font-semibold">{props.pack.name}</div>

      <div className="mt-3 text-4xl font-bold">
        {t('price_fcfa', { price: props.pack.priceFcfa })}
      </div>

      <div className="mt-2 mb-5 text-sm text-muted-foreground">
        {t('credits_amount', { credits: props.pack.creditsAmount })}
      </div>

      <a
        className={buttonVariants({ size: 'sm', className: 'w-full' })}
        href={`/api/checkout?variantId=${props.pack.lemonSqueezyVariantId}`}
      >
        {t('buy_button')}
      </a>
    </div>
  );
};
```

- [ ] **Step 2: Remplacer le contenu de la page de facturation par les packs de crédits**

Replace `src/app/[locale]/(auth)/dashboard/billing/page.tsx` :

```tsx
import { auth } from '@clerk/nextjs/server';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { CreditPackCard } from '@/features/credits/CreditPackCard';
import { TitleBar } from '@/features/dashboard/TitleBar';
import { getBalance } from '@/libs/Credits';
import { getActiveCreditPacks } from '@/libs/CreditPacks';

export default async function DashboardBillingPage(props: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await props.params;
  setRequestLocale(locale);
  const t = await getTranslations({
    locale,
    namespace: 'DashboardBillingPage',
  });

  const { userId } = await auth();
  const [balance, packs] = await Promise.all([
    userId ? getBalance(userId) : Promise.resolve(0),
    getActiveCreditPacks(),
  ]);

  return (
    <>
      <TitleBar
        title={t('title_bar')}
        description={t('title_bar_description', { balance })}
      />

      <div className="
        grid grid-cols-1 gap-x-6 gap-y-8
        @xl:grid-cols-2
        @4xl:grid-cols-3
      "
      >
        {packs.map(pack => (
          <CreditPackCard key={pack.id} pack={pack} />
        ))}
      </div>
    </>
  );
}
```

- [ ] **Step 3: Créer la page de parrainage**

Create `src/app/[locale]/(auth)/dashboard/referral/page.tsx` :

```tsx
import { auth } from '@clerk/nextjs/server';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { TitleBar } from '@/features/dashboard/TitleBar';
import { Env } from '@/libs/Env';
import { getOrCreateReferralCode } from '@/libs/Referral';

export default async function DashboardReferralPage(props: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await props.params;
  setRequestLocale(locale);
  const t = await getTranslations({
    locale,
    namespace: 'DashboardReferralPage',
  });

  const { userId } = await auth();
  const code = userId ? await getOrCreateReferralCode(userId) : null;
  const link = code ? `${Env.NEXT_PUBLIC_APP_URL ?? ''}/r/${code}` : '';

  return (
    <>
      <TitleBar
        title={t('title_bar')}
        description={t('title_bar_description')}
      />

      {link && (
        <div className="rounded-xl border border-border px-6 py-8">
          <p className="text-sm text-muted-foreground">{t('share_instructions')}</p>
          <p className="mt-3 font-mono text-sm break-all">{link}</p>
        </div>
      )}
    </>
  );
}
```

- [ ] **Step 4: Ajouter les liens de navigation**

Dans `src/app/[locale]/(auth)/dashboard/layout.tsx`, ajouter deux entrées au tableau `menu` (après celle de `t('home')`) :

```tsx
              {
                href: '/dashboard/billing',
                label: t('credits'),
              },
              {
                href: '/dashboard/referral',
                label: t('referral'),
              },
```

- [ ] **Step 5: Ajouter les clés de traduction**

Dans `src/locales/fr.json`, remplacer la section `"DashboardLayout"` par :

```json
  "DashboardLayout": {
    "meta_title": "Tableau de bord IAProNoFoot",
    "meta_description": "Consultez vos pronostics IA, gérez vos crédits Mobile Money et suivez vos parrainages.",
    "home": "Accueil",
    "credits": "Crédits",
    "referral": "Parrainage",
    "members": "Membres",
    "settings": "Réglages"
  },
```

et remplacer la section `"DashboardBillingPage"` par :

```json
  "DashboardBillingPage": {
    "title_bar": "Crédits",
    "title_bar_description": "Solde actuel : {balance} crédits"
  },
  "CreditPackCard": {
    "price_fcfa": "{price} FCFA",
    "credits_amount": "{credits} crédits",
    "buy_button": "Acheter"
  },
  "DashboardReferralPage": {
    "title_bar": "Parrainage",
    "title_bar_description": "Invitez vos proches et gagnez des crédits ensemble",
    "share_instructions": "Partagez ce lien : chaque filleul qui achète un pack vous rapporte des crédits bonus, à vous deux."
  },
```

Faire le même ajout dans `src/locales/en.json` :

```json
  "DashboardLayout": {
    "meta_title": "IAProNoFoot Dashboard",
    "meta_description": "View your AI predictions, manage your Mobile Money credits, and track your referrals.",
    "home": "Home",
    "credits": "Credits",
    "referral": "Referral",
    "members": "Members",
    "settings": "Settings"
  },
```

```json
  "DashboardBillingPage": {
    "title_bar": "Credits",
    "title_bar_description": "Current balance: {balance} credits"
  },
  "CreditPackCard": {
    "price_fcfa": "{price} FCFA",
    "credits_amount": "{credits} credits",
    "buy_button": "Buy"
  },
  "DashboardReferralPage": {
    "title_bar": "Referral",
    "title_bar_description": "Invite people you know and earn credits together",
    "share_instructions": "Share this link: every referred friend who buys a pack earns bonus credits for both of you."
  },
```

- [ ] **Step 6: Vérifier la cohérence i18n**

Run: `npm run check:i18n`
Expected: aucune clé manquante entre `fr.json` et `en.json`.

Run: `npm run check:types`
Expected: aucune erreur.

- [ ] **Step 7: Vérifier visuellement dans le navigateur**

Démarrer le serveur de dev (`npm run dev:next`), se connecter, puis visiter `/dashboard/billing` (les 4 packs de crédits doivent s'afficher) et `/dashboard/referral` (un lien `/r/<code>` doit s'afficher).

- [ ] **Step 8: Commit**

```bash
git add src/features/credits "src/app/[locale]/(auth)/dashboard/billing/page.tsx" "src/app/[locale]/(auth)/dashboard/referral" "src/app/[locale]/(auth)/dashboard/layout.tsx" src/locales/fr.json src/locales/en.json
git commit -m "feat: add credit packs and referral pages"
```

---

### Task 9: Nettoyage — suppression du modèle d'abonnement par équipe

**Files:**
- Modify: `src/models/Schema.ts` (retirer `subscriptionSchema`)
- Modify: `src/app/api/webhooks/lemonsqueezy/route.ts` (retirer les cas `subscription_*`)
- Modify: `src/app/api/webhooks/lemonsqueezy/route.test.ts` (retirer les tests correspondants)
- Delete: `src/utils/PricingPlans.ts`, `src/types/Subscription.ts`, `src/features/billing/PricingCard.tsx`, `src/features/billing/PricingFeatureList.tsx`, `src/features/billing/PricingFeatureItem.tsx`
- Modify: `src/locales/fr.json`, `src/locales/en.json` (retirer `PricingPlans`, `PricingCard`, `PricingFeatures`)

Cette tâche est volontairement dernière : le modèle de crédits est déjà pleinement fonctionnel (Tasks 1-8) avant qu'on retire l'ancien modèle, pour ne jamais casser le build entre deux commits.

- [ ] **Step 1: Retirer les cas d'abonnement du webhook**

Dans `src/app/api/webhooks/lemonsqueezy/route.ts`, retirer l'import `subscriptionSchema` et l'import `eq` (plus utilisé une fois les cas d'abonnement supprimés), puis retirer les cas `subscription_created`, `subscription_updated`/`subscription_payment_success`/`subscription_cancelled`/`subscription_expired` du `switch`. Retirer aussi le type `LemonSqueezySubscriptionPayload` et remplacer les lignes :

```ts
  const payload = JSON.parse(rawBody) as LemonSqueezySubscriptionPayload;
  const eventName = payload.meta.event_name;
  const subscriptionId = payload.data.id;
  const { attributes } = payload.data;
```

par un parsing générique, les variables `subscriptionId` et `attributes` n'étant plus utilisées que dans le cas `order_created` (qui reparse déjà `rawBody` lui-même) :

```ts
  const payload = JSON.parse(rawBody) as { meta: { event_name: string } };
  const eventName = payload.meta.event_name;
```

- [ ] **Step 2: Mettre à jour les tests du webhook**

Dans `src/app/api/webhooks/lemonsqueezy/route.test.ts`, retirer les tests `'inserts a subscription row on subscription_created'`, `'rejects subscription_created without a user_id in custom_data'`, et le `it.each` sur les événements de mise à jour d'abonnement. Retirer aussi le mock `@/libs/DB` s'il n'est plus utilisé par aucun test restant (vérifier après suppression : les tests `order_created` mockent `@/libs/CreditPacks`/`@/libs/Credits`/`@/libs/Referral`, pas `@/libs/DB` directement, donc ce mock devient inutile et doit être retiré avec ses variables `insertValues`/`updateSet`/`updateWhere`).

- [ ] **Step 3: Retirer `subscriptionSchema` du schéma et migrer**

Dans `src/models/Schema.ts`, retirer la définition de `subscriptionSchema` entièrement.

Run: `npm run db:generate`
Expected: un nouveau fichier de migration contenant `DROP TABLE "subscription";`.

Run: `npm run db:migrate`
Expected: `[✓] migrations applied successfully!`

- [ ] **Step 4: Supprimer les fichiers obsolètes**

```bash
rm src/utils/PricingPlans.ts src/types/Subscription.ts
rm src/features/billing/PricingCard.tsx src/features/billing/PricingFeatureList.tsx src/features/billing/PricingFeatureItem.tsx
```

- [ ] **Step 5: Retirer les clés i18n obsolètes**

Dans `src/locales/fr.json` et `src/locales/en.json`, retirer les sections `"PricingPlans"`, `"PricingCard"`, `"PricingFeatures"`.

- [ ] **Step 6: Vérifier que tout compile et que les tests passent**

Run: `npm run check:types`
Expected: aucune erreur (en particulier, vérifier qu'aucun fichier restant n'importe `@/utils/PricingPlans`, `@/types/Subscription`, ou les composants `Pricing*` supprimés).

Run: `npm run check:i18n`
Expected: aucune clé manquante.

Run: `npm test`
Expected: PASS, toute la suite.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "refactor: remove team subscription model in favor of credits"
```

---

### Task 10: Vérification finale et test e2e du lien de parrainage

**Files:**
- Create: `tests/e2e/Referral.e2e.ts`

Le template ne configure pas de session Clerk authentifiée pour les tests e2e gratuits (`playwright.config.ts` renvoie vers la version payante pour le `setup`/`teardown` Clerk). Le parcours d'achat de crédits et de pronostic 1-clic, qui nécessitent une authentification, sont donc déjà couverts par les tests d'intégration Vitest des Tasks 4 et 6 (mocks `auth()`), pas par un test Playwright. Le test e2e ci-dessous couvre la partie du parcours de parrainage qui ne nécessite pas d'être connecté : la capture du lien.

- [ ] **Step 1: Écrire le test e2e**

Create `tests/e2e/Referral.e2e.ts` :

```ts
import { expect, test } from '@playwright/test';

test.describe('Referral link capture', () => {
  test('redirects a referral link to sign-up and sets the referral cookie', async ({ page, context }) => {
    await page.goto('/r/e2e-test-code');

    await expect(page).toHaveURL(/\/sign-up/);

    const cookies = await context.cookies();
    const referralCookie = cookies.find(cookie => cookie.name === 'referral_code');

    expect(referralCookie?.value).toBe('e2e-test-code');
  });
});
```

- [ ] **Step 2: Lancer le test e2e**

Run: `npm run test:e2e -- tests/e2e/Referral.e2e.ts`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add tests/e2e/Referral.e2e.ts
git commit -m "test: add e2e coverage for referral link capture"
```

- [ ] **Step 4: Vérification globale finale**

Run: `npm run check:types`
Expected: aucune erreur.

Run: `npm run lint`
Expected: aucune erreur.

Run: `npm test`
Expected: PASS, toute la suite (unitaires + intégration).

Run: `npm run test:e2e`
Expected: PASS, toute la suite e2e.

---

## Hors scope (rappel)

- L'interface de navigation des matchs et de déclenchement du pronostic 1-clic (liste des fixtures, bouton par match) : ce plan livre les routes API (`GET /api/predictions`, `POST /api/predictions/:matchId`) prêtes à être consommées, mais pas l'écran qui les appelle.
- Le pipeline de données et de machine learning (XGBoost, LSTM, LLM contextuel) qui sert réellement `PREDICTION_API_URL` : sous-projet séparé, à spécifier indépendamment.
- La configuration réelle des produits/variants Lemon Squeezy (associer les `lemonsqueezy_variant_id` vides des packs de crédits à de vrais produits créés dans le dashboard Lemon Squeezy).
- Le contenu de la landing page publique (toujours celui du template au moment de ce plan).
- Toute décomposition multi-tenant/organisation héritée du template (`organization-profile`, `organization-members`) : laissée telle quelle, non utilisée par le modèle B2C de ce produit, retrait éventuel à traiter séparément si confirmé inutile.
