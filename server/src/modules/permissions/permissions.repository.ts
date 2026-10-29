import { asc, eq } from "drizzle-orm";
import { db } from "../../infrastructure/database/db.js";
import { permissions } from "../../infrastructure/database/schema.js";
import {
  getSuperAdminRole,
  setRolePermissionIds,
  getRolePermissionIds,
} from "../rbac/rbac.service.js";
import type { PermissionPayload } from "./permissions.schema.js";
import { isActivePermissionKey } from "../rbac/key-policy.js";
import { SYSTEM_PERMISSIONS } from "../rbac/rbac.constants.js";
import { DomainError } from "../../shared/errors.js";

const SYSTEM_KEYS = new Set<string>(SYSTEM_PERMISSIONS.map((item) => item.key));

/**
 * The routes check permissions by key, so a system permission renamed or
 * deleted here would silently lock its feature until the next startup's seed.
 */
async function assertCustomPermission(id: number) {
  const [row] = await db
    .select({ key: permissions.key })
    .from(permissions)
    .where(eq(permissions.id, id));
  if (row && SYSTEM_KEYS.has(row.key))
    throw new DomainError(400, "لا يمكن تعديل صلاحية نظامية أو حذفها.");
}

export async function listPermissions() {
  const rows = await db
    .select()
    .from(permissions)
    .orderBy(asc(permissions.module), asc(permissions.key));
  return rows
    .filter((row) => isActivePermissionKey(row.key))
    .map(toPermissionDto);
}

export async function createPermission(payload: PermissionPayload) {
  const [permission] = await db
    .insert(permissions)
    .values({
      key: payload.key,
      name: payload.name,
      description: payload.description ?? null,
      module: payload.module,
    })
    .returning();
  const superAdmin = await getSuperAdminRole();
  if (superAdmin) {
    const permissionIds = await getRolePermissionIds(superAdmin.id);
    await setRolePermissionIds(superAdmin.id, [
      ...new Set([...permissionIds, permission.id]),
    ]);
  }
  return toPermissionDto(permission);
}

export async function updatePermission(id: number, payload: PermissionPayload) {
  await assertCustomPermission(id);
  if (SYSTEM_KEYS.has(payload.key))
    throw new DomainError(400, "هذا المفتاح محجوز لصلاحية نظامية.");
  const [permission] = await db
    .update(permissions)
    .set({
      key: payload.key,
      name: payload.name,
      description: payload.description ?? null,
      module: payload.module,
      updatedAt: new Date(),
    })
    .where(eq(permissions.id, id))
    .returning();
  return permission ? toPermissionDto(permission) : null;
}

export async function deletePermission(id: number) {
  await assertCustomPermission(id);
  const [permission] = await db
    .delete(permissions)
    .where(eq(permissions.id, id))
    .returning();
  return permission ? toPermissionDto(permission) : null;
}

function toPermissionDto(permission: typeof permissions.$inferSelect) {
  return {
    id: permission.id,
    key: permission.key,
    name: permission.name,
    description: permission.description,
    module: permission.module,
    created_at: permission.createdAt,
    updated_at: permission.updatedAt,
  };
}
