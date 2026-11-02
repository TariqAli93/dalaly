import type { TaskStatus } from "../types";

/** سجل جديد: مهمة يجب إنجازها، أو أمر حدث فعلاً. */
export type TaskIntent = "task" | "log";

/**
 * ما يبدأ به سجل جديد: اختيار المستخدم، ثم ما مرّره المستدعي، ثم قاعدة
 * الخادم (`initialStatus` في tasks.schema.ts): موعد ⇒ مهمة، بلا موعد ⇒ أمر
 * حدث. فلا يتغيّر ما يُحفظ لمن لا يلمس الاختيار.
 */
export function newTaskIntent(
  chosen: TaskIntent | null,
  given: TaskIntent | undefined,
  scheduledAt: string | null | undefined,
): TaskIntent {
  return chosen ?? given ?? (scheduledAt ? "task" : "log");
}

/** الحالة التي يُرسَل بها السجل الجديد صراحة، بموعد أو بدونه. */
export function intentStatus(intent: TaskIntent): TaskStatus {
  return intent === "task" ? "open" : "done";
}
