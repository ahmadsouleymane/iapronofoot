CREATE TABLE "credit_pack" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"price_fcfa" integer NOT NULL,
	"credits_amount" integer NOT NULL,
	"lemonsqueezy_variant_id" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "credit_transaction" (
	"id" serial PRIMARY KEY NOT NULL,
	"owner_id" text NOT NULL,
	"type" text NOT NULL,
	"amount" integer NOT NULL,
	"balance_after" integer NOT NULL,
	"related_reference" text,
	"lemonsqueezy_order_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "credit_transaction_lemonsqueezy_order_id_unique" UNIQUE("lemonsqueezy_order_id")
);
--> statement-breakpoint
CREATE TABLE "referral" (
	"id" serial PRIMARY KEY NOT NULL,
	"owner_id" text NOT NULL,
	"code" text NOT NULL,
	"referred_owner_id" text,
	"bonus_granted" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "referral_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "user_credits" (
	"owner_id" text PRIMARY KEY NOT NULL,
	"balance" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
