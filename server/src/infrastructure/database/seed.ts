/**
 * بذر قاعدة بيانات التطوير ببيانات تجريبية واقعية.
 *
 *   pnpm --filter @dalaly/server db:seed            # idempotent — يضيف الناقص فقط
 *   pnpm --filter @dalaly/server db:seed -- --reset # يمسح البيانات التجريبية أولاً
 *
 * يشغّل الـ migrations وصلاحيات النظام أولاً، ثم يبذر: أدوار، مستخدمين،
 * مواقع (محافظة/منطقة/حي)، عروض، متابعات، ومفضّلات.
 * لا يمسّ حساب المدير الأساسي ولا صلاحيات النظام.
 */
import { and, eq, inArray } from "drizzle-orm";
import pg from "pg";
import { config } from "../config.js";
import { db } from "./db.js";
import { pool } from "./pool.js";
import { runDatabaseMigrations } from "./run-migrations.js";
import {
  districts,
  companySettings,
  contractParties,
  contractTemplates,
  contracts,
  customers,
  documentTypes,
  documents,
  favoriteProperties,
  favoriteRentals,
  governorates,
  neighborhoods,
  permissions,
  properties,
  propertyImages,
  propertyFollowups,
  purchaseRequests,
  rentalFollowups,
  rentalImages,
  rentalRequests,
  rentals,
  rolePermissions,
  roles,
  users,
  userRoles,
} from "./schema.js";
import { hashPin } from "../../modules/auth/crypto.js";
import { bootstrapDefaultAdmin } from "../../modules/auth/auth.service.js";
import { seedSystemRbac } from "../../modules/rbac/rbac.service.js";
import { createProperty } from "../../modules/properties/properties.repository.js";
import { propertyPayloadSchema } from "../../modules/properties/properties.schema.js";
import {
  saveImageToDisk,
  saveRentalImageToDisk,
} from "../../modules/images/images.service.js";
import { saveManagedFile } from "../../modules/documents/documents.storage.js";
import { generateContract } from "../../modules/contracts/contracts.service.js";
import { DATABASE_NAME_PATTERN } from "../../modules/setup/setup.schema.js";
import { DuplicatePlotError } from "../../shared/errors.js";
import {
  SEED_LOCATIONS,
  SEED_COMPANY_SETTINGS,
  SEED_CONTRACTS,
  SEED_CUSTOMERS,
  SEED_DOCUMENTS,
  SEED_PROPERTIES,
  SEED_PURCHASE_REQUESTS,
  SEED_RENTAL_REQUESTS,
  SEED_RENTALS,
  SEED_ROLES,
  SEED_USERS,
} from "./seed.data.js";

const DAY_MS = 24 * 60 * 60 * 1000;
const DEMO_IMAGE_DATA =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";
const DEMO_DOCUMENT_DATA =
  "data:text/plain;base64,RGVtbyBEYWxhbHkgZG9jdW1lbnQ=";

type Counters = Record<string, number>;

type CustomerIndex = {
  byCode: Map<string, number>;
  byPhone: Map<string, number>;
};

const created: Counters = {};
const skipped: Counters = {};

function bump(counters: Counters, key: string) {
  counters[key] = (counters[key] ?? 0) + 1;
}

/**
 * يمسح البيانات التجريبية فقط: العروض وما يتعلق بها، المواقع، ومستخدمي
 * البذر. لا يحذف المدير الأساسي ولا الأدوار/الصلاحيات النظامية.
 */
