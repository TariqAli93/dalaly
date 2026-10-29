import {
  type AnyPgColumn,
  bigint,
  bigserial,
  check,
  boolean,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export const users = pgTable("users", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  username: text("username").notNull().unique(),
  pinHash: text("pin_hash").notNull(),
  displayName: text("display_name").notNull(),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const roles = pgTable("roles", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  name: text("name").notNull().unique(),
  description: text("description"),
  isSystem: boolean("is_system").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const permissions = pgTable("permissions", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  key: text("key").notNull().unique(),
  name: text("name").notNull(),
  description: text("description"),
  module: text("module").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const userRoles = pgTable(
  "user_roles",
  {
    userId: bigint("user_id", { mode: "number" })
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    roleId: bigint("role_id", { mode: "number" })
      .notNull()
      .references(() => roles.id, { onDelete: "cascade" }),
  },
  (table) => [primaryKey({ columns: [table.userId, table.roleId] })],
);

export const rolePermissions = pgTable(
  "role_permissions",
  {
    roleId: bigint("role_id", { mode: "number" })
      .notNull()
      .references(() => roles.id, { onDelete: "cascade" }),
    permissionId: bigint("permission_id", { mode: "number" })
      .notNull()
      .references(() => permissions.id, { onDelete: "cascade" }),
  },
  (table) => [primaryKey({ columns: [table.roleId, table.permissionId] })],
);

export const sessions = pgTable(
  "sessions",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    userId: bigint("user_id", { mode: "number" })
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull().unique(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  },
  (table) => [index("idx_sessions_token_hash").on(table.tokenHash)],
);

export const governorates = pgTable("governorates", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  name: text("name").notNull().unique(),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
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
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [index("idx_districts_governorate").on(table.governorateId)],
);

export const neighborhoods = pgTable(
  "neighborhoods",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    districtId: bigint("district_id", { mode: "number" })
      .notNull()
      .references(() => districts.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [index("idx_neighborhoods_district").on(table.districtId)],
);

export const people = pgTable(
  "people",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    code: text("code").notNull().unique(),
    fullName: text("full_name").notNull(),
    phonePrimary: text("phone_primary"),
    phoneSecondary: text("phone_secondary"),
    email: text("email"),
    address: text("address"),
    nationalId: text("national_id"),
    governorate: text("governorate"),
    district: text("district"),
    neighborhood: text("neighborhood"),
    alley: text("alley"),
    houseNumber: text("house_number"),
    residenceCardNumber: text("residence_card_number"),
    personType: text("person_type").notNull().default("individual"),
    status: text("status").notNull().default("active"),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    /** What the office deals with this customer as (several at once). */
    roles: text("roles")
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    /** How the customer came to the office. */
    source: text("source"),
    /** The employee who looks after this customer. */
    assignedUserId: bigint("assigned_user_id", { mode: "number" }).references(
      (): AnyPgColumn => users.id,
      { onDelete: "set null" },
    ),
  },
  (table) => [
    index("idx_people_full_name").on(table.fullName),
    index("idx_people_phone_primary").on(table.phonePrimary),
    index("idx_people_person_type").on(table.personType),
    index("idx_people_status").on(table.status),
    index("idx_people_assigned").on(table.assignedUserId),
    index("idx_people_roles").using("gin", table.roles),
    check(
      "people_roles",
      sql`${table.roles} <@ ARRAY['buyer', 'seller', 'tenant', 'landlord', 'owner', 'investor', 'other']::text[]`,
    ),
    check(
      "people_source",
      sql`${table.source} is null or ${table.source} in ('walk_in', 'phone', 'referral', 'social', 'listing_ad', 'other')`,
    ),
  ],
);

export const properties = pgTable(
  "properties",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    name: text("name"),
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
    neighborhoodId: bigint("neighborhood_id", { mode: "number" }),
    neighborhood: text("neighborhood"),
    governorateText: text("governorate_text"),
    districtText: text("district_text"),
    neighborhoodText: text("neighborhood_text"),
    addressDetails: text("address_details"),
    latitude: numeric("latitude", { precision: 10, scale: 8, mode: "number" }),
    longitude: numeric("longitude", {
      precision: 11,
      scale: 8,
      mode: "number",
    }),
    locationLink: text("location_link"),
    ownerName: text("owner_name").notNull(),
    ownerPhone: text("owner_phone").notNull(),
    ownerNotes: text("owner_notes"),
    ownerPersonId: bigint("owner_person_id", { mode: "number" }).references(
      () => people.id,
      { onDelete: "set null" },
    ),
    status: text("status").notNull().default("available"),
    notes: text("notes"),
    // Ø­Ù‚ÙˆÙ„ Ø¹Ø±Ø§Ù‚ÙŠØ© Ø§Ø®ØªÙŠØ§Ø±ÙŠØ© Ø¥Ø¶Ø§ÙÙŠØ©
    nazal: text("nazal"), // Ø§Ù„Ù†Ø²Ø§Ù„: Ø¹Ù…Ù‚ Ø§Ù„Ø£Ø±Ø¶ (ÙŠÙ‚ØªØ±Ù† Ø¨Ø§Ù„ÙˆØ§Ø¬Ù‡Ø© frontage)
    plotNumber: text("plot_number"),
    plotLetter: text("plot_letter"),
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
    amenities: jsonb("amenities").notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
  },
  (table) => [
    index("idx_properties_status").on(table.status),
    check(
      "properties_location_range",
      sql`(${table.latitude} IS NULL AND ${table.longitude} IS NULL) OR (${table.latitude} IS NOT NULL AND ${table.longitude} IS NOT NULL AND ${table.latitude} BETWEEN -90 AND 90 AND ${table.longitude} BETWEEN -180 AND 180)`,
    ),
    index("idx_properties_type").on(table.propertyType),
    index("idx_properties_legal_type").on(table.legalType),
    index("idx_properties_area_unit").on(table.areaUnit),
    index("idx_properties_pricing_method").on(table.pricingMethod),
    index("idx_properties_district").on(table.district),
    index("idx_properties_governorate_id").on(table.governorateId),
    index("idx_properties_district_id").on(table.districtId),
    index("idx_properties_neighborhood_id").on(table.neighborhoodId),
    // uq_properties_plot_identity and the trigram indexes are created only by
    // migrations 0002 and 0003, best-effort (existing duplicates or a missing
    // pg_trgm skip them). Declaring them here would make the next
    // db:generate emit a plain CREATE INDEX that can fail at startup. The
    // generated search_text column (0003) is left out too, so selects,
    // backups and restores do not carry it.
  ],
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
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [index("idx_property_images_property").on(table.propertyId)],
);

export const rentals = pgTable(
  "rentals",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    name: text("name"),
    code: text("code").notNull().unique(),
    propertyType: text("property_type").notNull(),
    rentPrice: numeric("rent_price", { precision: 18, scale: 2 }).notNull(),
    rentPeriod: text("rent_period").notNull(),
    areaValue: numeric("area_value", { precision: 14, scale: 2 }).notNull(),
    areaUnit: text("area_unit").notNull(),
    floorsCount: integer("floors_count"),
    roomsCount: integer("rooms_count"),
    bathroomsCount: integer("bathrooms_count"),
    amenities: jsonb("amenities").notNull().default({}),
    otherDetails: text("other_details"),
    governorateId: bigint("governorate_id", { mode: "number" }).references(
      () => governorates.id,
      { onDelete: "set null" },
    ),
    districtId: bigint("district_id", { mode: "number" }).references(
      () => districts.id,
      { onDelete: "set null" },
    ),
    neighborhoodId: bigint("neighborhood_id", { mode: "number" }).references(
      () => neighborhoods.id,
      { onDelete: "set null" },
    ),
    governorate: text("governorate"),
    district: text("district"),
    neighborhood: text("neighborhood"),
    addressDetails: text("address_details"),
    latitude: numeric("latitude", { precision: 10, scale: 8, mode: "number" }),
    longitude: numeric("longitude", {
      precision: 11,
      scale: 8,
      mode: "number",
    }),
    locationLink: text("location_link"),
    ownerName: text("owner_name").notNull(),
    ownerPhone: text("owner_phone").notNull(),
    ownerNotes: text("owner_notes"),
    ownerPersonId: bigint("owner_person_id", { mode: "number" }).references(
      () => people.id,
      { onDelete: "set null" },
    ),
    status: text("status").notNull().default("available"),
    isNegotiable: boolean("is_negotiable").notNull().default(false),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
  },
  (table) => [
    index("idx_rentals_status").on(table.status),
    check(
      "rentals_location_range",
      sql`(${table.latitude} IS NULL AND ${table.longitude} IS NULL) OR (${table.latitude} IS NOT NULL AND ${table.longitude} IS NOT NULL AND ${table.latitude} BETWEEN -90 AND 90 AND ${table.longitude} BETWEEN -180 AND 180)`,
    ),
    index("idx_rentals_property_type").on(table.propertyType),
    index("idx_rentals_rent_period").on(table.rentPeriod),
    index("idx_rentals_rent_price").on(table.rentPrice),
    index("idx_rentals_area").on(table.areaValue),
    index("idx_rentals_governorate").on(table.governorate),
    index("idx_rentals_district").on(table.district),
    index("idx_rentals_neighborhood").on(table.neighborhood),
    index("idx_rentals_governorate_id").on(table.governorateId),
    index("idx_rentals_district_id").on(table.districtId),
    index("idx_rentals_neighborhood_id").on(table.neighborhoodId),
    // search_text and idx_rentals_search_text_trgm: migration 0003 only, as
    // for properties.
  ],
);

export const rentalImages = pgTable(
  "rental_images",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    rentalId: bigint("rental_id", { mode: "number" })
      .notNull()
      .references(() => rentals.id, { onDelete: "cascade" }),
    filePath: text("file_path").notNull(),
    originalName: text("original_name"),
    isPrimary: boolean("is_primary").notNull().default(false),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [index("idx_rental_images_rental").on(table.rentalId)],
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
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [index("idx_audit_entity").on(table.entityType, table.entityId)],
);

const TASK_STATUS_CHECK = sql.raw("('open', 'done', 'cancelled')");
const TASK_PRIORITY_CHECK = sql.raw("('low', 'normal', 'high', 'urgent')");

/**
 * The task columns every follow-up and activity has: a follow-up with a date
 * is a task due then (`scheduled_at`); one without is a logged interaction,
 * done when recorded. `user_id` is who recorded it, `assigned_user_id` who
 * must do it.
 */
const taskColumns = () => ({
  personId: bigint("person_id", { mode: "number" }).references(
    () => people.id,
    { onDelete: "set null" },
  ),
  assignedUserId: bigint("assigned_user_id", { mode: "number" }).references(
    () => users.id,
    { onDelete: "set null" },
  ),
  status: text("status").notNull().default("open"),
  priority: text("priority").notNull().default("normal"),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  outcome: text("outcome"),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

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
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    ...taskColumns(),
  },
  (table) => [
    index("idx_followups_property").on(table.propertyId),
    index("idx_followups_scheduled").on(table.scheduledAt),
    index("idx_followups_open_due").on(table.status, table.scheduledAt),
    index("idx_followups_assigned").on(table.assignedUserId),
    index("idx_followups_person").on(table.personId),
    check(
      "property_followups_status",
      sql`${table.status} in ${TASK_STATUS_CHECK}`,
    ),
    check(
      "property_followups_priority",
      sql`${table.priority} in ${TASK_PRIORITY_CHECK}`,
    ),
  ],
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
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [primaryKey({ columns: [table.userId, table.propertyId] })],
);

export const rentalFollowups = pgTable(
  "rental_followups",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    rentalId: bigint("rental_id", { mode: "number" })
      .notNull()
      .references(() => rentals.id, { onDelete: "cascade" }),
    userId: bigint("user_id", { mode: "number" }).references(() => users.id, {
      onDelete: "set null",
    }),
    type: text("type").notNull(),
    notes: text("notes"),
    scheduledAt: timestamp("scheduled_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    ...taskColumns(),
  },
  (table) => [
    index("idx_rental_followups_rental").on(table.rentalId),
    index("idx_rental_followups_scheduled").on(table.scheduledAt),
    index("idx_rental_followups_open_due").on(table.status, table.scheduledAt),
    index("idx_rental_followups_assigned").on(table.assignedUserId),
    index("idx_rental_followups_person").on(table.personId),
    check(
      "rental_followups_status",
      sql`${table.status} in ${TASK_STATUS_CHECK}`,
    ),
    check(
      "rental_followups_priority",
      sql`${table.priority} in ${TASK_PRIORITY_CHECK}`,
    ),
  ],
);

export const favoriteRentals = pgTable(
  "favorite_rentals",
  {
    userId: bigint("user_id", { mode: "number" })
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    rentalId: bigint("rental_id", { mode: "number" })
      .notNull()
      .references(() => rentals.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [primaryKey({ columns: [table.userId, table.rentalId] })],
);

export const rentalRequests = pgTable(
  "rental_requests",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    code: text("code").notNull().unique(),
    personId: bigint("person_id", { mode: "number" })
      .notNull()
      .references(() => people.id, { onDelete: "restrict" }),
    propertyType: text("property_type").notNull(),
    rentPeriod: text("rent_period"),
    budgetMin: numeric("budget_min", { precision: 18, scale: 2 }),
    budgetMax: numeric("budget_max", { precision: 18, scale: 2 }),
    areaUnit: text("area_unit"),
    areaMin: numeric("area_min", { precision: 14, scale: 2 }),
    areaMax: numeric("area_max", { precision: 14, scale: 2 }),
    floorsCount: integer("floors_count"),
    roomsCount: integer("rooms_count"),
    bathroomsCount: integer("bathrooms_count"),
    governorateId: bigint("governorate_id", { mode: "number" }).references(
      () => governorates.id,
      { onDelete: "set null" },
    ),
    districtId: bigint("district_id", { mode: "number" }).references(
      () => districts.id,
      { onDelete: "set null" },
    ),
    neighborhoodId: bigint("neighborhood_id", { mode: "number" }).references(
      () => neighborhoods.id,
      { onDelete: "set null" },
    ),
    governorate: text("governorate"),
    district: text("district"),
    neighborhood: text("neighborhood"),
    amenities: jsonb("amenities").notNull().default({}),
    otherRequirements: text("other_requirements"),
    status: text("status").notNull().default("open"),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
  },
  (table) => [
    index("idx_rental_requests_person").on(table.personId),
    index("idx_rental_requests_property_type").on(table.propertyType),
    index("idx_rental_requests_rent_period").on(table.rentPeriod),
    index("idx_rental_requests_budget").on(table.budgetMax),
    index("idx_rental_requests_governorate").on(table.governorateId),
    index("idx_rental_requests_district").on(table.districtId),
    index("idx_rental_requests_neighborhood").on(table.neighborhoodId),
    index("idx_rental_requests_status").on(table.status),
  ],
);

export const purchaseRequests = pgTable(
  "purchase_requests",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    code: text("code").notNull().unique(),
    personId: bigint("person_id", { mode: "number" })
      .notNull()
      .references(() => people.id, { onDelete: "restrict" }),
    propertyType: text("property_type").notNull(),
    budgetMin: numeric("budget_min", { precision: 18, scale: 2 }),
    budgetMax: numeric("budget_max", { precision: 18, scale: 2 }),
    areaUnit: text("area_unit"),
    areaMin: numeric("area_min", { precision: 14, scale: 2 }),
    areaMax: numeric("area_max", { precision: 14, scale: 2 }),
    roomsCount: integer("rooms_count"),
    bathroomsCount: integer("bathrooms_count"),
    floorsCount: integer("floors_count"),
    governorateId: bigint("governorate_id", { mode: "number" }).references(
      () => governorates.id,
      { onDelete: "set null" },
    ),
    districtId: bigint("district_id", { mode: "number" }).references(
      () => districts.id,
      { onDelete: "set null" },
    ),
    neighborhoodId: bigint("neighborhood_id", { mode: "number" }).references(
      () => neighborhoods.id,
      { onDelete: "set null" },
    ),
    governorate: text("governorate"),
    district: text("district"),
    neighborhood: text("neighborhood"),
    amenities: jsonb("amenities").notNull().default({}),
    otherRequirements: text("other_requirements"),
    status: text("status").notNull().default("open"),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
  },
  (table) => [
    index("idx_purchase_requests_person").on(table.personId),
    index("idx_purchase_requests_property_type").on(table.propertyType),
    index("idx_purchase_requests_budget").on(table.budgetMax),
    index("idx_purchase_requests_governorate").on(table.governorateId),
    index("idx_purchase_requests_district").on(table.districtId),
    index("idx_purchase_requests_neighborhood").on(table.neighborhoodId),
    index("idx_purchase_requests_status").on(table.status),
  ],
);

/**
 * Customer activities and tasks that belong to no listing: a call or meeting
 * with the customer, or about one of their requests. Listing follow-ups stay
 * in their own tables; the tasks read model unions all three.
 */
export const activities = pgTable(
  "activities",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    userId: bigint("user_id", { mode: "number" }).references(() => users.id, {
      onDelete: "set null",
    }),
    type: text("type").notNull(),
    notes: text("notes"),
    scheduledAt: timestamp("scheduled_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    ...taskColumns(),
    // An activity always belongs to a customer.
    personId: bigint("person_id", { mode: "number" })
      .notNull()
      .references(() => people.id, { onDelete: "restrict" }),
    purchaseRequestId: bigint("purchase_request_id", {
      mode: "number",
    }).references(() => purchaseRequests.id, { onDelete: "set null" }),
    rentalRequestId: bigint("rental_request_id", {
      mode: "number",
    }).references(() => rentalRequests.id, { onDelete: "set null" }),
    /** A viewing, call or negotiation step of a deal. */
    dealId: bigint("deal_id", { mode: "number" }).references(
      (): AnyPgColumn => deals.id,
      { onDelete: "set null" },
    ),
  },
  (table) => [
    index("idx_activities_person").on(table.personId),
    index("idx_activities_deal").on(table.dealId),
    index("idx_activities_open_due").on(table.status, table.scheduledAt),
    index("idx_activities_assigned").on(table.assignedUserId),
    check("activities_status", sql`${table.status} in ${TASK_STATUS_CHECK}`),
    check(
      "activities_priority",
      sql`${table.priority} in ${TASK_PRIORITY_CHECK}`,
    ),
  ],
);

export const documentTypes = pgTable(
  "document_types",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    key: text("key").notNull().unique(),
    name: text("name").notNull(),
    transactionScope: text("transaction_scope").notNull().default("general"),
    isRequired: boolean("is_required").notNull().default(false),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("idx_document_types_scope").on(table.transactionScope),
    index("idx_document_types_active").on(table.isActive),
  ],
);

// ─── Contracts (agreements) ─────────────────────────────────────────────
// Named "agreements" because the retired contract system's names (contracts,
// contract_templates, studio_*) stay reserved for its untouched legacy rows
// (docs/CONTRACT_SYSTEM_REMOVAL_MAP.md).

const TEMPLATE_KEY_CHECK = sql.raw(
  "('sale', 'installment_sale', 'residential_rent', 'commercial_rent')",
);

/** One row per built-in template; definition null = the factory default. */
export const agreementTemplates = pgTable(
  "agreement_templates",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    templateKey: text("template_key").notNull().unique(),
    definition: jsonb("definition"),
    version: integer("version").notNull().default(0),
    factoryRevision: integer("factory_revision").notNull().default(1),
    updatedBy: bigint("updated_by", { mode: "number" }).references(
      () => users.id,
      { onDelete: "set null" },
    ),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    check(
      "agreement_templates_key",
      sql`${table.templateKey} in ${TEMPLATE_KEY_CHECK}`,
    ),
  ],
);

