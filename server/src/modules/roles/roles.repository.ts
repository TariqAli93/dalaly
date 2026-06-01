import { desc, eq } from "drizzle-orm";
import { db } from "../../infrastructure/database/db.js";
import { roles } from "../../infrastructure/database/schema.js";
import {
  grantAllPermissionsToRole,
  getRolePermissionIds,
  hasAnyUserWithRole,
  setRolePermissionIds
} from "../rbac/rbac.service.js";
import { SUPER_ADMIN_ROLE } from "../rbac/rbac.constants.js";
import type { RolePayload } from "./roles.schema.js";

export async function listRoles() {
  const rows = await db.select().from(roles).orderBy(desc(roles.createdAt), desc(roles.id));
  return Promise.all(rows.map(toRoleDto));
}

export async function getRole(id: number) {
  const [role] = await db.select().from(roles).where(eq(roles.id, id)).limit(1);
  return role ? toRoleDto(role) : null;
}

export async function createRole(payload: RolePayload) {
  const [role] = await db
    .insert(roles)
    .values({ name: payload.name, description: payload.description ?? null })
    .returning();
  return toRoleDto(role);
}

export async function updateRole(id: number, payload: RolePayload) {
  const [role] = await db
    .update(roles)
    .set({
      name: payload.name,
      description: payload.description ?? null,
      updatedAt: new Date()
    })
    .where(eq(roles.id, id))
    .returning();
  return role ? toRoleDto(role) : null;
}

export async function deleteRole(id: number) {
  const role = await getRawRole(id);
  if (!role) return null;
  if (role.name === SUPER_ADMIN_ROLE || role.isSystem) {
    throw new Error("لا يمكن حذف دور نظامي.");
  }
  if (await hasAnyUserWithRole(id)) {
    throw new Error("لا يمكن حذف دور مرتبط بمستخدمين.");
  }

  const [deleted] = await db.delete(roles).where(eq(roles.id, id)).returning();
  return deleted ? toRoleDto(deleted) : null;
}

export async function updateRolePermissions(id: number, permissionIds: number[]) {
  const role = await getRawRole(id);
  if (!role) return null;
  if (role.name === SUPER_ADMIN_ROLE) {
    await grantAllPermissionsToRole(id);
    return getRole(id);
  }

  await setRolePermissionIds(id, permissionIds);
  return getRole(id);
}

async function getRawRole(id: number) {
  const [role] = await db.select().from(roles).where(eq(roles.id, id)).limit(1);
  return role ?? null;
}

async function toRoleDto(role: typeof roles.$inferSelect) {
  return {
    id: role.id,
    name: role.name,
    description: role.description,
    is_system: role.isSystem,
    created_at: role.createdAt,
    updated_at: role.updatedAt,
    permission_ids: await getRolePermissionIds(role.id)
  };
}
