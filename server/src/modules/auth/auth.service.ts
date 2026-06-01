import { and, eq, gt, sql } from "drizzle-orm";
import { config } from "../../infrastructure/config.js";
import { db } from "../../infrastructure/database/db.js";
import { sessions, users, type User } from "../../infrastructure/database/schema.js";
import {
  createSessionToken,
  hashPin,
  hashSessionToken,
  verifyPin
} from "./crypto.js";

export type AuthUser = Pick<User, "id" | "username" | "role">;

export async function bootstrapDefaultAdmin() {
  const hasAdmin = await adminExists();
  if (hasAdmin) {
    return;
  }

  await createAdmin(config.admin.username, config.admin.pin);
}

export async function adminExists() {
  const result = await db.select({ count: sql<number>`count(*)::int` }).from(users);
  return Number(result[0]?.count ?? 0) > 0;
}

export async function createAdmin(username: string, pin: string) {
  const pinHash = await hashPin(pin);
  const [user] = await db
    .insert(users)
    .values({ username, pinHash, role: "administrator" })
    .returning({
      id: users.id,
      username: users.username,
      role: users.role
    });
  return user;
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
    user: toAuthUser(user)
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
        role: users.role
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

  return session.user;
}

export async function cleanupExpiredSessions() {
  await db.delete(sessions).where(sql`${sessions.expiresAt} <= now()`);
}

function toAuthUser(user: User): AuthUser {
  return {
    id: user.id,
    username: user.username,
    role: user.role
  };
}