/** Every saved state of a template, including resets, for recovery. */
export const agreementTemplateVersions = pgTable(
  "agreement_template_versions",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    templateId: bigint("template_id", { mode: "number" })
      .notNull()
      .references(() => agreementTemplates.id, { onDelete: "cascade" }),
    version: integer("version").notNull(),
    definition: jsonb("definition"),
    changeType: text("change_type").notNull(),
    note: text("note"),
    createdBy: bigint("created_by", { mode: "number" }).references(
      () => users.id,
      { onDelete: "set null" },
    ),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("uq_agreement_template_versions").on(
      table.templateId,
      table.version,
    ),
    check(
      "agreement_template_versions_change",
      sql`${table.changeType} in ('saved', 'design_reset', 'full_reset', 'restored')`,
    ),
  ],
);

export const agreements = pgTable(
  "agreements",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    code: text("code").notNull().unique(),
    templateKey: text("template_key").notNull(),
    status: text("status").notNull().default("draft"),
    propertyId: bigint("property_id", { mode: "number" }).references(
      () => properties.id,
      { onDelete: "set null" },
    ),
    rentalId: bigint("rental_id", { mode: "number" }).references(
      () => rentals.id,
      { onDelete: "set null" },
    ),
    terms: jsonb("terms").notNull(),
    document: jsonb("document").notNull(),
    /** The template version the document was copied from. */
    templateVersion: integer("template_version").notNull().default(0),
    /** Bumped by every draft save; a save must name the one it edited. */
    draftRev: integer("draft_rev").notNull().default(1),
    /** Latest issued revision, 0 before the first issue. */
    currentRevision: integer("current_revision").notNull().default(0),
    issuedAt: timestamp("issued_at", { withTimezone: true }),
    issuedBy: bigint("issued_by", { mode: "number" }).references(
      () => users.id,
      { onDelete: "set null" },
    ),
    cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
    cancelledBy: bigint("cancelled_by", { mode: "number" }).references(
      () => users.id,
      { onDelete: "set null" },
    ),
    cancelReason: text("cancel_reason"),
    /** Why an issued contract was reopened; stored on the next revision. */
    amendReason: text("amend_reason"),
    createdBy: bigint("created_by", { mode: "number" }).references(
      () => users.id,
      { onDelete: "set null" },
    ),
    updatedBy: bigint("updated_by", { mode: "number" }).references(
      () => users.id,
      { onDelete: "set null" },
    ),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("idx_agreements_status").on(table.status),
    index("idx_agreements_template").on(table.templateKey),
    index("idx_agreements_property").on(table.propertyId),
    index("idx_agreements_rental").on(table.rentalId),
    index("idx_agreements_updated").on(table.updatedAt),
    check(
      "agreements_template_key",
      sql`${table.templateKey} in ${TEMPLATE_KEY_CHECK}`,
    ),
    check(
      "agreements_status",
      sql`${table.status} in ('draft', 'review', 'issued', 'cancelled')`,
    ),
    check(
      "agreements_one_listing",
      sql`${table.propertyId} is null or ${table.rentalId} is null`,
    ),
  ],
);

