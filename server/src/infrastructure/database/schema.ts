import {
  bigint,
  bigserial,
  boolean,
  index,
  numeric,
  pgTable,
  primaryKey,
  text,
  timestamp
} from "drizzle-orm/pg-core";

export const users = pgTable("users", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  username: text("username").notNull().unique(),
  pinHash: text("pin_hash").notNull(),
  displayName: text("display_name").notNull(),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
});

export const roles = pgTable("roles", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  name: text("name").notNull().unique(),
  description: text("description"),
  isSystem: boolean("is_system").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
});

export const permissions = pgTable("permissions", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  key: text("key").notNull().unique(),
  name: text("name").notNull(),
  description: text("description"),
  module: text("module").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
});

export const userRoles = pgTable(
  "user_roles",
  {
    userId: bigint("user_id", { mode: "number" })
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    roleId: bigint("role_id", { mode: "number" })
      .notNull()
      .references(() => roles.id, { onDelete: "cascade" })
  },
  (table) => [primaryKey({ columns: [table.userId, table.roleId] })]
);

export const rolePermissions = pgTable(
  "role_permissions",
  {
    roleId: bigint("role_id", { mode: "number" })
      .notNull()
      .references(() => roles.id, { onDelete: "cascade" }),
    permissionId: bigint("permission_id", { mode: "number" })
      .notNull()
      .references(() => permissions.id, { onDelete: "cascade" })
  },
  (table) => [primaryKey({ columns: [table.roleId, table.permissionId] })]
);

export const sessions = pgTable(
  "sessions",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    userId: bigint("user_id", { mode: "number" })
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull().unique(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull()
  },
  (table) => [index("idx_sessions_token_hash").on(table.tokenHash)]
);

export const properties = pgTable(
  "properties",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    code: text("code").notNull().unique(),
    propertyType: text("property_type").notNull(),
    legalType: text("legal_type").notNull(),
    areaValue: numeric("area_value", { precision: 14, scale: 2 }).notNull(),
    areaUnit: text("area_unit").notNull(),
    pricingMethod: text("pricing_method").notNull(),
    unitPrice: numeric("unit_price", { precision: 18, scale: 2 }),
    totalPrice: numeric("total_price", { precision: 18, scale: 2 }).notNull(),
    governorate: text("governorate"),
    city: text("city"),
    district: text("district"),
    addressDetails: text("address_details"),
    ownerName: text("owner_name").notNull(),
    ownerPhone: text("owner_phone").notNull(),
    ownerNotes: text("owner_notes"),
    status: text("status").notNull().default("available"),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    archivedAt: timestamp("archived_at", { withTimezone: true })
  },
  (table) => [
    index("idx_properties_status").on(table.status),
    index("idx_properties_type").on(table.propertyType),
    index("idx_properties_legal_type").on(table.legalType),
    index("idx_properties_area_unit").on(table.areaUnit),
    index("idx_properties_pricing_method").on(table.pricingMethod),
    index("idx_properties_district").on(table.district)
  ]
);

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Role = typeof roles.$inferSelect;
export type NewRole = typeof roles.$inferInsert;
export type Permission = typeof permissions.$inferSelect;
export type NewPermission = typeof permissions.$inferInsert;
export type Session = typeof sessions.$inferSelect;
export type Property = typeof properties.$inferSelect;
export type NewProperty = typeof properties.$inferInsert;
