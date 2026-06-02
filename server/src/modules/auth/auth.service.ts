import { and, count, eq, gt, lte } from "drizzle-orm";
import { config } from "../../infrastructure/config.js";
import { db } from "../../infrastructure/database/db.js";
import { sessions, users, type User } from "../../infrastructure/database/schema.js";
import {
  assignSuperAdminRole,
  countActiveSuperAdmins,
  getUserRolesAndPermissions,
  type AuthPermission,
  type AuthRole
} from "../rbac/rbac.service.js";
import {
  createSessionToken,
  hashPin,
  hashSessionToken,
  verifyPin
} from "./crypto.js";

export type AuthUser = Pick<User, "id" | "username" | "displayName" | "isActive"> & {
  roles: AuthRole[];
  permissions: AuthPermission[];
};

export async function bootstrapDefaultAdmin() {
  const hasAdmin = await adminExists();
  if (!hasAdmin) {
    await createAdmin(config.admin.username, config.admin.pin);
    return;
  }

  const [firstUser] = await db.select().from(users).limit(1);
  if (firstUser) {
    await assignSuperAdminRole(firstUser.id);
    if ((await countActiveSuperAdmins()) === 0) {
      await db
        .update(users)
        .set({ isActive: true, updatedAt: new Date() })
        .where(eq(users.id, firstUser.id));
    }
  }
}

export async function adminExists() {
  const result = await db.select({ count: count() }).from(users);
  return Number(result[0]?.count ?? 0) > 0;
}

export async function getUserByUsername(username: string) {
  const [user] = await db
    .select({
      id: users.id,
      username: users.username,
      displayName: users.displayName,
      isActive: users.isActive
    })
    .from(users)
    .where(eq(users.username, username))
    .limit(1);
  return user ?? null;
}

export async function createAdmin(username: string, pin: string) {
  const pinHash = await hashPin(pin);
  const [user] = await db
    .insert(users)
    .values({ username, displayName: username, pinHash })
    .returning({
      id: users.id,
      username: users.username,
      displayName: users.displayName,
      isActive: users.isActive
    });
  await assignSuperAdminRole(user.id);
  return user;
}

export async function changePin(userId: number, currentPin: string, newPin: string) {
  const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!user) {
    return { ok: false as const, reason: "not_found" as const };
  }

  if (!(await verifyPin(currentPin, user.pinHash))) {
    return { ok: false as const, reason: "invalid_pin" as const };
  }

  const pinHash = await hashPin(newPin);
  await db
    .update(users)
    .set({ pinHash, updatedAt: new Date() })
    .where(eq(users.id, userId));

  return { ok: true as const };
}

export async function login(username: string, pin: string) {
  const [user] = await db
    .select()
    .from(users)
    .where(and(eq(users.username, username), eq(users.isActive, true)))
    .limit(1);

  if (!user || !(await verifyPin(pin, user.pinHash))) {
    return null;
  }

  const token = createSessionToken();
  const tokenHash = hashSessionToken(token);
  const expiresAt = new Date(Date.now() + config.sessionTtlHours * 60 * 60 * 1000);

  await db.insert(sessions).values({
    userId: user.id,
    tokenHash,
    expiresAt
  });

  return {
    token,
    expires_at: expiresAt.toISOString(),
    ...(await buildAuthPayload(user))
  };
}

export async function logout(token: string) {
  await db.delete(sessions).where(eq(sessions.tokenHash, hashSessionToken(token)));
}

export async function resolveSession(token: string): Promise<AuthUser | null> {
  const tokenHash = hashSessionToken(token);
  const [session] = await db
    .select({
      id: sessions.id,
      expiresAt: sessions.expiresAt,
      user: {
        id: users.id,
        username: users.username,
        displayName: users.displayName,
        isActive: users.isActive
      }
    })
    .from(sessions)
    .innerJoin(users, eq(sessions.userId, users.id))
    .where(
      and(
        eq(sessions.tokenHash, tokenHash),
        eq(users.isActive, true),
        gt(sessions.expiresAt, new Date())
      )
    )
    .limit(1);

  if (!session) {
    return null;
  }

  return buildAuthUser(session.user);
}

export async function cleanupExpiredSessions() {
  await db.delete(sessions).where(lte(sessions.expiresAt, new Date()));
}

export async function buildAuthPayload(user: Pick<User, "id" | "username" | "displayName" | "isActive">) {
  const authUser = await buildAuthUser(user);
  return {
    user: {
      id: authUser.id,
      username: authUser.username,
      display_name: authUser.displayName,
      is_active: authUser.isActive
    },
    roles: authUser.roles,
    permissions: authUser.permissions
  };
}

async function buildAuthUser(
  user: Pick<User, "id" | "username" | "displayName" | "isActive">
): Promise<AuthUser> {
  const { roles, permissions } = await getUserRolesAndPermissions(user.id);
  return {
    id: user.id,
    username: user.username,
    displayName: user.displayName,
    isActive: user.isActive,
    roles,
    permissions
  };
}