/** The customers in each role; their data at issue is in the revision. */
export const agreementParties = pgTable(
  "agreement_parties",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    agreementId: bigint("agreement_id", { mode: "number" })
      .notNull()
      .references(() => agreements.id, { onDelete: "cascade" }),
    role: text("role").notNull(),
    personId: bigint("person_id", { mode: "number" })
      .notNull()
      .references(() => people.id, { onDelete: "restrict" }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("uq_agreement_parties_role").on(table.agreementId, table.role),
    index("idx_agreement_parties_person").on(table.personId),
    check(
      "agreement_parties_role",
      sql`${table.role} in ('seller', 'buyer', 'landlord', 'tenant')`,
    ),
  ],
);

/**
 * An issued contract exactly as issued: the document, the terms, the linked
 * records' data, the resolved values and the logo. Never updated.
 */
export const agreementRevisions = pgTable(
  "agreement_revisions",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    agreementId: bigint("agreement_id", { mode: "number" })
      .notNull()
      .references(() => agreements.id, { onDelete: "restrict" }),
    revision: integer("revision").notNull(),
    templateKey: text("template_key").notNull(),
    document: jsonb("document").notNull(),
    terms: jsonb("terms").notNull(),
    context: jsonb("context").notNull(),
    values: jsonb("values").notNull(),
    logo: text("logo"),
    reason: text("reason"),
    issuedBy: bigint("issued_by", { mode: "number" }).references(
      () => users.id,
      { onDelete: "set null" },
    ),
    issuedAt: timestamp("issued_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("uq_agreement_revisions").on(table.agreementId, table.revision),
  ],
);

