import { pgTable, serial, text, timestamp } from 'drizzle-orm/pg-core';

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

export const subscriptionSchema = pgTable('subscription', {
  id: serial('id').primaryKey(),
  ownerId: text('owner_id').notNull(),
  lemonsqueezyCustomerId: text('lemonsqueezy_customer_id').notNull(),
  lemonsqueezySubscriptionId: text('lemonsqueezy_subscription_id').notNull(),
  lemonsqueezyVariantId: text('lemonsqueezy_variant_id').notNull(),
  status: text('status').notNull(),
  renewsAt: timestamp('renews_at', { mode: 'date' }),
  endsAt: timestamp('ends_at', { mode: 'date' }),
  customerPortalUrl: text('customer_portal_url'),
  updatedAt: timestamp('updated_at', { mode: 'date' })
    .defaultNow()
    .$onUpdate(() => new Date())
    .notNull(),
  createdAt: timestamp('created_at', { mode: 'date' }).defaultNow().notNull(),
});
