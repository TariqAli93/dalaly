import assert from "node:assert/strict";
import fs from "node:fs/promises";
import test from "node:test";
import { pool } from "../src/infrastructure/database/pool.js";
import { createProperty } from "../src/modules/properties/properties.repository.js";
import { propertyPayloadSchema } from "../src/modules/properties/properties.schema.js";
import { createPurchaseRequest } from "../src/modules/purchase-requests/purchase-requests.repository.js";
import { purchaseRequestPayloadSchema } from "../src/modules/purchase-requests/purchase-requests.schema.js";
import { createRentalRequest } from "../src/modules/rental-requests/rental-requests.repository.js";
import { rentalRequestPayloadSchema } from "../src/modules/rental-requests/rental-requests.schema.js";
import { createRental } from "../src/modules/rentals/rentals.repository.js";
import { rentalPayloadSchema } from "../src/modules/rentals/rentals.schema.js";
import { getRole, listRoles } from "../src/modules/roles/roles.repository.js";
import { getUser, listUsers } from "../src/modules/users/users.repository.js";
import { countQueries } from "./query-count.js";
import { removalTestContext } from "./removal-test-context.js";

type UserDto = NonNullable<Awaited<ReturnType<typeof getUser>>>;
type RoleDto = NonNullable<Awaited<ReturnType<typeof getRole>>>;

// Roles and permissions come back in no promised order; compare them sorted.
function sortedUser(user: UserDto) {
  return {
    ...user,
    roles: [...user.roles].sort((a, b) => a.id - b.id),
    role_ids: [...user.role_ids].sort((a, b) => a - b),
    permissions: [...user.permissions].sort((a, b) => a.key.localeCompare(b.key)),
  };
}

function sortedRole(role: RoleDto) {
  return { ...role, permission_ids: [...role.permission_ids].sort((a, b) => a - b) };
}

