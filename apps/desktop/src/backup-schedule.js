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
