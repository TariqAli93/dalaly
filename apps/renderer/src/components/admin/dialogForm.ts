import { nextTick, watch, type Ref } from "vue";

/**
 * سلوك حوارات صفحات الإدارة (المستخدمون، الأدوار، المواقع): التركيز يعود عند
 * الإغلاق إلى ما فتح الحوار (Vuetify يعيده إلى المفعِّل وحده، والحوارات هنا
 * تُفتح بـ v-model)، وCtrl+S يحفظ بـ code لا key، فيعمل مع العربية.
 */
export function useDialogForm(open: Ref<boolean>, save: () => unknown) {
  let opener: HTMLElement | null = null;
  watch(open, (isOpen) => {
    if (isOpen) {
      opener = document.activeElement as HTMLElement | null;
      return;
    }
    const target = opener;
    opener = null;
    if (target?.isConnected) void nextTick(() => target.focus());
  });

  function onKeydown(event: KeyboardEvent) {
    if (!(event.ctrlKey || event.metaKey) || event.code !== "KeyS") return;
    if (event.altKey || event.shiftKey) return;
    event.preventDefault();
    void save();
  }

  return { onKeydown };
}
