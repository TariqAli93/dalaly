-- Chart of accounts (Phase 4a): headings and posting accounts, each posting
-- account in one currency. Additive only. The default accounts are added at
-- startup by ensureDefaultChart (modules/accounting/default-chart.ts), which
-- also restores them after a restore of an archive made before this table.
CREATE TABLE "accounts" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"account_type" text NOT NULL,
	"parent_id" bigint,
	"currency" text,
	"is_postable" boolean DEFAULT true NOT NULL,
	"system_key" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"description" text,
	"created_by" bigint,
	"updated_by" bigint,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "accounts_code_unique" UNIQUE("code"),
	CONSTRAINT "accounts_system_key_unique" UNIQUE("system_key"),
	CONSTRAINT "accounts_type" CHECK ("accounts"."account_type" in ('asset', 'liability', 'equity', 'revenue', 'expense')),
	CONSTRAINT "accounts_currency" CHECK ("accounts"."currency" is null or "accounts"."currency" in ('IQD', 'USD')),
	CONSTRAINT "accounts_postable_currency" CHECK (not "accounts"."is_postable" or "accounts"."currency" is not null),
	CONSTRAINT "accounts_code" CHECK ("accounts"."code" ~ '^[0-9]{1,10}$'),
	CONSTRAINT "accounts_parent" CHECK ("accounts"."parent_id" is null or "accounts"."parent_id" <> "accounts"."id")
);
--> statement-breakpoint
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_parent_id_accounts_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."accounts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_accounts_parent" ON "accounts" USING btree ("parent_id");