async function resetSeedData() {
  const seedUsernames = SEED_USERS.map((user) => user.username);
  const seededContractCodes = SEED_CONTRACTS.map((contract) => contract.code);
  const seededDocumentCodes = SEED_DOCUMENTS.map((document) => document.code);
  const seededRentalCodes = SEED_RENTALS.map((rental) => rental.code);
  const seededRentalRequestCodes = SEED_RENTAL_REQUESTS.map(
    (request) => request.code,
  );
  const seededPurchaseRequestCodes = SEED_PURCHASE_REQUESTS.map(
    (request) => request.code,
  );
  const seededCustomerCodes = SEED_CUSTOMERS.map((customer) => customer.code);

  const seededContracts = await db
    .select({ id: contracts.id })
    .from(contracts)
    .where(inArray(contracts.code, seededContractCodes));
  if (seededContracts.length) {
    await db.delete(contractParties).where(
      inArray(
        contractParties.contractId,
        seededContracts.map((row) => row.id),
      ),
    );
  }
  await db
    .delete(contracts)
    .where(inArray(contracts.code, seededContractCodes));
  await db
    .delete(documents)
    .where(inArray(documents.code, seededDocumentCodes));
  await db
    .delete(rentalRequests)
    .where(inArray(rentalRequests.code, seededRentalRequestCodes));
  await db
    .delete(purchaseRequests)
    .where(inArray(purchaseRequests.code, seededPurchaseRequestCodes));
  await db.delete(rentals).where(inArray(rentals.code, seededRentalCodes));
  await db
    .delete(customers)
    .where(inArray(customers.code, seededCustomerCodes));

  // الحذف بالترتيب الآمن — بقية الجداول مرتبطة بـ ON DELETE CASCADE.
  await db.delete(favoriteProperties);
  await db.delete(propertyFollowups);
  await db.delete(properties);
  await db.delete(neighborhoods);
  await db.delete(districts);
  await db.delete(governorates);
  await db.delete(users).where(inArray(users.username, seedUsernames));
  await db.delete(roles).where(
    inArray(
      roles.name,
      SEED_ROLES.map((role) => role.name),
    ),
  );

  console.log("↺ تم مسح البيانات التجريبية السابقة.");
}

/** ينشئ الأدوار التجريبية ويربطها بصلاحياتها (بدون تكرار). */
async function seedRoles() {
  const permissionRows = await db
    .select({ id: permissions.id, key: permissions.key })
    .from(permissions);
  const permissionIdByKey = new Map(
    permissionRows.map((row) => [row.key, row.id]),
  );

  for (const role of SEED_ROLES) {
    const [row] = await db
      .insert(roles)
      .values({
        name: role.name,
        description: role.description,
        isSystem: false,
      })
      .onConflictDoUpdate({
        target: roles.name,
        set: { description: role.description, updatedAt: new Date() },
      })
      .returning({ id: roles.id });

    for (const key of role.permissions) {
      const permissionId = permissionIdByKey.get(key);
      if (!permissionId) {
        console.warn(`  ⚠ صلاحية غير معروفة في بيانات البذر: ${key}`);
        continue;
      }
      await db
        .insert(rolePermissions)
        .values({ roleId: row.id, permissionId })
        .onConflictDoNothing();
    }

    bump(created, "roles");
  }
}

/** ينشئ المستخدمين التجريبيين ويربطهم بأدوارهم. يتخطى الموجود مسبقاً. */
async function seedUsers() {
  const roleRows = await db
    .select({ id: roles.id, name: roles.name })
    .from(roles);
  const roleIdByName = new Map(roleRows.map((row) => [row.name, row.id]));
  const userIdByUsername = new Map<string, number>();

  for (const user of SEED_USERS) {
    const [existing] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.username, user.username))
      .limit(1);

    let userId = existing?.id;
    if (userId) {
      bump(skipped, "users");
    } else {
      const [row] = await db
        .insert(users)
        .values({
          username: user.username,
          displayName: user.displayName,
          pinHash: await hashPin(user.pin),
        })
        .returning({ id: users.id });
      userId = row.id;
      bump(created, "users");
    }

    userIdByUsername.set(user.username, userId);

    for (const roleName of user.roles) {
      const roleId = roleIdByName.get(roleName);
      if (!roleId) continue;
      await db
        .insert(userRoles)
        .values({ userId, roleId })
        .onConflictDoNothing();
    }
  }

  return userIdByUsername;
}

