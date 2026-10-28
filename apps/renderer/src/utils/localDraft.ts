/**
 * A copy of unsaved contract or template edits in localStorage, written
 * before each save attempt and removed once the save succeeds. If the app
 * closes or the save fails, the next visit finds it and offers to restore
 * it. `base` is the server version the edits were made on.
 */
const PREFIX = "dalaly.contract-draft.";

export type LocalDraft<T> = { savedAt: number; base: number; data: T };

export function readLocalDraft<T>(key: string): LocalDraft<T> | null {
  try {
    const raw = localStorage.getItem(PREFIX + key);
    return raw ? (JSON.parse(raw) as LocalDraft<T>) : null;
  } catch {
    return null;
  }
}

export function writeLocalDraft<T>(key: string, base: number, data: T) {
  try {
    localStorage.setItem(
      PREFIX + key,
      JSON.stringify({ savedAt: Date.now(), base, data }),
    );
  } catch {
    // Storage full or blocked: the save itself still runs.
  }
}

export function clearLocalDraft(key: string) {
  try {
    localStorage.removeItem(PREFIX + key);
  } catch {
    // Nothing stored.
  }
}
