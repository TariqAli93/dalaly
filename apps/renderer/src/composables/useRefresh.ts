import { computed, getCurrentInstance, onBeforeUnmount, shallowRef } from "vue";

type RefreshHandler = () => void | Promise<void>;

const handler = shallowRef<RefreshHandler | null>(null);
const canRefresh = computed(() => handler.value !== null);

/**
 * سجل بسيط لإعادة تحميل بيانات الصفحة النشطة من زر التحديث في الـ Navbar.
 * تستدعي كل صفحة setRefreshHandler داخل onMounted، ويُنسى معالجها حين تُغلق،
 * فلا يعيد الزر تحميل صفحة سابقة في صفحة لا تسجّل معالجاً (يُعطَّل الزر فيها).
 */
export function useRefresh() {
  let registered: RefreshHandler | null = null;
  if (getCurrentInstance()) {
    onBeforeUnmount(() => {
      if (handler.value === registered) handler.value = null;
    });
  }

  function setRefreshHandler(fn: RefreshHandler) {
    registered = fn;
    handler.value = fn;
  }

  function refresh() {
    return handler.value?.();
  }

  return { setRefreshHandler, refresh, canRefresh };
}