// Needs PostgreSQL (DB_* from .env); creates and drops its own dalaly_removal_test_* database.
test("lists and saves load related rows in a fixed number of queries", async (t) => {
  const ctx = await removalTestContext("queries");
  const ids = async (text: string, params: unknown[] = []) =>
    (await pool.query(text, params)).rows.map((r) => Number(r.id));
  try {
    // A retired permission granted to a role stays hidden from users and roles.
    const [retired] = await ids(
      "INSERT INTO permissions(key, name, module) VALUES ('contracts.legacy', 'قديم', 'contracts') RETURNING id",
    );
    const permissionIds = await ids("SELECT id FROM permissions WHERE id <> $1 ORDER BY id", [retired]);
    const roleIds = await ids(
      "INSERT INTO roles(name, description) VALUES ('مدخل بيانات', 'أ'), ('محاسب', NULL), ('مشرف', 'ج') RETURNING id",
    );
    const grants: Record<number, number[]> = {
      [roleIds[0]]: [...permissionIds.filter((_, i) => i % 2 === 0), retired],
      [roleIds[1]]: permissionIds.filter((_, i) => i % 3 === 0),
      [roleIds[2]]: [],
    };
    for (const [roleId, granted] of Object.entries(grants))
      for (const permissionId of granted)
        await pool.query("INSERT INTO role_permissions(role_id, permission_id) VALUES ($1, $2)", [roleId, permissionId]);
    const userIds = await ids(
      `INSERT INTO users(username, display_name, pin_hash, is_active)
       SELECT 'list_user_' || g, 'مستخدم ' || g, 'not-a-hash', g <> 5 FROM generate_series(1, 12) g RETURNING id`,
    );
    const userRoleIds = (index: number) =>
      [[], [roleIds[0]], [roleIds[0], roleIds[1]], [roleIds[1], roleIds[2]]][index % 4];
    for (const [index, userId] of userIds.entries())
      for (const roleId of userRoleIds(index))
        await pool.query("INSERT INTO user_roles(user_id, role_id) VALUES ($1, $2)", [userId, roleId]);
    const keyOf = new Map(
      (await pool.query("SELECT id, key FROM permissions")).rows.map((r) => [Number(r.id), r.key as string]),
    );

    await t.test("users: same users, roles and permissions as one user at a time", async () => {
      const { result: users, queries } = await countQueries(() => listUsers());
      assert.equal(users.length, userIds.length + 1, "the test users and the administrator");
      assert.deepEqual(
        users.map((user) => user.id),
        (await pool.query("SELECT id FROM users ORDER BY created_at DESC, id DESC")).rows.map((r) => Number(r.id)),
      );
      for (const user of users) assert.deepEqual(sortedUser(user), sortedUser((await getUser(user.id))!));

      for (const [index, userId] of userIds.entries()) {
        const user = users.find((candidate) => candidate.id === userId)!;
        const expectedRoles = [...userRoleIds(index)].sort((a, b) => a - b);
        const expectedKeys = [...new Set(expectedRoles.flatMap((roleId) => grants[roleId]))]
          .filter((id) => id !== retired)
          .map((id) => keyOf.get(id)!)
          .sort();
        assert.deepEqual(sortedUser(user).role_ids, expectedRoles);
        assert.deepEqual(sortedUser(user).permissions.map((p) => p.key), expectedKeys);
        assert.equal(user.is_active, index !== 4);
      }
      assert.ok(queries <= 3, `${queries} queries for ${users.length} users`);
    });

    await t.test("roles: same permissions as one role at a time", async () => {
      const { result: roles, queries } = await countQueries(() => listRoles());
      assert.equal(roles.length, roleIds.length + 1, "the test roles and Super Admin");
      for (const role of roles) assert.deepEqual(sortedRole(role), sortedRole((await getRole(role.id))!));
      for (const roleId of roleIds) {
        const role = roles.find((candidate) => candidate.id === roleId)!;
        assert.deepEqual(
          sortedRole(role).permission_ids,
          grants[roleId].filter((id) => id !== retired).sort((a, b) => a - b),
        );
      }
      assert.ok(queries <= 2, `${queries} queries for ${roles.length} roles`);
    });

    await t.test("saving with list locations reads their names in one query", async () => {
      const { rows: [place] } = await pool.query(
        `WITH g AS (INSERT INTO governorates(name) VALUES ('واسط') RETURNING id),
              d AS (INSERT INTO districts(governorate_id, name) SELECT id, 'الكوت' FROM g RETURNING id),
              n AS (INSERT INTO neighborhoods(district_id, name) SELECT id, 'حي الحسين' FROM d RETURNING id)
         SELECT g.id AS governorate_id, d.id AS district_id, n.id AS neighborhood_id FROM g, d, n`,
      );
      const listed = {
        governorate_id: Number(place.governorate_id),
        district_id: Number(place.district_id),
        neighborhood_id: Number(place.neighborhood_id),
      };
      const owner = { owner_name: "مالك", owner_phone: "07700000009" };
      const person = { person_id: ctx.people[0].id };
      // Called directly, not over HTTP, so only the save's own queries count.
      const targets: Array<[string, (extra: object) => Promise<Record<string, unknown> | null>]> = [
        [
          "property",
          (extra) =>
            createProperty(
              propertyPayloadSchema.parse({ property_type: "بيت", legal_type: "طابو ملك صرف", area_value: 200, area_unit: "متر", pricing_method: "سعر إجمالي مباشر", total_price: 90_000_000, ...owner, ...extra }),
              ctx.adminId,
            ),
        ],
        [
          "rental",
          (extra) =>
            createRental(
              rentalPayloadSchema.parse({ property_type: "house", rent_price: 500_000, rent_period: "monthly", area_value: 150, area_unit: "متر", ...owner, ...extra }),
              ctx.adminId,
            ),
        ],
        ["rental request", (extra) => createRentalRequest(rentalRequestPayloadSchema.parse({ ...person, property_type: "house", ...extra }))],
        ["purchase request", (extra) => createPurchaseRequest(purchaseRequestPayloadSchema.parse({ ...person, property_type: "بيت", ...extra }))],
      ];
      for (const [label, save] of targets) {
        const typed = await countQueries(() => save({}));
        const picked = await countQueries(() => save(listed));
        assert.equal(picked.result?.governorate, "واسط", label);
        assert.equal(picked.result?.district, "الكوت", label);
        assert.equal(picked.result?.neighborhood, "حي الحسين", label);
        assert.equal(picked.queries - typed.queries, 1, `${label}: ${typed.queries} typed, ${picked.queries} picked`);
      }
    });
  } finally {
    await ctx.close();
    await fs.rm(ctx.root, { recursive: true, force: true });
  }
});
