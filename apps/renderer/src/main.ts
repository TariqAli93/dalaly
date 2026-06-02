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
  theme: {
    defaultTheme: localStorage.getItem("dalaly.theme") ?? "dalalyLight",
    themes: {
      dalalyLight: {
        dark: false,
        colors: {
          primary: "#116466",
          secondary: "#5b6f62",
          accent: "#c27c3a",
          surface: "#ffffff",
          background: "#f6f7f5",
          error: "#b3261e"
        }
      },
      dalalyDark: {
        dark: true,
        colors: {
          primary: "#4db6ac",
          secondary: "#9db5a7",
          accent: "#d8a15f",
          surface: "#17211d",
          background: "#0f1513",
          error: "#ffb4ab"
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
