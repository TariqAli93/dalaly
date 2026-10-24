import { and, count, eq, inArray, ne } from "drizzle-orm";
import { db } from "../../infrastructure/database/db.js";
import {
  permissions,
  rolePermissions,
  roles,
  users,
  userRoles,
} from "../../infrastructure/database/schema.js";
import { SUPER_ADMIN_ROLE, SYSTEM_PERMISSIONS } from "./rbac.constants.js";
import { isActivePermissionKey } from "./key-policy.js";

export type AuthRole = {
  id: number;
  name: string;
  description: string | null;
  is_system: boolean;
};
export type AuthPermission = {
  id: number;
  key: string;
  name: string;
  description: string | null;
  module: string;
};

export async function seedSystemRbac(database: typeof db = db) {
  for (const permission of SYSTEM_PERMISSIONS) {
    await database
      .insert(permissions)
      .values({
        key: permission.key,
        name: permission.name,
        module: permission.module,
        description: null,
      })
      .onConflictDoUpdate({
        target: permissions.key,
        set: {
          name: permission.name,
          module: permission.module,
          updatedAt: new Date(),
        },
      });
  }

  const [superAdmin] = await database
    .insert(roles)
    .values({
      name: SUPER_ADMIN_ROLE,
      description: "يمتلك كل صلاحيات النظام.",
      isSystem: true,
    })
    .onConflictDoUpdate({
      target: roles.name,
      set: {
        isSystem: true,
        updatedAt: new Date(),
      },
    })
    .returning();

  await grantAllPermissionsToRole(superAdmin.id, database);
  return superAdmin;
}

export async function grantAllPermissionsToRole(
  roleId: number,
  database: typeof db = db,
) {
  const allPermissions = await database
    .select({ id: permissions.id, key: permissions.key })
    .from(permissions);
  for (const permission of allPermissions.filter((row) =>
    isActivePermissionKey(row.key),
  )) {
    await database
      .insert(rolePermissions)
      .values({ roleId, permissionId: permission.id })
      .onConflictDoNothing();
  }
}

export async function assignSuperAdminRole(userId: number) {
  const superAdmin = await getSuperAdminRole();
  if (!superAdmin) {
    throw new Error("Super Admin role is missing.");
  }

  await db
    .insert(userRoles)
    .values({ userId, roleId: superAdmin.id })
    .onConflictDoNothing();
}

export async function getSuperAdminRole() {
  const [role] = await db
    .select()
    .from(roles)
    .where(eq(roles.name, SUPER_ADMIN_ROLE))
    .limit(1);
  return role ?? null;
}

export async function getUserRolesAndPermissions(userId: number) {
  const roleRows = await db
    .select({
      id: roles.id,
      name: roles.name,
      description: roles.description,
      is_system: roles.isSystem,
    })
    .from(userRoles)
    .innerJoin(roles, eq(userRoles.roleId, roles.id))
    .where(eq(userRoles.userId, userId));

  const permissionRows = await db
    .select({
      id: permissions.id,
      key: permissions.key,
      name: permissions.name,
      description: permissions.description,
      module: permissions.module,
    })
    .from(userRoles)
    .innerJoin(rolePermissions, eq(userRoles.roleId, rolePermissions.roleId))
    .innerJoin(permissions, eq(rolePermissions.permissionId, permissions.id))
    .where(eq(userRoles.userId, userId));

  const permissionMap = new Map(
    permissionRows
      .filter((permission) => isActivePermissionKey(permission.key))
      .map((permission) => [permission.key, permission]),
  );

  return {
    roles: roleRows,
    permissions: [...permissionMap.values()],
  };
}

/**
 * أدوار وصلاحيات عدة مستخدمين باستعلامين مهما كان عددهم (قائمة المستخدمين)،
 * لكل مستخدم بنفس شكل getUserRolesAndPermissions.
 */
export async function getRolesAndPermissionsForUsers(userIds: number[]) {
  const access = new Map(
    userIds.map((id) => [
      id,
      {
        roles: [] as AuthRole[],
        permissions: new Map<string, AuthPermission>(),
      },
    ]),
  );
  if (userIds.length > 0) {
    const [roleRows, permissionRows] = await Promise.all([
      db
        .select({
          userId: userRoles.userId,
          id: roles.id,
          name: roles.name,
          description: roles.description,
          is_system: roles.isSystem,
        })
        .from(userRoles)
        .innerJoin(roles, eq(userRoles.roleId, roles.id))
        .where(inArray(userRoles.userId, userIds))
        .orderBy(userRoles.userId, roles.id),
      db
        .select({
          userId: userRoles.userId,
          id: permissions.id,
          key: permissions.key,
          name: permissions.name,
          description: permissions.description,
          module: permissions.module,
        })
        .from(userRoles)
        .innerJoin(
          rolePermissions,
          eq(userRoles.roleId, rolePermissions.roleId),
        )
        .innerJoin(
          permissions,
          eq(rolePermissions.permissionId, permissions.id),
        )
        .where(inArray(userRoles.userId, userIds))
        .orderBy(userRoles.userId, permissions.id),
    ]);
    for (const { userId, ...role } of roleRows)
      access.get(userId)?.roles.push(role);
    for (const { userId, ...permission } of permissionRows)
      if (isActivePermissionKey(permission.key))
        access.get(userId)?.permissions.set(permission.key, permission);
  }

  return new Map(
    [...access].map(([id, { roles, permissions }]) => [
      id,
      { roles, permissions: [...permissions.values()] },
    ]),
  );
}

