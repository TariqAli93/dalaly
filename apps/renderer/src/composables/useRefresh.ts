import { ref } from "vue";

type RefreshHandler = () => void | Promise<void>;

const handler = ref<RefreshHandler>(() => undefined);

/**
 * سجل بسيط لإعادة تحميل بيانات الصفحة النشطة من زر التحديث في الـ Navbar.
 * تستدعي كل صفحة setRefreshHandler داخل onMounted.
 */
export function useRefresh() {
  function setRefreshHandler(fn: RefreshHandler) {
    handler.value = fn;
  }

  function refresh() {
    return handler.value();
  }

  return { setRefreshHandler, refresh };
}
