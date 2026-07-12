CREATE TABLE "subscription" (
	"id" serial PRIMARY KEY NOT NULL,
	"owner_id" text NOT NULL,
	"lemonsqueezy_customer_id" text NOT NULL,
	"lemonsqueezy_subscription_id" text NOT NULL,
	"lemonsqueezy_variant_id" text NOT NULL,
	"status" text NOT NULL,
	"renews_at" timestamp,
	"ends_at" timestamp,
	"customer_portal_url" text,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