export async function userHasPermission(userId: number, permissionKey: string) {
  if (!isActivePermissionKey(permissionKey)) return false;
  const [row] = await db
    .select({ count: count() })
    .from(userRoles)
    .innerJoin(rolePermissions, eq(userRoles.roleId, rolePermissions.roleId))
    .innerJoin(permissions, eq(rolePermissions.permissionId, permissions.id))
    .where(
      and(eq(userRoles.userId, userId), eq(permissions.key, permissionKey)),
    );

  return Number(row?.count ?? 0) > 0;
}

export async function setUserRoleIds(userId: number, roleIds: number[]) {
  await db.transaction(async (tx) => {
    await tx.delete(userRoles).where(eq(userRoles.userId, userId));
    if (roleIds.length) {
      await tx
        .insert(userRoles)
        .values(roleIds.map((roleId) => ({ userId, roleId })))
        .onConflictDoNothing();
    }
  });
}

export async function setRolePermissionIds(
  roleId: number,
  permissionIds: number[],
) {
  const activePermissions = permissionIds.length
    ? await db
        .select({ id: permissions.id, key: permissions.key })
        .from(permissions)
        .where(inArray(permissions.id, permissionIds))
    : [];
  const allowedPermissions = activePermissions.filter((row) =>
    isActivePermissionKey(row.key),
  );
  await db.transaction(async (tx) => {
    await tx.delete(rolePermissions).where(eq(rolePermissions.roleId, roleId));
    if (allowedPermissions.length) {
      await tx
        .insert(rolePermissions)
        .values(
          allowedPermissions.map(({ id }) => ({ roleId, permissionId: id })),
        )
        .onConflictDoNothing();
    }
  });
}

export async function getRolePermissionIds(roleId: number) {
  const rows = await db
    .select({
      permissionId: rolePermissions.permissionId,
      key: permissions.key,
    })
    .from(rolePermissions)
    .innerJoin(permissions, eq(rolePermissions.permissionId, permissions.id))
    .where(eq(rolePermissions.roleId, roleId));
  return rows
    .filter((row) => isActivePermissionKey(row.key))
    .map((row) => row.permissionId);
}

/** معرّفات صلاحيات عدة أدوار باستعلام واحد (قائمة الأدوار). */
export async function getPermissionIdsForRoles(roleIds: number[]) {
  const ids = new Map(roleIds.map((id) => [id, [] as number[]]));
  if (roleIds.length === 0) return ids;
  const rows = await db
    .select({
      roleId: rolePermissions.roleId,
      permissionId: rolePermissions.permissionId,
      key: permissions.key,
    })
    .from(rolePermissions)
    .innerJoin(permissions, eq(rolePermissions.permissionId, permissions.id))
    .where(inArray(rolePermissions.roleId, roleIds))
    .orderBy(rolePermissions.roleId, rolePermissions.permissionId);
  for (const row of rows)
    if (isActivePermissionKey(row.key))
      ids.get(row.roleId)?.push(row.permissionId);
  return ids;
}

export async function hasAnyUserWithRole(roleId: number) {
  const [row] = await db
    .select({ count: count() })
    .from(userRoles)
    .where(eq(userRoles.roleId, roleId));
  return Number(row?.count ?? 0) > 0;
}

export async function countActiveSuperAdmins(exceptUserId?: number) {
  const superAdmin = await getSuperAdminRole();
  if (!superAdmin) return 0;

  const where = [eq(userRoles.roleId, superAdmin.id), eq(users.isActive, true)];
  if (exceptUserId) {
    where.push(ne(users.id, exceptUserId));
  }

  const [row] = await db
    .select({ count: count() })
    .from(users)
    .innerJoin(userRoles, eq(userRoles.userId, users.id))
    .where(and(...where));

  return Number(row?.count ?? 0);
}

export async function userIsSuperAdmin(userId: number) {
  const superAdmin = await getSuperAdminRole();
  if (!superAdmin) return false;

  const [row] = await db
    .select({ count: count() })
    .from(userRoles)
    .where(
      and(eq(userRoles.userId, userId), eq(userRoles.roleId, superAdmin.id)),
    );
  return Number(row?.count ?? 0) > 0;
}
