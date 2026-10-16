import "@mdi/font/css/materialdesignicons.css";
import "vuetify/styles";
import "./styles.css";

import { createApp, nextTick } from "vue";
import { createVuetify } from "vuetify";
import * as components from "vuetify/components";
import * as directives from "vuetify/directives";
import { ar } from "vuetify/locale";
import App from "./App.vue";
import { router } from "./router";
import { i18n } from "./plugins/i18n";
import {
  configuredThemes,
  initializeAppearance,
} from "./composables/useAppearance";
import { setUnauthorizedHandler } from "./services/api.service";
import { useAuth } from "./composables/useAuth";
import { useSetup } from "./composables/useSetup";

initializeAppearance();
const vuetify = createVuetify({
  components,
  directives,
  locale: {
    locale: "ar",
    fallback: "ar",
    messages: { ar },
    rtl: { ar: true },
  },
  // كثافة سطح المكتب: حقول محدّدة بإطار ومضغوطة، وأزرار أقصر — لغة برامج
  // Windows لا لغة الويب. compact يقارب ارتفاع 40px للحقول.
  defaults: {
    VTextField: { variant: "outlined", density: "compact", rounded: "lg" },
    VSelect: { variant: "outlined", density: "compact", rounded: "lg" },
    VAutocomplete: {
      variant: "outlined",
      density: "compact",
      rounded: "lg",
    },
    VCombobox: { variant: "outlined", density: "compact", rounded: "lg" },
    VTextarea: { variant: "outlined", density: "compact", rounded: "lg" },
    VFileInput: {
      variant: "outlined",
      density: "compact",
      rounded: "lg",
    },
    VBtn: { density: "comfortable", rounded: "lg", elevation: 0 },
    VCard: { rounded: "lg", elevation: 0 },
    VDialog: { rounded: "lg" },
    VMenu: { rounded: "lg" },
    VChip: { rounded: "lg" },
    VTabs: { height: 44 },
    VDataTable: { density: "compact" },
  },
  theme: {
    defaultTheme:
      localStorage.getItem("dalaly.theme") === "dalalyDark"
        ? "dalalyDark"
        : "dalalyLight",
    themes: configuredThemes(),
  },
});

// عند انتهاء الجلسة (401) في أي طلب: امسح الحالة وانتقل لتسجيل الدخول.
setUnauthorizedHandler(() => {
  useAuth().clearAuthState();
  if (router.currentRoute.value.path !== "/login") {
    void router.push({ path: "/login" });
  }
});

document.documentElement.lang = "ar";
document.documentElement.dir = "rtl";

router.afterEach((to) => {
  const titleKey = to.meta.titleKey as string | undefined;
  document.title = titleKey
    ? `${i18n.global.t(titleKey)} | ${i18n.global.t("common.appName")}`
    : i18n.global.t("common.appName");
});

const app = createApp(App).use(i18n).use(vuetify).use(router);
async function mountApplication() {
  try {
    await router.isReady();
    app.mount("#app");
    await nextTick();
    const { startupState, status } = useSetup();
    await window.dalalyConfig?.rendererReady?.({
      startup_state: startupState.value,
      startup_reason: status.value?.startup_reason,
    });
  } catch (error) {
    console.error("Renderer startup failed", error);
    await window.dalalyConfig?.rendererReady?.({
      startup_state: "ERROR",
      startup_reason: "RENDERER_FAILED",
    });
  }
}
void mountApplication();
