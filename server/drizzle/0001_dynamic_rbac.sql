ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "display_name" text;
UPDATE "users" SET "display_name" = "username" WHERE "display_name" IS NULL;
ALTER TABLE "users" ALTER COLUMN "display_name" SET NOT NULL;

CREATE TABLE IF NOT EXISTS "roles" (
  "id" bigserial PRIMARY KEY NOT NULL,
  "name" text NOT NULL,
  "description" text,
  "is_system" boolean DEFAULT false NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "roles_name_unique" UNIQUE("name")
);

CREATE TABLE IF NOT EXISTS "permissions" (
  "id" bigserial PRIMARY KEY NOT NULL,
  "key" text NOT NULL,
  "name" text NOT NULL,
  "description" text,
  "module" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "permissions_key_unique" UNIQUE("key")
);

CREATE TABLE IF NOT EXISTS "user_roles" (
  "user_id" bigint NOT NULL,
  "role_id" bigint NOT NULL,
  CONSTRAINT "user_roles_user_id_role_id_pk" PRIMARY KEY("user_id","role_id")
);

CREATE TABLE IF NOT EXISTS "role_permissions" (
  "role_id" bigint NOT NULL,
  "permission_id" bigint NOT NULL,
  CONSTRAINT "role_permissions_role_id_permission_id_pk" PRIMARY KEY("role_id","permission_id")
);

ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_role_id_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_role_id_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_permission_id_permissions_id_fk" FOREIGN KEY ("permission_id") REFERENCES "permissions"("id") ON DELETE cascade ON UPDATE no action;
