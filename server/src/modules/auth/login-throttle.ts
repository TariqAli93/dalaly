/**
 * Throttles repeated wrong-PIN attempts per account.
 *
 * PINs can be as short as four digits and the API may be reachable through the
 * optional Cloudflare tunnel, where every request arrives from 127.0.0.1, so
 * attempts are keyed by account rather than by IP. After MAX_FAILURES wrong
 * PINs the key is locked; each further lockout doubles up to MAX_LOCKOUT_MS.
 * A successful attempt clears the key. State is in memory: a restart resets it,
 * which is acceptable for a single-office desktop app.
 */

const MAX_FAILURES = 5;
const BASE_LOCKOUT_MS = 30_000;
const MAX_LOCKOUT_MS = 15 * 60_000;
/** Failures older than this are forgotten. */
const FAILURE_WINDOW_MS = 15 * 60_000;
/** Bounds memory when many distinct usernames are tried. */
const MAX_TRACKED_KEYS = 1_000;

type Entry = {
  failures: number;
  lockouts: number;
  lastFailureAt: number;
  lockedUntil: number;
};

export class LoginThrottle {
  private readonly entries = new Map<string, Entry>();

  constructor(private readonly now: () => number = Date.now) {}

  /** Milliseconds until `key` may try again; 0 when it is not locked. */
  retryAfterMs(key: string) {
    const entry = this.entries.get(key);
    if (!entry) return 0;
    return Math.max(0, entry.lockedUntil - this.now());
  }

  recordFailure(key: string) {
    const now = this.now();
    let entry = this.entries.get(key);
    if (entry && now - entry.lastFailureAt > FAILURE_WINDOW_MS) {
      this.entries.delete(key);
      entry = undefined;
    }
    if (!entry) {
      this.evictIfFull(now);
      entry = { failures: 0, lockouts: 0, lastFailureAt: now, lockedUntil: 0 };
    }

    entry.failures += 1;
    entry.lastFailureAt = now;
    if (entry.failures >= MAX_FAILURES) {
      const lockoutMs = Math.min(
        BASE_LOCKOUT_MS * 2 ** entry.lockouts,
        MAX_LOCKOUT_MS,
      );
      entry.lockedUntil = now + lockoutMs;
      entry.lockouts += 1;
      entry.failures = 0;
    }

    // Re-insert so Map order stays oldest-activity first for eviction.
    this.entries.delete(key);
    this.entries.set(key, entry);
  }

  recordSuccess(key: string) {
    this.entries.delete(key);
  }

  private evictIfFull(now: number) {
    if (this.entries.size < MAX_TRACKED_KEYS) return;
    for (const [key, entry] of this.entries) {
      if (
        entry.lockedUntil <= now &&
        now - entry.lastFailureAt > FAILURE_WINDOW_MS
      )
        this.entries.delete(key);
    }
    if (this.entries.size < MAX_TRACKED_KEYS) return;
    // Still full: drop the least recently active key, preferring one that is
    // not locked so a flood of usernames cannot lift an active lockout.
    let victim: string | undefined;
    for (const [key, entry] of this.entries) {
      victim ??= key;
      if (entry.lockedUntil <= now) {
        victim = key;
        break;
      }
    }
    if (victim !== undefined) this.entries.delete(victim);
  }
}

export function lockedOutMessage(retryAfterMs: number) {
  const seconds = Math.ceil(retryAfterMs / 1000);
  return seconds > 60
    ? `محاولات خاطئة كثيرة. أعد المحاولة بعد ${Math.ceil(seconds / 60)} دقيقة.`
    : `محاولات خاطئة كثيرة. أعد المحاولة بعد ${seconds} ثانية.`;
}

export const loginThrottle = new LoginThrottle();
