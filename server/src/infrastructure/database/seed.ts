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
  favoriteProperties,
  governorates,
  neighborhoods,
  permissions,
  properties,
  propertyFollowups,
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
import { DATABASE_NAME_PATTERN } from "../../modules/setup/setup.schema.js";
import { DuplicatePlotError } from "../../shared/errors.js";
import {
  SEED_LOCATIONS,
  SEED_PROPERTIES,
  SEED_ROLES,
  SEED_USERS,
} from "./seed.data.js";

const DAY_MS = 24 * 60 * 60 * 1000;

type Counters = Record<string, number>;

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
        bump(skipped, "properties");
        continue;
      }
      throw error;
    }
  }

  return createdIds;
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

  console.log("→ بذر المواقع…");
  const locationIndex = await seedLocations();

  console.log("→ بذر العروض والمتابعات…");
  const propertyIds = await seedProperties(locationIndex, userIdByUsername);
  await seedFavorites(userIdByUsername, propertyIds);

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