export const agreementExports = pgTable(
  "agreement_exports",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    agreementId: bigint("agreement_id", { mode: "number" })
      .notNull()
      .references(() => agreements.id, { onDelete: "cascade" }),
    /** null: exported as a draft */
    revision: integer("revision"),
    format: text("format").notNull(),
    fileName: text("file_name"),
    createdBy: bigint("created_by", { mode: "number" }).references(
      () => users.id,
      { onDelete: "set null" },
    ),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("idx_agreement_exports_agreement").on(table.agreementId),
    check(
      "agreement_exports_format",
      sql`${table.format} in ('pdf', 'docx', 'print')`,
    ),
  ],
);

// ─── Deals ───────────────────────────────────────────────────────────────
// An opportunity from first interest to contract and outcome: who buys (or
// rents) what from whom, at what price, at which stage.

export const DEAL_STAGES = [
  "new",
  "contacted",
  "qualified",
  "viewing_scheduled",
  "viewing_done",
  "negotiating",
  "agreed",
  "contract_preparation",
  "contract_issued",
  "won",
  "lost",
  "cancelled",
] as const;
const DEAL_STAGE_CHECK = sql.raw(
  `(${DEAL_STAGES.map((stage) => `'${stage}'`).join(", ")})`,
);

export const deals = pgTable(
  "deals",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    code: text("code").notNull().unique(),
    dealType: text("deal_type").notNull(),
    stage: text("stage").notNull().default("new"),
    priority: text("priority").notNull().default("normal"),
    title: text("title"),
    propertyId: bigint("property_id", { mode: "number" }).references(
      () => properties.id,
      { onDelete: "set null" },
    ),
    rentalId: bigint("rental_id", { mode: "number" }).references(
      () => rentals.id,
      { onDelete: "set null" },
    ),
    /** The buyer of a sale, the tenant of a rent. */
    clientPersonId: bigint("client_person_id", { mode: "number" })
      .notNull()
      .references(() => people.id, { onDelete: "restrict" }),
    /** The seller of a sale, the landlord of a rent. */
    ownerPersonId: bigint("owner_person_id", { mode: "number" }).references(
      () => people.id,
      { onDelete: "restrict" },
    ),
    assignedUserId: bigint("assigned_user_id", { mode: "number" }).references(
      () => users.id,
      { onDelete: "set null" },
    ),
    purchaseRequestId: bigint("purchase_request_id", {
      mode: "number",
    }).references(() => purchaseRequests.id, { onDelete: "set null" }),
    rentalRequestId: bigint("rental_request_id", {
      mode: "number",
    }).references(() => rentalRequests.id, { onDelete: "set null" }),
    agreementId: bigint("agreement_id", { mode: "number" }).references(
      () => agreements.id,
      { onDelete: "set null" },
    ),
    currency: text("currency").notNull().default("IQD"),
    askingPrice: numeric("asking_price", { precision: 18, scale: 2 }),
    agreedPrice: numeric("agreed_price", { precision: 18, scale: 2 }),
    expectedCommission: numeric("expected_commission", {
      precision: 18,
      scale: 2,
    }),
    expectedCloseDate: text("expected_close_date"),
    lostReason: text("lost_reason"),
    notes: text("notes"),
    stageChangedAt: timestamp("stage_changed_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    closedAt: timestamp("closed_at", { withTimezone: true }),
    createdBy: bigint("created_by", { mode: "number" }).references(
      () => users.id,
      { onDelete: "set null" },
    ),
    updatedBy: bigint("updated_by", { mode: "number" }).references(
      () => users.id,
      { onDelete: "set null" },
    ),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("idx_deals_stage").on(table.stage),
    index("idx_deals_client").on(table.clientPersonId),
    index("idx_deals_owner").on(table.ownerPersonId),
    index("idx_deals_assigned").on(table.assignedUserId),
    index("idx_deals_property").on(table.propertyId),
    index("idx_deals_rental").on(table.rentalId),
    index("idx_deals_agreement").on(table.agreementId),
    index("idx_deals_updated").on(table.updatedAt),
    check("deals_type", sql`${table.dealType} in ('sale', 'rent')`),
    check("deals_stage", sql`${table.stage} in ${DEAL_STAGE_CHECK}`),
    check("deals_priority", sql`${table.priority} in ${TASK_PRIORITY_CHECK}`),
    check("deals_currency", sql`${table.currency} in ('IQD', 'USD')`),
    // A sale deal is about a sale listing, a rent deal about a rental one.
    check(
      "deals_listing",
      sql`(${table.dealType} = 'sale' and ${table.rentalId} is null) or (${table.dealType} = 'rent' and ${table.propertyId} is null)`,
    ),
    check(
      "deals_parties",
      sql`${table.ownerPersonId} is null or ${table.ownerPersonId} <> ${table.clientPersonId}`,
    ),
    check(
      "deals_close_date",
      sql`${table.expectedCloseDate} is null or ${table.expectedCloseDate} ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'`,
    ),
  ],
);

