import { and, eq } from "drizzle-orm";
import { db } from "../../infrastructure/database/db.js";
import { people, users } from "../../infrastructure/database/schema.js";
import { DomainError } from "../../shared/errors.js";

/**
 * Checks a task's customer and assignee before it is saved, so a stale id
 * is an Arabic message about that field, not a generic foreign-key 409.
 * Only an active user can be given a task.
 */
export async function assertTaskLinks(fields: {
  person_id?: number | null;
  assigned_user_id?: number | null;
}) {
  if (fields.person_id) {
    const [person] = await db
      .select({ id: people.id })
      .from(people)
      .where(eq(people.id, fields.person_id));
    if (!person) throw new DomainError(400, "الزبون المحدد غير موجود.");
  }
  if (fields.assigned_user_id) {
    const [user] = await db
      .select({ id: users.id })
      .from(users)
      .where(
        and(eq(users.id, fields.assigned_user_id), eq(users.isActive, true)),
      );
    if (!user)
      throw new DomainError(400, "الموظف المكلَّف غير موجود أو غير نشط.");
  }
}
