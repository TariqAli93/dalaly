/**
 * نقطة واحدة لاختيار المنصّة.
 *
 * الترتيب مقصود: وجود جسر Electron هو الفاصل. في نسخة سطح المكتب يوجد الجسر
 * دائماً فتُختار electron، ولا يغيّر وضع web-demo شيئاً هناك. في المتصفح لا
 * يوجد جسر فتُختار web. لذلك لا يدخل بديل الويب إلى بناء الإنتاج المكتبي
 * كسلوك فعّال حتى لو كان موجوداً في الحزمة.
 */
import { electronPlatform } from "./electron";
import { webPlatform } from "./web";
import type { PlatformAdapter } from "./types";

const hasElectronBridge = typeof window !== "undefined" && Boolean(window.dalalyConfig);

export const platform: PlatformAdapter = hasElectronBridge
  ? electronPlatform
  : webPlatform;

/** وضع العرض على الويب (يُفعَّل من ملف البيئة .env.web-demo فقط). */
export const isWebDemo = import.meta.env.VITE_WEB_DEMO === "true";

/** وضع التصوير الآلي — يُستخدم لتهدئة الحركة وإظهار مؤشّر التصوير. */
export const isCaptureMode = import.meta.env.VITE_CAPTURE_MODE === "true";

export type { PlatformAdapter } from "./types";
