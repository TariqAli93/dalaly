CREATE TABLE "studio_clauses" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"contract_type" text DEFAULT 'both' NOT NULL,
	"content_json" jsonb NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"is_public" boolean DEFAULT true NOT NULL,
	"system_key" text,
	"created_by" bigint,
	"review_status" text DEFAULT 'unreviewed' NOT NULL,
	"review_note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "studio_clauses_system_key_unique" UNIQUE("system_key"),
	CONSTRAINT "studio_clause_type" CHECK ("studio_clauses"."contract_type" IN ('sale','rental','both')),
	CONSTRAINT "studio_clause_review" CHECK ("studio_clauses"."review_status" IN ('unreviewed','reviewed')),
	CONSTRAINT "studio_clause_version" CHECK ("studio_clauses"."version">0)
);

--> statement-breakpoint
ALTER TABLE "studio_contracts" ADD COLUMN "creation_key" uuid;
--> statement-breakpoint
ALTER TABLE "studio_contracts" ADD COLUMN "copied_from_id" bigint;
--> statement-breakpoint
ALTER TABLE "studio_clauses" ADD CONSTRAINT "studio_clauses_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "studio_contracts" ADD CONSTRAINT "studio_contracts_copied_from_id_studio_contracts_id_fk" FOREIGN KEY ("copied_from_id") REFERENCES "public"."studio_contracts"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "studio_contracts" ADD CONSTRAINT "studio_contracts_creation_key_unique" UNIQUE("creation_key");
