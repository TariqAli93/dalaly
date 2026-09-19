import { defineConfig, devices } from "@playwright/test";

/**
 * إعداد التصوير الآلي لدلالي (نسخة web-demo).
 *
 * يشغّل `pnpm dev:web` تلقائياً إن لم يكن يعمل، ويصوّر كل ميزة في اختبار
 * مستقل: لقطة شاشة + فيديو خاص بها. التسلسل إجباري لأن التسجيلات تعدّل
 * بيانات قاعدة العرض.
 */
const BASE_URL = process.env.CAPTURE_BASE_URL || "http://127.0.0.1:5199";

export default defineConfig({
  testDir: "./tests/captures",
  outputDir: "./test-results",

  fullyParallel: false,
  workers: 1,
  retries: 0,

  timeout: 120_000,
  expect: { timeout: 15_000 },

  reporter: [["list"], ["html", { open: "never" }]],

  use: {
    baseURL: BASE_URL,

    viewport: { width: 1920, height: 1080 },
    deviceScaleFactor: 1,

    colorScheme: "light",
    locale: "ar-IQ",
    timezoneId: "Asia/Baghdad",

    video: {
      mode: "on",
      size: { width: 1920, height: 1080 },
    },

    screenshot: "only-on-failure",
    trace: "retain-on-failure",

    actionTimeout: 20_000,
    navigationTimeout: 30_000,
  },

  projects: [
    {
      name: "desktop-chromium",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1920, height: 1080 },
        deviceScaleFactor: 1,
      },
    },
  ],

  webServer: {
    command: "pnpm dev:web",
    url: BASE_URL,
    reuseExistingServer: true,
    timeout: 180_000,
    stdout: "ignore",
    stderr: "pipe",
  },
});