async function seedCustomers(): Promise<CustomerIndex> {
  const byCode = new Map<string, number>();
  const byPhone = new Map<string, number>();

  for (const customer of SEED_CUSTOMERS) {
    const [existing] = await db
      .select({ id: customers.id })
      .from(customers)
      .where(eq(customers.code, customer.code))
      .limit(1);

    let customerId = existing?.id;
    if (customerId) {
      bump(skipped, "customers");
    } else {
      const [createdCustomer] = await db
        .insert(customers)
        .values({
          code: customer.code,
          fullName: customer.fullName,
          phonePrimary: customer.phonePrimary,
          phoneSecondary: customer.phoneSecondary ?? null,
          email: customer.email ?? null,
          address: customer.address ?? null,
          nationalId: customer.nationalId ?? null,
          customerType: customer.customerType,
          status: customer.status,
          notes: customer.notes ?? null,
        })
        .returning({ id: customers.id });
      customerId = createdCustomer.id;
      bump(created, "customers");
    }

    byCode.set(customer.code, customerId);
    byPhone.set(customer.phonePrimary, customerId);
  }

  return { byCode, byPhone };
}

type LocationIndex = Map<
  string,
  { governorateId: number; districtId: number; neighborhoodId: number }
>;

function locationKey(
  governorate: string,
  district: string,
  neighborhood: string,
) {
  return `${governorate}|${district}|${neighborhood}`;
}

/** يبذر المحافظات/المناطق/الأحياء ويرجع فهرساً بالاسم → المعرّفات. */
async function seedLocations(): Promise<LocationIndex> {
  const index: LocationIndex = new Map();

  for (const governorate of SEED_LOCATIONS) {
    const [existingGovernorate] = await db
      .select({ id: governorates.id })
      .from(governorates)
      .where(eq(governorates.name, governorate.name))
      .limit(1);

    let governorateId = existingGovernorate?.id;
    if (governorateId) {
      bump(skipped, "governorates");
    } else {
      const [row] = await db
        .insert(governorates)
        .values({ name: governorate.name })
        .returning({ id: governorates.id });
      governorateId = row.id;
      bump(created, "governorates");
    }

    for (const district of governorate.districts) {
      const districtId = await ensureDistrict(governorateId, district.name);

      for (const neighborhoodName of district.neighborhoods) {
        const neighborhoodId = await ensureNeighborhood(
          districtId,
          neighborhoodName,
        );

        index.set(
          locationKey(governorate.name, district.name, neighborhoodName),
          {
            governorateId,
            districtId,
            neighborhoodId,
          },
        );
      }
    }
  }

  return index;
}

/** يُنشئ منطقة تحت محافظة إن لم تكن موجودة، ويرجع معرّفها. */
async function ensureDistrict(governorateId: number, name: string) {
  const [existing] = await db
    .select({ id: districts.id })
    .from(districts)
    .where(
      and(eq(districts.governorateId, governorateId), eq(districts.name, name)),
    )
    .limit(1);

  if (existing) {
    bump(skipped, "districts");
    return existing.id;
  }

  const [row] = await db
    .insert(districts)
    .values({ governorateId, name })
    .returning({ id: districts.id });
  bump(created, "districts");
  return row.id;
}

/** يُنشئ حياً تحت منطقة إن لم يكن موجوداً، ويرجع معرّفه. */
async function ensureNeighborhood(districtId: number, name: string) {
  const [existing] = await db
    .select({ id: neighborhoods.id })
    .from(neighborhoods)
    .where(
      and(
        eq(neighborhoods.districtId, districtId),
        eq(neighborhoods.name, name),
      ),
    )
    .limit(1);

  if (existing) {
    bump(skipped, "neighborhoods");
    return existing.id;
  }

  const [row] = await db
    .insert(neighborhoods)
    .values({ districtId, name })
    .returning({ id: neighborhoods.id });
  bump(created, "neighborhoods");
  return row.id;
}

/**
 * يبذر العروض عبر repository الحقيقي حتى نحصل على توليد الكود، حساب السعر،
 * فحص تكرار القطعة، وسجل التغييرات — تماماً كما لو أُدخلت من الواجهة.
 */
