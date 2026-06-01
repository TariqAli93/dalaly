import {
  bigint,
  bigserial,
  boolean,
  index,
  numeric,
  pgTable,
  text,
  timestamp
} from "drizzle-orm/pg-core";

export const users = pgTable("users", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  username: text("username").notNull().unique(),
  pinHash: text("pin_hash").notNull(),
  role: text("role").notNull().default("administrator"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
});

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
export type Session = typeof sessions.$inferSelect;
export type Property = typeof properties.$inferSelect;
export type NewProperty = typeof properties.$inferInsert;
