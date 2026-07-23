import "@mdi/font/css/materialdesignicons.css";
import "vuetify/styles";
import "./styles.css";

import { createApp } from "vue";
import { createVuetify } from "vuetify";
import * as components from "vuetify/components";
import * as directives from "vuetify/directives";
import { ar } from "vuetify/locale";
import App from "./App.vue";
import { router } from "./router";
import { setUnauthorizedHandler } from "./services/api.service";
import { useAuth } from "./composables/useAuth";

const vuetify = createVuetify({
  components,
  directives,
  locale: {
    locale: "ar",
    fallback: "en",
    messages: { ar },
    rtl: { ar: true }
  },
  // الحقول المحدّدة بإطار رفيع تتحدث نفس لغة البطاقات (flat + border).
  // بدون هذا ترجع Vuetify إلى نمط filled المختلف عن كل الأسطح حوله.
  defaults: {
    VTextField: { variant: "outlined" },
    VSelect: { variant: "outlined" },
    VAutocomplete: { variant: "outlined" },
    VCombobox: { variant: "outlined" },
    VTextarea: { variant: "outlined" },
    VFileInput: { variant: "outlined" }
  },
  theme: {
    defaultTheme: localStorage.getItem("dalaly.theme") ?? "dalalyLight",
    themes: {
      dalalyLight: {
        dark: false,
        colors: {
          primary: "#116466",
          secondary: "#5b6f62",
          accent: "#c27c3a",
          // لوحة رمادية محايدة (Fluent/Win11) مع أسطح بيضاء ترتفع فوقها.
          surface: "#ffffff",
          background: "#f3f3f3",
          error: "#b3261e",
          // بدون تعريف صريح ترجع Vuetify إلى ألوان Material الافتراضية
          // (كهرماني وأزرق) وهي خارج نظام التصميم. القيم أدناه من عائلة
          // الأوكر والسيج نفسها، وبتباين ≥4.5:1 على الأبيض.
          warning: "#8a5a1f",
          success: "#2f6d4f",
          info: "#5b6f62"
        }
      },
      dalalyDark: {
        dark: true,
        colors: {
          primary: "#4db6ac",
          secondary: "#9db5a7",
          accent: "#d8a15f",
          // داكن محايد بطبقتين على نمط Windows 11 (قاعدة/بطاقة).
          surface: "#272727",
          background: "#1c1c1c",
          error: "#ffb4ab",
          warning: "#d8a15f",
          success: "#7fc9a3",
          info: "#9db5a7"
        }
      }
    }
  }
});

// عند انتهاء الجلسة (401) في أي طلب: امسح الحالة وانتقل لتسجيل الدخول.
setUnauthorizedHandler(() => {
  useAuth().clearAuthState();
  if (router.currentRoute.value.path !== "/login") {
    void router.push({ path: "/login" });
  }
});

createApp(App).use(vuetify).use(router).mount("#app");