async function seedProperties(
  locationIndex: LocationIndex,
  userIdByUsername: Map<string, number>,
  customerIndex: CustomerIndex,
) {
  const authorIds = [...userIdByUsername.values()];
  const createdIds: number[] = [];

  for (const [position, seed] of SEED_PROPERTIES.entries()) {
    const location = locationIndex.get(
      locationKey(
        seed.location.governorate,
        seed.location.district,
        seed.location.neighborhood,
      ),
    );

    if (!location) {
      console.warn(
        `  ⚠ موقع غير موجود في بيانات البذر: ${seed.location.governorate}/${seed.location.district}/${seed.location.neighborhood}`,
      );
      continue;
    }

    const payload = propertyPayloadSchema.parse({
      ...seed.payload,
      governorate_id: location.governorateId,
      district_id: location.districtId,
      neighborhood_id: location.neighborhoodId,
      owner_customer_id:
        seed.payload.owner_customer_id ??
        customerIndex.byPhone.get(String(seed.payload.owner_phone)),
    });

    const userId = authorIds[position % Math.max(authorIds.length, 1)];

    try {
      // createProperty ترجع الشكل الـ API (snake_case) بنوع عام، والمعرّف رقم.
      const property = (await createProperty(payload, userId)) as {
        id: number;
      };
      createdIds.push(property.id);
      bump(created, "properties");

      // العرض المؤرشف يحتاج تاريخ أرشفة ليظهر بشكل صحيح في الواجهة.
      if (payload.status === "archived") {
        await db
          .update(properties)
          .set({ archivedAt: new Date() })
          .where(eq(properties.id, property.id));
      }

      for (const followup of seed.followups ?? []) {
        await db.insert(propertyFollowups).values({
          propertyId: property.id,
          userId,
          type: followup.type,
          notes: followup.notes,
          scheduledAt:
            followup.inDays === undefined
              ? null
              : new Date(Date.now() + followup.inDays * DAY_MS),
        });
        bump(created, "followups");
      }
    } catch (error) {
      // العرض موجود مسبقاً بنفس هوية القطعة — البذر idempotent فنتخطاه.
      if (error instanceof DuplicatePlotError) {
        const [existing] = await db
          .select({ id: properties.id })
          .from(properties)
          .where(
            and(
              eq(properties.ownerPhone, String(payload.owner_phone)),
              eq(properties.plotNumber, String(payload.plot_number)),
            ),
          )
          .limit(1);
        if (existing) createdIds.push(existing.id);
        bump(skipped, "properties");
        continue;
      }
      throw error;
    }
  }

  return createdIds;
}

async function seedPropertyImages(propertyIds: number[]) {
  for (const propertyId of propertyIds) {
    const [existing] = await db
      .select({ id: propertyImages.id })
      .from(propertyImages)
      .where(eq(propertyImages.propertyId, propertyId))
      .limit(1);
    if (existing) {
      bump(skipped, "property_images");
      continue;
    }

    const stored = saveImageToDisk(
      propertyId,
      DEMO_IMAGE_DATA,
      "demo-property.png",
    );
    await db.insert(propertyImages).values({
      propertyId,
      filePath: stored.filePath,
      originalName: "demo-property.png",
      isPrimary: true,
      sortOrder: 1,
    });
    bump(created, "property_images");
  }
}

