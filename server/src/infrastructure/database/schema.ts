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
  timestamp,
} from "drizzle-orm/pg-core";

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

export const customers = pgTable(
  "customers",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    code: text("code").notNull().unique(),
    fullName: text("full_name").notNull(),
    phonePrimary: text("phone_primary").notNull(),
    phoneSecondary: text("phone_secondary"),
    email: text("email"),
    address: text("address"),
    nationalId: text("national_id"),
    customerType: text("customer_type").notNull().default("individual"),
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
    index("idx_customers_full_name").on(table.fullName),
    index("idx_customers_phone_primary").on(table.phonePrimary),
    index("idx_customers_customer_type").on(table.customerType),
    index("idx_customers_status").on(table.status),
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
    ownerName: text("owner_name").notNull(),
    ownerPhone: text("owner_phone").notNull(),
    ownerNotes: text("owner_notes"),
    ownerCustomerId: bigint("owner_customer_id", { mode: "number" }).references(
      () => customers.id,
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
    index("idx_properties_type").on(table.propertyType),
    index("idx_properties_legal_type").on(table.legalType),
    index("idx_properties_area_unit").on(table.areaUnit),
    index("idx_properties_pricing_method").on(table.pricingMethod),
    index("idx_properties_district").on(table.district),
    index("idx_properties_governorate_id").on(table.governorateId),
    index("idx_properties_district_id").on(table.districtId),
    index("idx_properties_neighborhood_id").on(table.neighborhoodId),
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
    ownerName: text("owner_name").notNull(),
    ownerPhone: text("owner_phone").notNull(),
    ownerNotes: text("owner_notes"),
    ownerCustomerId: bigint("owner_customer_id", { mode: "number" }).references(
      () => customers.id,
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
  },
  (table) => [
    index("idx_followups_property").on(table.propertyId),
    index("idx_followups_scheduled").on(table.scheduledAt),
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
  },
  (table) => [
    index("idx_rental_followups_rental").on(table.rentalId),
    index("idx_rental_followups_scheduled").on(table.scheduledAt),
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
    customerId: bigint("customer_id", { mode: "number" })
      .notNull()
      .references(() => customers.id, { onDelete: "restrict" }),
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
    index("idx_rental_requests_customer").on(table.customerId),
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
    customerId: bigint("customer_id", { mode: "number" })
      .notNull()
      .references(() => customers.id, { onDelete: "restrict" }),
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
    index("idx_purchase_requests_customer").on(table.customerId),
    index("idx_purchase_requests_property_type").on(table.propertyType),
    index("idx_purchase_requests_budget").on(table.budgetMax),
    index("idx_purchase_requests_governorate").on(table.governorateId),
    index("idx_purchase_requests_district").on(table.districtId),
    index("idx_purchase_requests_neighborhood").on(table.neighborhoodId),
    index("idx_purchase_requests_status").on(table.status),
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

export const documents = pgTable(
  "documents",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    code: text("code").notNull().unique(),
    customerId: bigint("customer_id", { mode: "number" })
      .notNull()
      .references(() => customers.id, { onDelete: "restrict" }),
    documentTypeId: bigint("document_type_id", { mode: "number" }).references(
      () => documentTypes.id,
      { onDelete: "set null" },
    ),
    documentName: text("document_name").notNull(),
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
    index("idx_documents_customer").on(table.customerId),
    index("idx_documents_type").on(table.documentTypeId),
    index("idx_documents_status").on(table.status),
    index("idx_documents_expires_at").on(table.expiresAt),
  ],
);

export const companySettings = pgTable("company_settings", {
  id: integer("id").primaryKey().default(1),
  companyName: text("company_name").notNull().default(""),
  phonePrimary: text("phone_primary"),
  phoneSecondary: text("phone_secondary"),
  email: text("email"),
  address: text("address"),
  additionalContact: text("additional_contact"),
  logoFilePath: text("logo_file_path"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const contractTemplates = pgTable("contract_templates", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  contractType: text("contract_type").notNull().unique(),
  name: text("name").notNull(),
  body: text("body").notNull(),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const contracts = pgTable(
  "contracts",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    code: text("code").notNull().unique(),
    contractType: text("contract_type").notNull(),
    primaryCustomerId: bigint("primary_customer_id", {
      mode: "number",
    }).references(() => customers.id, { onDelete: "set null" }),
    propertyId: bigint("property_id", { mode: "number" }).references(
      () => properties.id,
      { onDelete: "set null" },
    ),
    rentalId: bigint("rental_id", { mode: "number" }).references(
      () => rentals.id,
      { onDelete: "set null" },
    ),
    templateId: bigint("template_id", { mode: "number" }).references(
      () => contractTemplates.id,
      { onDelete: "set null" },
    ),
    status: text("status").notNull().default("draft"),
    contractDate: timestamp("contract_date", { withTimezone: true })
      .notNull()
      .defaultNow(),
    startDate: timestamp("start_date", { withTimezone: true }),
    endDate: timestamp("end_date", { withTimezone: true }),
    amount: numeric("amount", { precision: 18, scale: 2 }),
    paymentInfo: jsonb("payment_info").notNull().default({}),
    notes: text("notes"),
    generatedContent: text("generated_content"),
    generatedAt: timestamp("generated_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("idx_contracts_type").on(table.contractType),
    index("idx_contracts_primary_customer").on(table.primaryCustomerId),
    index("idx_contracts_property").on(table.propertyId),
    index("idx_contracts_rental").on(table.rentalId),
    index("idx_contracts_status").on(table.status),
    index("idx_contracts_dates").on(table.contractDate, table.endDate),
  ],
);

export const contractParties = pgTable(
  "contract_parties",
  {
    contractId: bigint("contract_id", { mode: "number" })
      .notNull()
      .references(() => contracts.id, { onDelete: "cascade" }),
    customerId: bigint("customer_id", { mode: "number" })
      .notNull()
      .references(() => customers.id, { onDelete: "restrict" }),
    role: text("role").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.contractId, table.customerId, table.role] }),
    index("idx_contract_parties_customer").on(table.customerId),
  ],
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
export type Customer = typeof customers.$inferSelect;
export type NewCustomer = typeof customers.$inferInsert;
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
export type NewRentalFollowup = typeof rentalFollowups.$inferInsert;
export type FavoriteRental = typeof favoriteRentals.$inferSelect;
export type RentalRequest = typeof rentalRequests.$inferSelect;
export type NewRentalRequest = typeof rentalRequests.$inferInsert;
export type PurchaseRequest = typeof purchaseRequests.$inferSelect;
export type NewPurchaseRequest = typeof purchaseRequests.$inferInsert;
export type DocumentType = typeof documentTypes.$inferSelect;
export type NewDocumentType = typeof documentTypes.$inferInsert;
export type Document = typeof documents.$inferSelect;
export type NewDocument = typeof documents.$inferInsert;
export type CompanySettings = typeof companySettings.$inferSelect;
export type NewCompanySettings = typeof companySettings.$inferInsert;
export type ContractTemplate = typeof contractTemplates.$inferSelect;
export type NewContractTemplate = typeof contractTemplates.$inferInsert;
export type Contract = typeof contracts.$inferSelect;
export type NewContract = typeof contracts.$inferInsert;
export type ContractParty = typeof contractParties.$inferSelect;
export type NewContractParty = typeof contractParties.$inferInsert;
export type BackupJob = typeof backupJobs.$inferSelect;
export type NewBackupJob = typeof backupJobs.$inferInsert;
export type BackupLog = typeof backupLogs.$inferSelect;
export type AppSetting = typeof appSettings.$inferSelect;