/** Every stage move, with who made it and why. Never updated. */
export const dealStageHistory = pgTable(
  "deal_stage_history",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    dealId: bigint("deal_id", { mode: "number" })
      .notNull()
      .references(() => deals.id, { onDelete: "cascade" }),
    fromStage: text("from_stage"),
    toStage: text("to_stage").notNull(),
    reason: text("reason"),
    userId: bigint("user_id", { mode: "number" }).references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [index("idx_deal_stage_history_deal").on(table.dealId)],
);

/** Offers and counteroffers in a negotiation, in the deal's currency. */
export const dealOffers = pgTable(
  "deal_offers",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    dealId: bigint("deal_id", { mode: "number" })
      .notNull()
      .references(() => deals.id, { onDelete: "cascade" }),
    /** Who made it: the client (buyer/tenant) or the owner (seller/landlord). */
    party: text("party").notNull(),
    amount: numeric("amount", { precision: 18, scale: 2 }).notNull(),
    status: text("status").notNull().default("proposed"),
    notes: text("notes"),
    createdBy: bigint("created_by", { mode: "number" }).references(
      () => users.id,
      { onDelete: "set null" },
    ),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("idx_deal_offers_deal").on(table.dealId),
    check("deal_offers_party", sql`${table.party} in ('client', 'owner')`),
    check(
      "deal_offers_status",
      sql`${table.status} in ('proposed', 'countered', 'accepted', 'rejected', 'withdrawn')`,
    ),
    check("deal_offers_amount", sql`${table.amount} >= 0`),
  ],
);

