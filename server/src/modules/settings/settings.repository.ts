import { eq } from "drizzle-orm";
import { db } from "../../infrastructure/database/db.js";
import { appSettings } from "../../infrastructure/database/schema.js";

export async function getSetting<T = unknown>(key: string): Promise<T | null> {
  const [row] = await db
    .select()
    .from(appSettings)
    .where(eq(appSettings.key, key))
    .limit(1);
  return (row?.value as T) ?? null;
}

export async function setSetting(key: string, value: unknown) {
  await db
    .insert(appSettings)
    .values({ key, value, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: appSettings.key,
      set: { value, updatedAt: new Date() }
    });
}
