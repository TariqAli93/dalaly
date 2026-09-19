import vue from "@vitejs/plugin-vue";
import { defineConfig } from "vite";
import vueDevTools from "vite-plugin-vue-devtools";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig(({ mode }) => {
  // وضع web-demo مخصص للتصوير: لوحة Vue DevTools العائمة تظهر فوق الواجهة
  // وتُفسد اللقطات، لذلك تُستبعد في هذا الوضع فقط. التطوير العادي والبناء
  // ونسخة Electron لا تتأثر.
  const isWebDemo = mode === "web-demo";

  return {
    base: "./",
    plugins: [vue(), ...(isWebDemo ? [] : [vueDevTools()]), tailwindcss()],
    build: {
      outDir: "dist",
      emptyOutDir: true,
    },
    server: {
      host: "127.0.0.1",
      port: 5173,
    },
  };
});
