import { readonly, ref } from "vue";

// عنوان الصفحة النشطة للشريط العلوي: تكتبه AppPage في كل صفحة، ويقرؤه
// AppLayout الذي يبقى مركّباً بين الصفحات.
const title = ref<string>();

export function usePageTitle() {
  function setPageTitle(value: string | undefined) {
    title.value = value;
  }

  return { pageTitle: readonly(title), setPageTitle };
}
