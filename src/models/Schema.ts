import { boolean, integer, pgTable, serial, text, timestamp } from 'drizzle-orm/pg-core';

// This file defines the structure of your database tables using the Drizzle ORM.

// To modify the database schema:
// 1. Update this file with your desired changes.
// 2. Generate a new migration by running: `npm run db:generate`

// The generated migration file will reflect your schema changes.
// It automatically run the command `db-server:file`, which apply the migration before Next.js starts in development mode,
// Alternatively, if your database is running, you can run `npm run db:migrate` and there is no need to restart the server.

// Need a database for production? Check out https://get.neon.com/BMFYNtx
// Tested and compatible with SaaS Boilerplate

export const todoSchema = pgTable('todo', {
  id: serial('id').primaryKey(),
  ownerId: text('owner_id').notNull(),
  title: text('title').notNull(),
  message: text('message').notNull(),
  updatedAt: timestamp('updated_at', { mode: 'date' })
    .defaultNow()
    .$onUpdate(() => new Date())
    .notNull(),
  createdAt: timestamp('created_at', { mode: 'date' }).defaultNow().notNull(),
});

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
