/**
 * تنفيذ المنصّة داخل المتصفح (وضع web-demo).
 *
 * القاعدة: لا عملية حقيقية على ملفات المستخدم، ولا نافذة نظام تحجب الواجهة.
 * كل ما يحتاج حوار نظام يُستبدل ببديل متصفّح واضح:
 *   حوار الحفظ  → تنزيل ملف.
 *   حوار الفتح  → <input type="file">.
 *   فتح مجلد    → رسالة تجريبية.
 * الوظائف التي لا معنى لها خارج سطح المكتب تُعطَّل وتُرجِع سبباً مفهوماً.
 */
import type {
  PickedFile,
  PickedFolder,
  PlatformAdapter,
  SaveResult,
  ScheduledBackupConfig,
} from "./types";

const DEMO_NOTICE =
  "هذه نسخة ويب تجريبية للعرض — هذه الوظيفة تعمل داخل تطبيق سطح المكتب.";

/** ينزّل نصاً كملف عبر رابط مؤقت (بلا نافذة منبثقة ولا حوار نظام). */
function downloadBlob(filename: string, content: BlobPart, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.rel = "noopener";
  anchor.style.display = "none";
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  // تأخير بسيط قبل التحرير حتى يبدأ التنزيل فعلياً.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** يفتح منتقي ملفات مخفياً ويعيد الملف كـ data URL. */
function pickFileAsDataUrl(accept: string): Promise<PickedFile> {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = accept;
    input.style.display = "none";
    document.body.append(input);

    input.addEventListener(
      "change",
      () => {
        const file = input.files?.[0];
        input.remove();
        if (!file) {
          resolve({ canceled: true });
          return;
        }
        const reader = new FileReader();
        reader.onload = () =>
          resolve({ name: file.name, data: String(reader.result) });
        reader.onerror = () => resolve({ canceled: true });
        reader.readAsDataURL(file);
      },
      { once: true },
    );

    input.click();
  });
}

export const webPlatform: PlatformAdapter = {
  name: "web-demo",
  isDesktop: false,
  supportsScheduledBackup: false,

  async exportPdf({ html, suggestedName }): Promise<SaveResult> {
    // لا window.print() ولا نافذة منبثقة: كلاهما يحجب الواجهة أثناء التصوير.
    // ننزّل مستنداً جاهزاً للطباعة يحمل نفس محتوى نسخة سطح المكتب.
    const filename = suggestedName.replace(/\.pdf$/i, "") + ".print.html";
    downloadBlob(filename, html, "text/html;charset=utf-8");
    return { ok: true, fallback: true };
  },

  async saveFile({ data, suggestedName }): Promise<SaveResult> {
    const buffer = new ArrayBuffer(data.byteLength);
    new Uint8Array(buffer).set(data);
    downloadBlob(suggestedName, buffer, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    return { ok: true, fallback: true };
  },

  async exportFolder(): Promise<SaveResult> {
    return {
      ok: false,
      message: "تصدير المجلدات متاح داخل تطبيق سطح المكتب فقط.",
    };
  },

  async chooseBackupExportPath() {
    return { canceled: true };
  },

  async pickBackupFile(): Promise<PickedFile> {
    return pickFileAsDataUrl(".zip");
  },

  async pickFolder(): Promise<PickedFolder> {
    return { canceled: true };
  },

  async getScheduledBackup(): Promise<ScheduledBackupConfig | null> {
    return null;
  },

  async saveScheduledBackup() {
    return { ok: false };
  },

  async saveDatabaseUrl() {
    // لا يوجد ملف إعدادات محلي في المتصفح؛ الإعداد يتم عبر ملف البيئة.
    return { ok: true };
  },

  unavailableReason(feature: string) {
    return `${feature}: ${DEMO_NOTICE}`;
  },
};

export { downloadBlob };
