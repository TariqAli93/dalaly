import {
  bigint,
  bigserial,
  boolean,
  index,
  integer,
  jsonb,
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

export const governorates = pgTable("governorates", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  name: text("name").notNull().unique(),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
});

export const districts = pgTable(
  "districts",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    governorateId: bigint("governorate_id", { mode: "number" })
      .notNull()
      .references(() => governorates.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [index("idx_districts_governorate").on(table.governorateId)]
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
    governorateId: bigint("governorate_id", { mode: "number" }),
    districtId: bigint("district_id", { mode: "number" }),
    governorateText: text("governorate_text"),
    districtText: text("district_text"),
    addressDetails: text("address_details"),
    ownerName: text("owner_name").notNull(),
    ownerPhone: text("owner_phone").notNull(),
    ownerNotes: text("owner_notes"),
    status: text("status").notNull().default("available"),
    notes: text("notes"),
    // حقول عراقية اختيارية إضافية
    plotNumber: text("plot_number"),
    subdistrictNumber: text("subdistrict_number"),
    subdistrictName: text("subdistrict_name"),
    mahalla: text("mahalla"),
    alley: text("alley"),
    houseNumber: text("house_number"),
    nearestLandmark: text("nearest_landmark"),
    streetWidth: text("street_width"),
    frontage: text("frontage"),
    roomsCount: integer("rooms_count"),
    bathroomsCount: integer("bathrooms_count"),
    isNegotiable: boolean("is_negotiable").notNull().default(false),
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
    index("idx_properties_district").on(table.district),
    index("idx_properties_governorate_id").on(table.governorateId),
    index("idx_properties_district_id").on(table.districtId)
  ]
);

export const propertyImages = pgTable(
  "property_images",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    propertyId: bigint("property_id", { mode: "number" })
      .notNull()
      .references(() => properties.id, { onDelete: "cascade" }),
    filePath: text("file_path").notNull(),
    originalName: text("original_name"),
    isPrimary: boolean("is_primary").notNull().default(false),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [index("idx_property_images_property").on(table.propertyId)]
);

export const auditLogs = pgTable(
  "audit_logs",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    entityType: text("entity_type").notNull(),
    entityId: bigint("entity_id", { mode: "number" }).notNull(),
    action: text("action").notNull(),
    oldValue: jsonb("old_value"),
    newValue: jsonb("new_value"),
    userId: bigint("user_id", { mode: "number" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [index("idx_audit_entity").on(table.entityType, table.entityId)]
);

export const propertyFollowups = pgTable(
  "property_followups",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    propertyId: bigint("property_id", { mode: "number" })
      .notNull()
      .references(() => properties.id, { onDelete: "cascade" }),
    userId: bigint("user_id", { mode: "number" }),
    type: text("type").notNull(),
    notes: text("notes"),
    scheduledAt: timestamp("scheduled_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [
    index("idx_followups_property").on(table.propertyId),
    index("idx_followups_scheduled").on(table.scheduledAt)
  ]
);

export const favoriteProperties = pgTable(
  "favorite_properties",
  {
    userId: bigint("user_id", { mode: "number" })
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    propertyId: bigint("property_id", { mode: "number" })
      .notNull()
      .references(() => properties.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [primaryKey({ columns: [table.userId, table.propertyId] })]
);

export const backupJobs = pgTable("backup_jobs", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  type: text("type").notNull(),
  status: text("status").notNull(),
  filePath: text("file_path"),
  fileSize: bigint("file_size", { mode: "number" }),
  durationMs: integer("duration_ms"),
  error: text("error"),
  userId: bigint("user_id", { mode: "number" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
});

export const backupLogs = pgTable("backup_logs", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  jobId: bigint("job_id", { mode: "number" }),
  level: text("level").notNull().default("info"),
  message: text("message").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
});

export const appSettings = pgTable("app_settings", {
  key: text("key").primaryKey(),
  value: jsonb("value"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
});

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Role = typeof roles.$inferSelect;
export type NewRole = typeof roles.$inferInsert;
export type Permission = typeof permissions.$inferSelect;
export type NewPermission = typeof permissions.$inferInsert;
export type Session = typeof sessions.$inferSelect;
export type Property = typeof properties.$inferSelect;
export type NewProperty = typeof properties.$inferInsert;
export type Governorate = typeof governorates.$inferSelect;
export type NewGovernorate = typeof governorates.$inferInsert;
export type District = typeof districts.$inferSelect;
export type NewDistrict = typeof districts.$inferInsert;
export type PropertyImage = typeof propertyImages.$inferSelect;
export type NewPropertyImage = typeof propertyImages.$inferInsert;
export type AuditLog = typeof auditLogs.$inferSelect;
export type NewAuditLog = typeof auditLogs.$inferInsert;
export type PropertyFollowup = typeof propertyFollowups.$inferSelect;
export type NewPropertyFollowup = typeof propertyFollowups.$inferInsert;
export type FavoriteProperty = typeof favoriteProperties.$inferSelect;
export type BackupJob = typeof backupJobs.$inferSelect;
export type NewBackupJob = typeof backupJobs.$inferInsert;
export type BackupLog = typeof backupLogs.$inferSelect;
export type AppSetting = typeof appSettings.$inferSelect;
