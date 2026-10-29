import vue from "@vitejs/plugin-vue";
import { defineConfig, type Plugin } from "vite";
import vueDevTools from "vite-plugin-vue-devtools";
import vuetify from "vite-plugin-vuetify";
import tailwindcss from "@tailwindcss/vite";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * @mdi/font declares EOT, WOFF2, WOFF and TTF sources and Vite bundles all
 * four (~3.6 MB). Electron's Chromium only ever loads the WOFF2, so the
 * @font-face is rewritten to reference it alone.
 */
function mdiWoff2Only(): Plugin {
  return {
    name: "dalaly:mdi-woff2-only",
    enforce: "pre",
    transform(code, id) {
      if (!/@mdi[\\/]font[\\/]css[\\/]materialdesignicons\.css/.test(id))
        return;
      const woff2 = code.match(
        /url\(("[^"]*materialdesignicons-webfont\.woff2[^"]*")\)/,
      )?.[1];
      const rewritten = woff2
        ? code.replace(
            /src:[^;]+;\s*src:[^;]+;/,
            `src: url(${woff2}) format("woff2");`,
          )
        : code;
      if (rewritten === code)
        this.warn("MDI @font-face not recognised; shipping every format.");
      return rewritten;
    },
  };
}

/**
 * The packaged windows' Content-Security-Policy, as a <meta> in each HTML
 * entry (both load from file://, so there are no response headers to carry
 * it). Development keeps Vite's HMR and DevTools unrestricted.
 *
 * - Scripts: the bundle only. Nothing is evaluated at runtime.
 * - Styles: Vuetify's theme <style> and inline style attributes need
 *   'unsafe-inline'.
 * - The API is on the loopback interface; tests and the perf harness run it
 *   on other ports, so any loopback port is allowed (never another host).
 * - Images: listing photos and the logo from the API, map tiles, and data:
 *   and blob: URLs (contract images, thumbnails made before upload, the
 *   document viewer). The viewer shows PDFs in a blob: frame.
 */
const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: http://127.0.0.1:* https://tile.openstreetmap.org",
  "font-src 'self' data:",
  "connect-src 'self' http://127.0.0.1:*",
  "frame-src blob:",
  "media-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'none'",
].join("; ");

function contentSecurityPolicy(): Plugin {
  return {
    name: "dalaly:content-security-policy",
    apply: "build",
    transformIndexHtml: () => [
      {
        tag: "meta",
        attrs: {
          "http-equiv": "Content-Security-Policy",
          content: CONTENT_SECURITY_POLICY,
        },
        injectTo: "head-prepend",
      },
    ],
  };
}

export default defineConfig(({ mode }) => {
  // وضع web-demo مخصص للتصوير: لوحة Vue DevTools العائمة تظهر فوق الواجهة
  // وتُفسد اللقطات، لذلك تُستبعد في هذا الوضع فقط. التطوير العادي والبناء
  // ونسخة Electron لا تتأثر.
  const isWebDemo = mode === "web-demo";

  return {
    base: "./",
    plugins: [
      mdiWoff2Only(),
      contentSecurityPolicy(),
      vue(),
      // Imports only the Vuetify components and directives the templates
      // use (with their CSS), instead of the whole library at startup.
      vuetify({ autoImport: true }),
      ...(isWebDemo ? [] : [vueDevTools({ appendTo: "/src/main.ts" })]),
      tailwindcss(),
    ],
    resolve: {
      alias: {
        // The contract document model shared with the API (preview, PDF and
        // printing resolve fields exactly as issuing and Word export do).
        "@contract-document": fileURLToPath(
          new URL("../../server/src/shared/contract-document", import.meta.url),
        ),
      },
    },
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
