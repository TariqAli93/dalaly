import vue from "@vitejs/plugin-vue";
import { defineConfig } from "vite";
import vueDevTools from "vite-plugin-vue-devtools";
import tailwindcss from "@tailwindcss/vite";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

export default defineConfig(({ mode }) => {
  // وضع web-demo مخصص للتصوير: لوحة Vue DevTools العائمة تظهر فوق الواجهة
  // وتُفسد اللقطات، لذلك تُستبعد في هذا الوضع فقط. التطوير العادي والبناء
  // ونسخة Electron لا تتأثر.
  const isWebDemo = mode === "web-demo";

  return {
    base: "./",
    plugins: [
      vue(),
      ...(isWebDemo ? [] : [vueDevTools({ appendTo: "/src/main.ts" })]),
      tailwindcss(),
    ],
    build: {
      outDir: "dist",
      emptyOutDir: true,
      manifest: true,
      rollupOptions: {
        input: {
          main: fileURLToPath(new URL("./index.html", import.meta.url)),
          splash: resolve(
            fileURLToPath(new URL(".", import.meta.url)),
            "splash.html",
          ),
        },
      },
    },
    server: {
      host: "127.0.0.1",
      port: 5173,
    },
  };
});
