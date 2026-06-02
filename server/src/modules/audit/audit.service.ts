import { and, desc, eq } from "drizzle-orm";
import { db } from "../../infrastructure/database/db.js";
import { auditLogs, users } from "../../infrastructure/database/schema.js";

export type AuditAction =
  | "created"
  | "updated"
  | "price_changed"
  | "status_changed"
  | "archived"
  | "restored"
  | "deleted"
  | "image_added"
  | "image_removed";

type RecordAuditInput = {
  entityType: string;
  entityId: number;
  action: AuditAction;
  oldValue?: unknown;
  newValue?: unknown;
  userId?: number | null;
};

/**
 * يسجّل حدثاً في سجل التغييرات. لا يرمي أبداً حتى لا يُفشل العملية الأصلية.
 */
export async function recordAudit(input: RecordAuditInput) {
  try {
    await db.insert(auditLogs).values({
      entityType: input.entityType,
      entityId: input.entityId,
      action: input.action,
      oldValue: input.oldValue ?? null,
      newValue: input.newValue ?? null,
      userId: input.userId ?? null
    });
  } catch {
    // تجاهل أخطاء التدقيق بهدوء.
  }
}

export async function listEntityAudit(entityType: string, entityId: number) {
  const rows = await db
    .select({
      id: auditLogs.id,
      entity_type: auditLogs.entityType,
      entity_id: auditLogs.entityId,
      action: auditLogs.action,
      old_value: auditLogs.oldValue,
      new_value: auditLogs.newValue,
      user_id: auditLogs.userId,
      user_name: users.username,
      created_at: auditLogs.createdAt
    })
    .from(auditLogs)
    .leftJoin(users, eq(auditLogs.userId, users.id))
    .where(and(eq(auditLogs.entityType, entityType), eq(auditLogs.entityId, entityId)))
    .orderBy(desc(auditLogs.createdAt), desc(auditLogs.id));

  return rows;
}
