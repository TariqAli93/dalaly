/**
 * هل يعلو الصفحةَ حوارٌ مفتوح؟ الاختصارات العامة لا تُعترض حينها. في Vuetify 3
 * يقع الصنفان v-dialog وv-overlay--active على عنصر التراكب نفسه، فمحدِّد السليل
 * «.v-overlay--active .v-dialog» لا يطابق شيئاً.
 */
export function isDialogOpen(): boolean {
  return document.querySelector(".v-overlay--active.v-dialog") !== null;
}
