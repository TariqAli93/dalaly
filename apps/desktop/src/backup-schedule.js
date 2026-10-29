const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

// هل حان موعد النسخة المجدولة؟ الوقت المحلي HH:MM، يومياً أو أسبوعياً.
export function isScheduleDue(schedule, now = new Date()) {
  if (!schedule?.enabled) return false;
  const [hh, mm] = String(schedule.time ?? "02:00")
    .split(":")
    .map(Number);
  const target = new Date(now);
  target.setHours(hh || 0, mm || 0, 0, 0);
  if (now < target) return false; // لم يحن الوقت اليوم بعد

  if (!schedule.lastRunAt) return true;
  const last = new Date(schedule.lastRunAt);
  if (schedule.frequency === "weekly") {
    return now.getTime() - last.getTime() >= WEEK_MS;
  }
  // يومي: لم يُنفَّذ منذ موعد اليوم.
  return last < target;
}

const EMAIL = /^[^\s@]{1,64}@[A-Za-z0-9.-]{1,253}\.[A-Za-z]{2,63}$/;
const HOST = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,62}[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,62}[A-Za-z0-9])?)*$/;
const TIME = /^(?:[01]\d|2[0-3]):[0-5]\d$/;
// eslint-disable-next-line no-control-regex -- control characters are refused
const CONTROL = /[\u0000-\u001f\u007f]/;

/**
 * Checks the schedule the settings card sends, against what the main process
 * saved before. The SMTP password is sent to whatever host is saved, so a new
 * host or user without a new password drops the stored one: a renderer that
 * changed only the host must not receive the old password during AUTH.
 * Returns `{ ok: true, value, dropPassword }` or `{ ok: false, message }`.
 */
export function validateSchedule(incoming, previous = {}) {
  const text = (value) => (typeof value === "string" ? value.trim() : "");
  const value = {
    enabled: Boolean(incoming?.enabled),
    recipient: text(incoming?.recipient),
    smtpHost: text(incoming?.smtpHost).toLowerCase(),
    smtpPort: Number(incoming?.port ?? incoming?.smtpPort ?? 587),
    smtpUser: text(incoming?.smtpUser),
    frequency: incoming?.frequency === "weekly" ? "weekly" : "daily",
    time: text(incoming?.time) || "02:00",
  };
  const fail = (message) => ({ ok: false, message });
  if (value.recipient && (value.recipient.length > 254 || !EMAIL.test(value.recipient)))
    return fail("عنوان البريد المستلم غير صالح.");
  if (value.smtpHost && (value.smtpHost.length > 253 || !HOST.test(value.smtpHost)))
    return fail("اسم خادم البريد غير صالح (اسم الخادم وحده، دون بروتوكول أو مسار).");
  if (!Number.isInteger(value.smtpPort) || value.smtpPort < 1 || value.smtpPort > 65535)
    return fail("منفذ خادم البريد غير صالح.");
  if (value.smtpUser.length > 254 || CONTROL.test(value.smtpUser))
    return fail("اسم مستخدم البريد غير صالح.");
  if (!TIME.test(value.time)) return fail("وقت النسخ غير صالح.");
  if (value.enabled && (!value.recipient || !value.smtpHost))
    return fail("حدّد البريد المستلم وخادم البريد قبل تفعيل الجدولة.");
  const accountChanged =
    value.smtpHost !== text(previous.smtpHost).toLowerCase() ||
    value.smtpUser !== text(previous.smtpUser);
  return { ok: true, value, dropPassword: accountChanged && !incoming?.password };
}
