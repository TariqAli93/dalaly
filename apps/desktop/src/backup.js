import { dialog, ipcMain, safeStorage } from "electron";
import log from "electron-log/main.js";
import nodemailer from "nodemailer";
import { readAppConfig, writeAppConfig } from "./app-config.js";
import { isScheduleDue } from "./backup-schedule.js";
import { isMainWindowSender } from "./ipc-guard.js";

// ===== النسخ الاحتياطي: حوارات الملفات والجدولة بالبريد =====

function encryptSecret(plain) {
  try {
    if (safeStorage.isEncryptionAvailable()) {
      return safeStorage.encryptString(plain).toString("base64");
    }
  } catch (error) {
    log.error("safeStorage encrypt failed", error);
  }
  return null;
}

function decryptSecret(encBase64) {
  try {
    if (encBase64 && safeStorage.isEncryptionAvailable()) {
      return safeStorage.decryptString(Buffer.from(encBase64, "base64"));
    }
  } catch (error) {
    log.error("safeStorage decrypt failed", error);
  }
  return "";
}

export function registerBackupHandlers(getMainWindow) {
  const trusted = (event) => isMainWindowSender(event, getMainWindow());

  ipcMain.handle("backup:choose-export-path", async (event) => {
    if (!trusted(event)) return { canceled: true };
    const now = new Date().toISOString().slice(0, 10);
    const result = await dialog.showSaveDialog(getMainWindow() ?? undefined, {
      title: "حفظ النسخة الاحتياطية",
      defaultPath: `نسخة_دلالي_الاحتياطية_${now}.zip`,
      filters: [{ name: "أرشيف مضغوط", extensions: ["zip"] }],
    });

    if (result.canceled || !result.filePath) {
      return { canceled: true };
    }

    return { canceled: false, filePath: result.filePath };
  });

  ipcMain.handle("backup:pick-file", async (event) => {
    if (!trusted(event)) return { canceled: true };
    const result = await dialog.showOpenDialog(getMainWindow() ?? undefined, {
      title: "اختر ملف النسخة الاحتياطية",
      filters: [{ name: "نسخة احتياطية", extensions: ["zip"] }],
      properties: ["openFile"],
    });
    if (result.canceled || !result.filePaths.length) return { canceled: true };
    return { path: result.filePaths[0] };
  });

  ipcMain.handle("backup:pick-folder", async (event) => {
    if (!trusted(event)) return { canceled: true };
    const result = await dialog.showOpenDialog(getMainWindow() ?? undefined, {
      title: "اختر مجلد النسخ الاحتياطية",
      properties: ["openDirectory", "createDirectory"],
    });
    if (result.canceled || !result.filePaths.length) return { canceled: true };
    return { path: result.filePaths[0] };
  });

  ipcMain.handle("backup:save-schedule", async (event, incoming) => {
    if (!trusted(event)) return { ok: false };
    const config = readAppConfig();
    const previous = config.scheduledBackup ?? {};
    const next = {
      enabled: Boolean(incoming?.enabled),
      recipient: incoming?.recipient ?? "",
      smtpHost: incoming?.smtpHost ?? "",
      smtpPort: incoming?.port ?? incoming?.smtpPort ?? 587,
      smtpUser: incoming?.smtpUser ?? "",
      frequency: incoming?.frequency === "weekly" ? "weekly" : "daily",
      time: incoming?.time ?? "02:00",
      passwordEnc: previous.passwordEnc ?? null,
      lastRunAt: previous.lastRunAt ?? null,
      lastError: previous.lastError ?? null,
    };
    // تشفير كلمة المرور فقط عند تقديم قيمة جديدة (وإلا الإبقاء على المخزَّنة).
    if (incoming?.password) {
      next.passwordEnc = encryptSecret(String(incoming.password));
    }
    writeAppConfig({ ...config, scheduledBackup: next });
    return { ok: true };
  });

  ipcMain.handle("backup:get-schedule", async (event) => {
    if (!trusted(event)) return null;
    const s = readAppConfig().scheduledBackup;
    if (!s) return null;
    return {
      enabled: Boolean(s.enabled),
      recipient: s.recipient ?? "",
      smtpHost: s.smtpHost ?? "",
      smtpPort: s.smtpPort ?? 587,
      smtpUser: s.smtpUser ?? "",
      hasPassword: Boolean(s.passwordEnc),
      frequency: s.frequency ?? "daily",
      time: s.time ?? "02:00",
      lastRunAt: s.lastRunAt ?? null,
      lastError: s.lastError ?? null,
    };
  });
}

async function runScheduledBackup({ apiUrl, internalToken }) {
  const schedule = readAppConfig().scheduledBackup;
  if (!isScheduleDue(schedule)) return;

  log.info("Running scheduled email backup");
  let lastError = null;
  try {
    // 1) إنشاء النسخة عبر الخادم.
    const response = await fetch(`${apiUrl}/api/backup/internal-run`, {
      method: "POST",
      headers: { "x-internal-token": internalToken },
    });
    const result = await response.json();
    if (!response.ok || !result?.ok) {
      throw new Error(result?.message || "تعذر إنشاء النسخة.");
    }

    // 2) إرسال البريد مع المرفق.
    const password = decryptSecret(schedule.passwordEnc);
    const port = Number(schedule.smtpPort) || 587;
    const transporter = nodemailer.createTransport({
      host: schedule.smtpHost,
      port,
      secure: port === 465,
      auth: schedule.smtpUser
        ? { user: schedule.smtpUser, pass: password }
        : undefined,
    });
    await transporter.sendMail({
      from: schedule.smtpUser || schedule.recipient,
      to: schedule.recipient,
      subject: `نسخة دلالي الاحتياطية - ${new Date().toLocaleDateString("ar-IQ")}`,
      text: "مرفق النسخة الاحتياطية لقاعدة بيانات دلالي.",
      attachments: [{ path: result.file_path }],
    });
    log.info("Scheduled backup emailed successfully");
  } catch (error) {
    lastError = error instanceof Error ? error.message : String(error);
    log.error("Scheduled backup failed", lastError);
  }

  // 3) تسجيل النتيجة (لا ينهار التطبيق عند الفشل، بما في ذلك انقطاع الإنترنت).
  const latest = readAppConfig();
  if (latest.scheduledBackup) {
    latest.scheduledBackup.lastRunAt = new Date().toISOString();
    latest.scheduledBackup.lastError = lastError;
    writeAppConfig(latest);
  }
}

// يفحص الموعد كل دقيقة ما دام التطبيق يعمل.
export function createBackupScheduler(options) {
  let timer = null;
  return {
    start() {
      if (timer) return;
      timer = setInterval(() => {
        void runScheduledBackup(options);
      }, 60 * 1000);
    },
    stop() {
      if (timer) {
        clearInterval(timer);
        timer = null;
      }
    },
  };
}