async function seedRentals(
  locationIndex: LocationIndex,
  customerIndex: CustomerIndex,
  userIdByUsername: Map<string, number>,
) {
  const [fallbackUserId] = [...userIdByUsername.values()];
  const rentalIds: number[] = [];

  for (const seed of SEED_RENTALS) {
    const [existing] = await db
      .select({ id: rentals.id })
      .from(rentals)
      .where(eq(rentals.code, seed.code))
      .limit(1);

    let rentalId = existing?.id;
    if (rentalId) {
      bump(skipped, "rentals");
    } else {
      const location = locationIndex.get(
        locationKey(
          seed.location.governorate,
          seed.location.district,
          seed.location.neighborhood,
        ),
      );
      const customerId = customerIndex.byCode.get(seed.customerCode);
      if (!location || !customerId) continue;

      const [row] = await db
        .insert(rentals)
        .values({
          code: seed.code,
          name: `${seed.propertyType} - ${seed.location.district}`,
          propertyType: seed.propertyType,
          rentPrice: String(seed.rentPrice),
          rentPeriod: seed.rentPeriod,
          areaValue: String(seed.areaValue),
          areaUnit: seed.areaUnit,
          floorsCount: seed.floorsCount ?? null,
          roomsCount: seed.roomsCount ?? null,
          bathroomsCount: seed.bathroomsCount ?? null,
          amenities: seed.amenities,
          otherDetails: seed.otherDetails ?? null,
          governorateId: location.governorateId,
          districtId: location.districtId,
          neighborhoodId: location.neighborhoodId,
          governorate: seed.location.governorate,
          district: seed.location.district,
          neighborhood: seed.location.neighborhood,
          addressDetails: seed.addressDetails ?? null,
          ownerName:
            SEED_CUSTOMERS.find(
              (customer) => customer.code === seed.customerCode,
            )?.fullName ?? "مالك تجريبي",
          ownerPhone:
            SEED_CUSTOMERS.find(
              (customer) => customer.code === seed.customerCode,
            )?.phonePrimary ?? "07700000000",
          ownerCustomerId: customerId,
          status: seed.status,
          isNegotiable: seed.isNegotiable,
          notes: seed.notes ?? null,
        })
        .returning({ id: rentals.id });
      rentalId = row.id;
      bump(created, "rentals");
    }

    rentalIds.push(rentalId);

    const [image] = await db
      .select({ id: rentalImages.id })
      .from(rentalImages)
      .where(eq(rentalImages.rentalId, rentalId))
      .limit(1);
    if (!image) {
      const stored = saveRentalImageToDisk(
        rentalId,
        DEMO_IMAGE_DATA,
        "demo-rental.png",
      );
      await db.insert(rentalImages).values({
        rentalId,
        filePath: stored.filePath,
        originalName: "demo-rental.png",
        isPrimary: true,
        sortOrder: 1,
      });
      bump(created, "rental_images");
    } else {
      bump(skipped, "rental_images");
    }

    for (const followup of seed.followups ?? []) {
      const [existingFollowup] = await db
        .select({ id: rentalFollowups.id })
        .from(rentalFollowups)
        .where(
          and(
            eq(rentalFollowups.rentalId, rentalId),
            eq(rentalFollowups.notes, followup.notes),
          ),
        )
        .limit(1);
      if (existingFollowup) {
        bump(skipped, "rental_followups");
        continue;
      }
      await db.insert(rentalFollowups).values({
        rentalId,
        userId: fallbackUserId ?? null,
        type: followup.type,
        notes: followup.notes,
        scheduledAt:
          followup.inDays === undefined
            ? null
            : new Date(Date.now() + followup.inDays * DAY_MS),
      });
      bump(created, "rental_followups");
    }
  }

  return rentalIds;
}

/** يضيف بعض المفضّلات لكل مستخدم تجريبي. */
async function seedFavorites(
  userIdByUsername: Map<string, number>,
  propertyIds: number[],
) {
  if (!propertyIds.length) return;

  const userIds = [...userIdByUsername.values()];
  for (const [position, userId] of userIds.entries()) {
    for (const propertyId of propertyIds.slice(position, position + 2)) {
      await db
        .insert(favoriteProperties)
        .values({ userId, propertyId })
        .onConflictDoNothing();
      bump(created, "favorites");
    }
  }
}

async function seedRentalFavorites(
  userIdByUsername: Map<string, number>,
  rentalIds: number[],
) {
  const userIds = [...userIdByUsername.values()];
  for (const [position, userId] of userIds.entries()) {
    for (const rentalId of rentalIds.slice(position, position + 2)) {
      await db
        .insert(favoriteRentals)
        .values({ userId, rentalId })
        .onConflictDoNothing();
      bump(created, "rental_favorites");
    }
  }
}

