import "@mdi/font/css/materialdesignicons.css";
import "vuetify/styles";
import "./assets/fonts/fonts.css";
import { createApp } from "vue";
import { createVuetify } from "vuetify";
import { VApp, VSheet, VIcon, VProgressLinear, VBtn } from "vuetify/components";
import { ar } from "vuetify/locale";
import SplashScreen from "./components/splash/SplashScreen.vue";

// A separate entry avoids loading authentication, routing, or the main app's data.
const vuetify = createVuetify({
  components: { VApp, VSheet, VIcon, VProgressLinear, VBtn },
  locale: { locale: "ar", fallback: "ar", messages: { ar }, rtl: { ar: true } },
  theme: {
    defaultTheme: "splash",
    themes: {
      // ألوان الهوية: ليل دجلة أرضيةً والنحاس لشريط التقدّم.
      splash: {
        dark: true,
        colors: {
          primary: "#B8924F",
          background: "#0E2A33",
          surface: "#0E2A33",
          "on-surface": "#F4EFE6",
          "on-background": "#F4EFE6",
        },
      },
    },
  },
});
createApp(SplashScreen).use(vuetify).mount("#app");
