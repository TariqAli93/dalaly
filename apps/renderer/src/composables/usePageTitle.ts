import { readonly, ref, shallowRef } from "vue";

/** القائمة التي ينتمي إليها السجل المفتوح، لرابط العودة في شريط الأوامر. */
export type PageParent = { to: string; label: string };

// سياق الصفحة النشطة لشريط الأوامر: تكتبه AppPage في كل صفحة، ويقرؤه
// AppTopbar الذي يبقى مركّباً بين الصفحات.
const title = ref<string>();
const parent = shallowRef<PageParent | null>(null);
const count = ref<number | null>(null);

export function usePageTitle() {
  function setPageTitle(value: string | undefined) {
    title.value = value;
  }
  function setPageParent(value: PageParent | null | undefined) {
    parent.value = value ?? null;
  }
  function setPageCount(value: number | null | undefined) {
    count.value = value ?? null;
  }

  return {
    pageTitle: readonly(title),
    pageParent: readonly(parent),
    pageCount: readonly(count),
    setPageTitle,
    setPageParent,
    setPageCount,
  };
}