function getLocation(
  locationIndex: LocationIndex,
  location: { governorate: string; district: string; neighborhood: string },
) {
  return locationIndex.get(
    locationKey(location.governorate, location.district, location.neighborhood),
  );
}

async function seedRentalRequests(
  locationIndex: LocationIndex,
  customerIndex: CustomerIndex,
) {
  for (const seed of SEED_RENTAL_REQUESTS) {
    const [existing] = await db
      .select({ id: rentalRequests.id })
      .from(rentalRequests)
      .where(eq(rentalRequests.code, seed.code))
      .limit(1);
    if (existing) {
      bump(skipped, "rental_requests");
      continue;
    }

    const customerId = customerIndex.byCode.get(seed.customerCode);
    const location = getLocation(locationIndex, seed.location);
    if (!customerId || !location) continue;

    await db.insert(rentalRequests).values({
      code: seed.code,
      customerId,
      propertyType: seed.propertyType,
      rentPeriod: seed.rentPeriod ?? null,
      budgetMin: seed.budgetMin == null ? null : String(seed.budgetMin),
      budgetMax: seed.budgetMax == null ? null : String(seed.budgetMax),
      areaUnit: seed.areaUnit ?? null,
      areaMin: seed.areaMin == null ? null : String(seed.areaMin),
      areaMax: seed.areaMax == null ? null : String(seed.areaMax),
      roomsCount: seed.roomsCount ?? null,
      bathroomsCount: seed.bathroomsCount ?? null,
      floorsCount: null,
      governorateId: location.governorateId,
      districtId: location.districtId,
      neighborhoodId: location.neighborhoodId,
      governorate: seed.location.governorate,
      district: seed.location.district,
      neighborhood: seed.location.neighborhood,
      amenities: seed.amenities,
      otherRequirements: seed.otherRequirements ?? null,
      status: seed.status,
      notes: seed.notes ?? null,
    });
    bump(created, "rental_requests");
  }
}

async function seedPurchaseRequests(
  locationIndex: LocationIndex,
  customerIndex: CustomerIndex,
) {
  for (const seed of SEED_PURCHASE_REQUESTS) {
    const [existing] = await db
      .select({ id: purchaseRequests.id })
      .from(purchaseRequests)
      .where(eq(purchaseRequests.code, seed.code))
      .limit(1);
    if (existing) {
      bump(skipped, "purchase_requests");
      continue;
    }

    const customerId = customerIndex.byCode.get(seed.customerCode);
    const location = getLocation(locationIndex, seed.location);
    if (!customerId || !location) continue;

    await db.insert(purchaseRequests).values({
      code: seed.code,
      customerId,
      propertyType: seed.propertyType,
      budgetMin: seed.budgetMin == null ? null : String(seed.budgetMin),
      budgetMax: seed.budgetMax == null ? null : String(seed.budgetMax),
      areaUnit: seed.areaUnit ?? null,
      areaMin: seed.areaMin == null ? null : String(seed.areaMin),
      areaMax: seed.areaMax == null ? null : String(seed.areaMax),
      roomsCount: seed.roomsCount ?? null,
      bathroomsCount: seed.bathroomsCount ?? null,
      floorsCount: null,
      governorateId: location.governorateId,
      districtId: location.districtId,
      neighborhoodId: location.neighborhoodId,
      governorate: seed.location.governorate,
      district: seed.location.district,
      neighborhood: seed.location.neighborhood,
      amenities: seed.amenities,
      otherRequirements: seed.otherRequirements ?? null,
      status: seed.status,
      notes: seed.notes ?? null,
    });
    bump(created, "purchase_requests");
  }
}