export const identityDocuments = pgTable(
  "identity_documents",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    code: text("code").notNull().unique(),
    personId: bigint("person_id", { mode: "number" })
      .notNull()
      .references(() => people.id, { onDelete: "restrict" }),
    /** A signed copy or a supporting file of a contract. */
    agreementId: bigint("agreement_id", { mode: "number" }).references(
      () => agreements.id,
      { onDelete: "set null" },
    ),
    documentTypeId: bigint("document_type_id", { mode: "number" }).references(
      () => documentTypes.id,
      { onDelete: "set null" },
    ),
    documentName: text("document_name").notNull(),
    documentSide: text("document_side").notNull().default("unspecified"),
    documentNumber: text("document_number"),
    filePath: text("file_path").notNull(),
    fileType: text("file_type").notNull(),
    fileSize: bigint("file_size", { mode: "number" }),
    uploadedAt: timestamp("uploaded_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    status: text("status").notNull().default("active"),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("idx_identity_documents_person").on(table.personId),
    index("idx_identity_documents_type").on(table.documentTypeId),
    index("idx_identity_documents_status").on(table.status),
    index("idx_identity_documents_expires_at").on(table.expiresAt),
    index("idx_identity_documents_agreement").on(table.agreementId),
  ],
);

/**
 * The chart of accounts. A heading (`is_postable` false) groups accounts and
 * takes no postings; it may span both currencies (`currency` null). A posting
 * account has exactly one currency. `system_key` marks the default accounts
 * the ledger finds by key (`cash.IQD`, `client_funds.USD`): see
 * modules/accounting/default-chart.ts. The chart's other rules (a child has
 * its parent's type and currency, no cycles) are in accounting.rules.ts.
 */
