import { ref, type Ref } from "vue";
import type { ContractDocument } from "@contract-document/index";

const LIMIT = 200;
/** Typing in the same place within this pause is one undo step. */
const COALESCE_MS = 1200;

/**
 * Undo and redo for the studio. Documents are never mutated (see
 * utils/contractDocument.ts), so each step is a reference to a whole
 * document. Edits with the same `key` in quick succession merge into one
 * step, so undo takes back a word or a sentence, not a keystroke.
 */
export function useDocumentHistory(document: Ref<ContractDocument>) {
  const past: ContractDocument[] = [];
  const future: ContractDocument[] = [];
  const canUndo = ref(false);
  const canRedo = ref(false);
  let lastKey = "";
  let lastAt = 0;

  function refresh() {
    canUndo.value = past.length > 0;
    canRedo.value = future.length > 0;
  }

  function apply(next: ContractDocument, key?: string) {
    if (next === document.value) return;
    const now = Date.now();
    if (!key || key !== lastKey || now - lastAt > COALESCE_MS) {
      past.push(document.value);
      if (past.length > LIMIT) past.shift();
    }
    lastKey = key ?? "";
    lastAt = now;
    future.length = 0;
    document.value = next;
    refresh();
  }

  function undo() {
    const previous = past.pop();
    if (!previous) return;
    future.push(document.value);
    document.value = previous;
    lastKey = "";
    refresh();
  }

  function redo() {
    const next = future.pop();
    if (!next) return;
    past.push(document.value);
    document.value = next;
    lastKey = "";
    refresh();
  }

  /** After loading or saving elsewhere: start a fresh history. */
  function clear() {
    past.length = 0;
    future.length = 0;
    lastKey = "";
    refresh();
  }

  return { apply, undo, redo, clear, canUndo, canRedo };
}