async function seedDocuments(customerIndex: CustomerIndex) {
  const typeRows = await db
    .select({ id: documentTypes.id, key: documentTypes.key })
    .from(documentTypes);
  const typeIds = new Map(typeRows.map((row) => [row.key, row.id]));

  for (const seed of SEED_DOCUMENTS) {
    const [existing] = await db
      .select({ id: documents.id })
      .from(documents)
      .where(eq(documents.code, seed.code))
      .limit(1);
    if (existing) {
      bump(skipped, "documents");
      continue;
    }

    const customerId = customerIndex.byCode.get(seed.customerCode);
    const documentTypeId = typeIds.get(seed.typeKey);
    if (!customerId || !documentTypeId) continue;

    const stored = saveManagedFile(
      `customers/${customerId}`,
      DEMO_DOCUMENT_DATA,
      seed.originalName,
      "text/plain",
    );
    await db.insert(documents).values({
      code: seed.code,
      customerId,
      documentTypeId,
      documentName: seed.name,
      filePath: stored.filePath,
      fileType: "text/plain",
      fileSize: stored.fileSize,
      expiresAt: new Date(seed.expiresAt),
      status: "active",
      notes: seed.notes,
    });
    bump(created, "documents");
  }
}

async function seedCompanySettings() {
  const [existing] = await db
    .select()
    .from(companySettings)
    .where(eq(companySettings.id, 1))
    .limit(1);

  if (!existing) {
    await db
      .insert(companySettings)
      .values({ id: 1, ...SEED_COMPANY_SETTINGS });
    bump(created, "company_settings");
    return;
  }

  if (!existing.companyName) {
    await db
      .update(companySettings)
      .set({ ...SEED_COMPANY_SETTINGS, updatedAt: new Date() })
      .where(eq(companySettings.id, 1));
    bump(created, "company_settings");
  } else {
    bump(skipped, "company_settings");
  }
}

async function seedContracts(customerIndex: CustomerIndex) {
  const templates = await db
    .select({
      id: contractTemplates.id,
      contractType: contractTemplates.contractType,
    })
    .from(contractTemplates);
  const templateIds = new Map(
    templates.map((template) => [template.contractType, template.id]),
  );

  for (const seed of SEED_CONTRACTS) {
    const [existing] = await db
      .select({ id: contracts.id })
      .from(contracts)
      .where(eq(contracts.code, seed.code))
      .limit(1);
    if (existing) {
      bump(skipped, "contracts");
      continue;
    }

    const primaryCustomerId = customerIndex.byCode.get(seed.customerCode);
    const partyRows: Array<{ customerId: number; role: string }> = [];
    for (const party of seed.parties) {
      const customerId = customerIndex.byCode.get(party.customerCode);
      if (customerId !== undefined)
        partyRows.push({ customerId, role: party.role });
    }
    const [rental] = await db
      .select({ id: rentals.id })
      .from(rentals)
      .where(eq(rentals.code, seed.rentalCode))
      .limit(1);
    const templateId = templateIds.get(seed.contractType);
    if (!primaryCustomerId || !rental || !templateId || !partyRows.length)
      continue;

    const [contract] = await db
      .insert(contracts)
      .values({
        code: seed.code,
        contractType: seed.contractType,
        primaryCustomerId,
        rentalId: rental.id,
        templateId,
        status: seed.status,
        contractDate: new Date(seed.startDate),
        startDate: new Date(seed.startDate),
        endDate: new Date(seed.endDate),
        amount: String(seed.amount),
        paymentInfo: { schedule: "annual" },
        notes: seed.notes,
      })
      .returning({ id: contracts.id });

    await db
      .insert(contractParties)
      .values(
        partyRows.map((party) => ({
          contractId: contract.id,
          customerId: party.customerId,
          role: party.role,
        })),
      );
    await generateContract(contract.id);
    bump(created, "contracts");
    bump(created, "contract_parties");
  }
}