export const accounts = pgTable(
  "accounts",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    code: text("code").notNull().unique(),
    name: text("name").notNull(),
    accountType: text("account_type").notNull(),
    parentId: bigint("parent_id", { mode: "number" }).references(
      (): AnyPgColumn => accounts.id,
      { onDelete: "restrict" },
    ),
    currency: text("currency"),
    isPostable: boolean("is_postable").notNull().default(true),
    systemKey: text("system_key").unique(),
    isActive: boolean("is_active").notNull().default(true),
    description: text("description"),
    createdBy: bigint("created_by", { mode: "number" }).references(
      () => users.id,
      { onDelete: "set null" },
    ),
    updatedBy: bigint("updated_by", { mode: "number" }).references(
      () => users.id,
      { onDelete: "set null" },
    ),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("idx_accounts_parent").on(table.parentId),
    check(
      "accounts_type",
      sql`${table.accountType} in ('asset', 'liability', 'equity', 'revenue', 'expense')`,
    ),
    check(
      "accounts_currency",
      sql`${table.currency} is null or ${table.currency} in ('IQD', 'USD')`,
    ),
    check(
      "accounts_postable_currency",
      sql`not ${table.isPostable} or ${table.currency} is not null`,
    ),
    check("accounts_code", sql`${table.code} ~ '^[0-9]{1,10}$'`),
    check(
      "accounts_parent",
      sql`${table.parentId} is null or ${table.parentId} <> ${table.id}`,
    ),
  ],
);

