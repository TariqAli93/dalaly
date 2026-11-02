import { onBeforeUnmount, onMounted } from "vue";
import { isDialogOpen } from "../utils/dialog";

/**
 * Ctrl+N يبدأ سجلاً جديداً من نوع الصفحة (عرض، زبون، طلب، مهمة، مستمسك،
 * صفقة، إيجار). code لا key: على لوحة المفاتيح العربية key هو «ئ». لا يُعترض
 * وحوارٌ مفتوح، ولا حين لا يُسمح بالإضافة (`allowed` تُقرأ عند الضغط فتتبع
 * الصلاحيات وحالة الصفحة)، فيبقى الاختصار للمتصفح أو للنظام عندها.
 */
export function useCreateShortcut(
  create: () => void,
  allowed: () => boolean = () => true,
) {
  function onKeydown(event: KeyboardEvent) {
    if (!(event.ctrlKey || event.metaKey) || event.code !== "KeyN") return;
    if (event.altKey || event.shiftKey) return;
    if (isDialogOpen() || !allowed()) return;
    event.preventDefault();
    create();
  }
  onMounted(() => window.addEventListener("keydown", onKeydown));
  onBeforeUnmount(() => window.removeEventListener("keydown", onKeydown));
}