/** بيانات الاتصال بالقاعدة الهدف، من DATABASE_URL أو متغيرات DB_*. */
function resolveTargetDatabase() {
  if (config.databaseUrl) {
    const url = new URL(config.databaseUrl);
    return {
      host: url.hostname,
      port: Number(url.port || 5432),
      user: decodeURIComponent(url.username),
      password: decodeURIComponent(url.password),
      database: decodeURIComponent(url.pathname.replace(/^\//, "")),
    };
  }

  return {
    host: config.db.host,
    port: config.db.port,
    user: config.db.user,
    password: config.db.password,
    database: config.db.database,
  };
}

/**
 * ينشئ قاعدة البيانات الهدف إن لم تكن موجودة — نفس ما يفعله First Run
 * Wizard — حتى يعمل `pnpm db:seed` على جهاز نظيف بدون خطوات يدوية.
 */
async function ensureDatabaseExists() {
  const target = resolveTargetDatabase();

  if (!DATABASE_NAME_PATTERN.test(target.database)) {
    throw new Error(
      `اسم قاعدة البيانات غير صالح: "${target.database}" (حروف وأرقام وشرطة سفلية فقط).`,
    );
  }

  // اتصال إداري مؤقت بقاعدة postgres لفحص/إنشاء القاعدة الهدف.
  const adminPool = new pg.Pool({
    host: target.host,
    port: target.port,
    user: target.user,
    password: target.password,
    database: "postgres",
    connectionTimeoutMillis: 5000,
  });

  try {
    const result = await adminPool.query(
      "select 1 from pg_database where datname = $1",
      [target.database],
    );

    if ((result.rowCount ?? 0) > 0) {
      console.log(`→ قاعدة البيانات "${target.database}" موجودة.`);
      return;
    }

    // لا يقبل CREATE DATABASE معاملات، لذا نعتمد على التحقق الصارم أعلاه.
    await adminPool.query(`CREATE DATABASE "${target.database}"`);
    console.log(`✚ أُنشئت قاعدة البيانات "${target.database}".`);
  } finally {
    await adminPool.end().catch(() => undefined);
  }
}

function report() {
  const keys = [...new Set([...Object.keys(created), ...Object.keys(skipped)])];
  console.log("\nملخص البذر:");
  for (const key of keys) {
    console.log(
      `  ${key.padEnd(14)} أُنشئ: ${created[key] ?? 0}  •  موجود مسبقاً: ${skipped[key] ?? 0}`,
    );
  }
}

async function main() {
  const shouldReset = process.argv.includes("--reset");

  await ensureDatabaseExists();

  console.log("→ تشغيل الـ migrations…");
  await runDatabaseMigrations();

  if (shouldReset) {
    await resetSeedData();
  }

  console.log("→ بذر صلاحيات وأدوار النظام…");
  await seedSystemRbac();
  await bootstrapDefaultAdmin();
  await seedRoles();

  console.log("→ بذر المستخدمين…");
  const userIdByUsername = await seedUsers();

  console.log("→ بذر العملاء…");
  const customerIndex = await seedCustomers();

  console.log("→ بذر المواقع…");
  const locationIndex = await seedLocations();

  console.log("→ بذر العروض والصور والمتابعات…");
  const propertyIds = await seedProperties(
    locationIndex,
    userIdByUsername,
    customerIndex,
  );
  await seedPropertyImages(propertyIds);
  await seedFavorites(userIdByUsername, propertyIds);

  console.log("→ بذر عروض الإيجار والصور والمتابعات…");
  const rentalIds = await seedRentals(
    locationIndex,
    customerIndex,
    userIdByUsername,
  );
  await seedRentalFavorites(userIdByUsername, rentalIds);

  console.log("→ بذر طلبات الإيجار والشراء…");
  await seedRentalRequests(locationIndex, customerIndex);
  await seedPurchaseRequests(locationIndex, customerIndex);

  console.log("→ بذر المستندات وإعدادات الشركة والعقود…");
  await seedDocuments(customerIndex);
  await seedCompanySettings();
  await seedContracts(customerIndex);

  report();
  console.log(
    `\n✓ اكتمل البذر. الدخول: ${config.admin.username}/${config.admin.pin}` +
      SEED_USERS.map((user) => `، ${user.username}/${user.pin}`).join(""),
  );
}

main()
  .then(async () => {
    await pool.end();
  })
  .catch(async (error) => {
    console.error("✗ فشل البذر:", error);
    await pool.end().catch(() => undefined);
    process.exit(1);
  });