export const officeProfiles = pgTable("office_profiles", {
  id: integer("id").primaryKey().default(1),
  companyName: text("company_name").notNull().default(""),
  ownerName: text("owner_name"),
  phonePrimary: text("phone_primary"),
  phoneSecondary: text("phone_secondary"),
  email: text("email"),
  address: text("address"),
  additionalContact: text("additional_contact"),
  licenseNumber: text("license_number"),
  logoFilePath: text("logo_file_path"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const backupJobs = pgTable("backup_jobs", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  type: text("type").notNull(),
  status: text("status").notNull(),
  filePath: text("file_path"),
  fileSize: bigint("file_size", { mode: "number" }),
  durationMs: integer("duration_ms"),
  error: text("error"),
  userId: bigint("user_id", { mode: "number" }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const backupLogs = pgTable("backup_logs", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  jobId: bigint("job_id", { mode: "number" }),
  level: text("level").notNull().default("info"),
  message: text("message").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const appSettings = pgTable("app_settings", {
  key: text("key").primaryKey(),
  value: jsonb("value"),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Person = typeof people.$inferSelect;
export type NewPerson = typeof people.$inferInsert;
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
export type Neighborhood = typeof neighborhoods.$inferSelect;
export type NewNeighborhood = typeof neighborhoods.$inferInsert;
export type PropertyImage = typeof propertyImages.$inferSelect;
export type NewPropertyImage = typeof propertyImages.$inferInsert;
export type Rental = typeof rentals.$inferSelect;
export type NewRental = typeof rentals.$inferInsert;
export type RentalImage = typeof rentalImages.$inferSelect;
export type NewRentalImage = typeof rentalImages.$inferInsert;
export type AuditLog = typeof auditLogs.$inferSelect;
export type NewAuditLog = typeof auditLogs.$inferInsert;
export type PropertyFollowup = typeof propertyFollowups.$inferSelect;
export type NewPropertyFollowup = typeof propertyFollowups.$inferInsert;
export type FavoriteProperty = typeof favoriteProperties.$inferSelect;
export type RentalFollowup = typeof rentalFollowups.$inferSelect;
export type Activity = typeof activities.$inferSelect;
export type NewRentalFollowup = typeof rentalFollowups.$inferInsert;
export type FavoriteRental = typeof favoriteRentals.$inferSelect;
export type RentalRequest = typeof rentalRequests.$inferSelect;
export type NewRentalRequest = typeof rentalRequests.$inferInsert;
export type PurchaseRequest = typeof purchaseRequests.$inferSelect;
export type NewPurchaseRequest = typeof purchaseRequests.$inferInsert;
export type DocumentType = typeof documentTypes.$inferSelect;
export type NewDocumentType = typeof documentTypes.$inferInsert;
export type IdentityDocument = typeof identityDocuments.$inferSelect;
export type NewIdentityDocument = typeof identityDocuments.$inferInsert;
export type OfficeProfile = typeof officeProfiles.$inferSelect;
export type NewOfficeProfile = typeof officeProfiles.$inferInsert;
export type BackupJob = typeof backupJobs.$inferSelect;
export type NewBackupJob = typeof backupJobs.$inferInsert;
export type BackupLog = typeof backupLogs.$inferSelect;
export type AgreementTemplate = typeof agreementTemplates.$inferSelect;
export type Agreement = typeof agreements.$inferSelect;
export type AgreementRevision = typeof agreementRevisions.$inferSelect;
export type Deal = typeof deals.$inferSelect;
export type DealOffer = typeof dealOffers.$inferSelect;
export type AppSetting = typeof appSettings.$inferSelect;
export type Account = typeof accounts.$inferSelect;
