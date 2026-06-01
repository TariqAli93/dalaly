import { desc, eq } from "drizzle-orm";
import { db } from "../../infrastructure/database/db.js";
import { users } from "../../infrastructure/database/schema.js";
import { hashPin } from "../auth/crypto.js";
import {
  countActiveSuperAdmins,
  getSuperAdminRole,
  getUserRolesAndPermissions,
  setUserRoleIds,
  userIsSuperAdmin
} from "../rbac/rbac.service.js";
import type { CreateUserPayload, UpdateUserPayload } from "./users.schema.js";

export async function listUsers() {
  const rows = await db.select().from(users).orderBy(desc(users.createdAt), desc(users.id));
  return Promise.all(rows.map(toUserDto));
}

export async function getUser(id: number) {
  const [user] = await db.select().from(users).where(eq(users.id, id)).limit(1);
  return user ? toUserDto(user) : null;
}

export async function createUser(payload: CreateUserPayload) {
  const pinHash = await hashPin(payload.pin);
  const [user] = await db
    .insert(users)
    .values({
      username: payload.username,
      displayName: payload.display_name,
      pinHash,
      isActive: payload.is_active
    })
    .returning();

  await setUserRoleIds(user.id, payload.role_ids);
  return getUser(user.id);
}

export async function updateUser(id: number, payload: UpdateUserPayload, currentUserId: number) {
  if (id === currentUserId && !payload.is_active) {
    throw new Error("لا يمكن للمستخدم تعطيل نفسه.");
  }

  const superAdmin = await getSuperAdminRole();
  const removesSuperAdmin =
    superAdmin && !payload.role_ids.includes(superAdmin.id);
  if (
    (await userIsSuperAdmin(id)) &&
    (await countActiveSuperAdmins(id)) === 0 &&
    (!payload.is_active || removesSuperAdmin)
  ) {
    throw new Error("لا يمكن تعطيل أو إزالة دور آخر مستخدم Super Admin فعال.");
  }

  const updateData: Partial<typeof users.$inferInsert> = {
    username: payload.username,
    displayName: payload.display_name,
    isActive: payload.is_active,
    updatedAt: new Date()
  };

  if (payload.pin) {
    updateData.pinHash = await hashPin(payload.pin);
  }

  const [user] = await db.update(users).set(updateData).where(eq(users.id, id)).returning();
  if (!user) return null;

  await setUserRoleIds(user.id, payload.role_ids);
  return getUser(user.id);
}

export async function activateUser(id: number) {
  const [user] = await db
    .update(users)
    .set({ isActive: true, updatedAt: new Date() })
    .where(eq(users.id, id))
    .returning();
  return user ? toUserDto(user) : null;
}

export async function deactivateUser(id: number, currentUserId: number) {
  if (id === currentUserId) {
    throw new Error("لا يمكن للمستخدم تعطيل نفسه.");
  }

  if ((await userIsSuperAdmin(id)) && (await countActiveSuperAdmins(id)) === 0) {
    throw new Error("لا يمكن تعطيل آخر مستخدم Super Admin فعال.");
  }

  const [user] = await db
    .update(users)
    .set({ isActive: false, updatedAt: new Date() })
    .where(eq(users.id, id))
    .returning();
  return user ? toUserDto(user) : null;
}

export async function deleteUser(id: number, currentUserId: number) {
  if (id === currentUserId) {
    throw new Error("لا يمكن للمستخدم حذف نفسه.");
  }

  if ((await userIsSuperAdmin(id)) && (await countActiveSuperAdmins(id)) === 0) {
    throw new Error("لا يمكن حذف آخر مستخدم Super Admin فعال.");
  }

  const [user] = await db.delete(users).where(eq(users.id, id)).returning();
  return user ? toUserDto(user) : null;
}

async function toUserDto(user: typeof users.$inferSelect) {
  const { roles, permissions } = await getUserRolesAndPermissions(user.id);
  return {
    id: user.id,
    username: user.username,
    display_name: user.displayName,
    is_active: user.isActive,
    created_at: user.createdAt,
    updated_at: user.updatedAt,
    roles,
    role_ids: roles.map((role) => role.id),
    permissions
  };
}
