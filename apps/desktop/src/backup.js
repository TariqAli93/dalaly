import { dialog, ipcMain, safeStorage } from "electron";
import log from "electron-log/main.js";
import nodemailer from "nodemailer";
import { readAppConfig, writeAppConfig } from "./app-config.js";
import { isScheduleDue } from "./backup-schedule.js";
import { isMainWindowSender } from "./ipc-guard.js";

// ===== النسخ الاحتياطي: حوارات الملفات والجدولة بالبريد =====

// Archiving every image and document can take minutes on a slow disk.
const BACKUP_REQUEST_TIMEOUT_MS = 10 * 60 * 1000;
// The API refuses shorter ones (MIN_BACKUP_PASSWORD_LENGTH in backup.crypto.ts).
const MIN_BACKUP_PASSWORD_LENGTH = 8;

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
      // .dalaly-enc: the encrypted database-only copy the schedule emails.
      filters: [{ name: "نسخة احتياطية", extensions: ["zip", "dalaly-enc"] }],
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
      backupPasswordEnc: previous.backupPasswordEnc ?? null,
      lastRunAt: previous.lastRunAt ?? null,
      lastError: previous.lastError ?? null,
    };
    // تشفير كلمة المرور فقط عند تقديم قيمة جديدة (وإلا الإبقاء على المخزَّنة).
    if (incoming?.password) {
      next.passwordEnc = encryptSecret(String(incoming.password));
    }
    // The emailed copy is encrypted with this password; without it on this
    // machine nothing can be emailed, so it is never dropped silently.
    if (incoming?.backupPassword) {
      const backupPassword = String(incoming.backupPassword);
      if (backupPassword.length < MIN_BACKUP_PASSWORD_LENGTH) {
        return {
          ok: false,
          message: `كلمة مرور تشفير النسخة يجب ألا تقل عن ${MIN_BACKUP_PASSWORD_LENGTH} أحرف.`,
        };
      }
      next.backupPasswordEnc = encryptSecret(backupPassword);
      if (!next.backupPasswordEnc) {
        return {
          ok: false,
          message:
            "تعذر حفظ كلمة مرور التشفير بأمان على هذا الجهاز، فلم تُحفظ الإعدادات.",
        };
      }
    }
    if (next.enabled && !next.backupPasswordEnc) {
      return {
        ok: false,
        message:
          "حدّد كلمة مرور لتشفير النسخ المرسلة بالبريد قبل تفعيل الجدولة.",
      };
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
      hasBackupPassword: Boolean(s.backupPasswordEnc),
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
    // 1) النسخة الكاملة (صور ومستندات) تبقى في مجلد النسخ على هذا الجهاز.
    const response = await fetch(`${apiUrl}/api/backup/internal-run`, {
      method: "POST",
      headers: { "x-internal-token": internalToken },
      signal: AbortSignal.timeout(BACKUP_REQUEST_TIMEOUT_MS),
    });
    const result = await response.json();
    if (!response.ok || !result?.ok) {
      throw new Error(result?.message || "تعذر إنشاء النسخة.");
    }

    // 2) The email carries the database alone, encrypted; never the full
    // archive, which holds every ID scan and outgrows mail size limits.
    const backupPassword = decryptSecret(schedule.backupPasswordEnc);
    if (!backupPassword) {
      throw new Error(
        "لم تُرسل النسخة بالبريد: لم تُحدَّد كلمة مرور تشفيرها في إعدادات النسخ المجدول. النسخة الكاملة حُفظت في مجلد النسخ.",
      );
    }
    const archive = await fetch(`${apiUrl}/api/backup/internal-email-archive`, {
      method: "POST",
      headers: {
        "x-internal-token": internalToken,
        "content-type": "application/json",
      },
      body: JSON.stringify({ password: backupPassword }),
      signal: AbortSignal.timeout(BACKUP_REQUEST_TIMEOUT_MS),
    });
    if (!archive.ok) {
      const failure = await archive.json().catch(() => null);
      throw new Error(failure?.message || "تعذر إنشاء النسخة المشفّرة.");
    }
    const filename =
      /filename="([^"]+)"/.exec(
        archive.headers.get("content-disposition") ?? "",
      )?.[1] ?? "Dalaly_Database.dalaly-enc";
    const content = Buffer.from(await archive.arrayBuffer());

    // 3) إرسال البريد مع المرفق.
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
      text:
        "مرفق نسخة مشفّرة من قاعدة بيانات دلالي، بلا صور أو مستندات. " +
        "لاسترجاعها: الإعدادات ← النسخ الاحتياطي ← استرجاع، ثم اختر الملف وأدخل كلمة مرور التشفير. " +
        "النسخ الكاملة محفوظة في مجلد النسخ على جهاز المكتب.",
      attachments: [{ filename, content }],
    });
    log.info("Scheduled backup emailed successfully");
  } catch (error) {
    lastError = error instanceof Error ? error.message : String(error);
    log.error("Scheduled backup failed", lastError);
  }

  // 4) تسجيل النتيجة (لا ينهار التطبيق عند الفشل، بما في ذلك انقطاع الإنترنت).
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
  // lastRunAt is only written once a run finishes, so a run longer than the
  // tick would otherwise start a second backup and email.
  let running = false;
  return {
    start() {
      if (timer) return;
      timer = setInterval(() => {
        if (running) return;
        running = true;
        runScheduledBackup(options).finally(() => {
          running = false;
        });
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
