import "@mdi/font/css/materialdesignicons.css";
import "vuetify/styles";
import "./assets/fonts/fonts.css";
import { createApp } from "vue";
import { createVuetify } from "vuetify";
import {
  VApp,
  VSheet,
  VImg,
  VIcon,
  VProgressLinear,
  VBtn,
} from "vuetify/components";
import { ar } from "vuetify/locale";
import SplashScreen from "./components/splash/SplashScreen.vue";

// A separate entry avoids loading authentication, routing, or the main app's data.
const vuetify = createVuetify({
  components: { VApp, VSheet, VImg, VIcon, VProgressLinear, VBtn },
  locale: { locale: "ar", fallback: "ar", messages: { ar }, rtl: { ar: true } },
  theme: {
    defaultTheme: "splash",
    themes: {
      splash: {
        dark: false,
        colors: {
          primary: "#116466",
          background: "#FFFFFF",
          surface: "#FFFFFF",
          "on-surface": "#193638",
          "on-background": "#193638",
        },
      },
    },
  },
});
createApp(SplashScreen).use(vuetify).mount("#app");
