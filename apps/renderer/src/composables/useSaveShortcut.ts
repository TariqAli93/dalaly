import { onBeforeUnmount, onMounted } from "vue";
import { isDialogOpen } from "../utils/dialog";

/**
 * Ctrl+S يحفظ نموذج الصفحة. code لا key: على لوحة المفاتيح العربية key هو
 * «س». لا يُعترض حين يعلو النموذجَ حوارٌ آخر (تأكيد، مطابقات).
 */
export function useSaveShortcut(save: () => void) {
  function onKeydown(event: KeyboardEvent) {
    if (!(event.ctrlKey || event.metaKey) || event.code !== "KeyS") return;
    if (event.altKey || event.shiftKey) return;
    event.preventDefault();
    if (isDialogOpen()) return;
    save();
  }
  onMounted(() => window.addEventListener("keydown", onKeydown));
  onBeforeUnmount(() => window.removeEventListener("keydown", onKeydown));
}
