import { BrowserWindow, dialog, ipcMain } from "electron";
import fs from "node:fs";
import path from "node:path";
import log from "electron-log/main.js";
import { isMainWindowSender } from "./ipc-guard.js";

function safeExportName(value, fallback) {
  const sanitized = String(value ?? "")
    // eslint-disable-next-line no-control-regex -- Windows file names cannot hold control characters
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, "-")
    .replace(/[. ]+$/g, "")
    .trim();
  return sanitized || fallback;
}

// Property and rental exports: PDF through Electron's built-in print engine,
// Excel files and image folders through native save dialogs.
export function registerDocumentExport(getMainWindow) {
  ipcMain.handle("export:save-pdf", async (event, input) => {
    if (!isMainWindowSender(event, getMainWindow()))
      return { ok: false, message: "محتوى غير صالح." };
    const html = input?.html;
    const suggestedName = input?.suggestedName || "export.pdf";
    if (typeof html !== "string" || !html)
      return { ok: false, message: "محتوى غير صالح." };
    const saveResult = await dialog.showSaveDialog(
      getMainWindow() ?? undefined,
      {
        title: "حفظ ملف بي دي إف",
        defaultPath: suggestedName,
        filters: [{ name: "ملف بي دي إف", extensions: ["pdf"] }],
      },
    );
    if (saveResult.canceled || !saveResult.filePath)
      return { ok: false, canceled: true };
    const pdfWindow = new BrowserWindow({
      show: false,
      webPreferences: {
        offscreen: true,
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
      },
    });
    try {
      await pdfWindow.loadURL(
        `data:text/html;charset=utf-8,${encodeURIComponent(html)}`,
      );
      await pdfWindow.webContents.executeJavaScript(
        "document.fonts.ready.then(() => true)",
      );
      const data = await pdfWindow.webContents.printToPDF({
        printBackground: true,
        pageSize: "A4",
        preferCSSPageSize: true,
      });
      fs.writeFileSync(saveResult.filePath, data);
      return { ok: true, path: saveResult.filePath };
    } catch (error) {
      log.error("PDF export failed", error);
      return { ok: false, message: "تعذر إنشاء ملف بي دي إف." };
    } finally {
      pdfWindow.destroy();
    }
  });

  ipcMain.handle("export:save-file", async (event, input) => {
    const data = input?.data;
    const suggestedName =
      typeof input?.suggestedName === "string" && input.suggestedName
        ? input.suggestedName
        : "تصدير_دلالي.xlsx";
    if (!isMainWindowSender(event, getMainWindow()))
      return { ok: false, message: "محتوى الملف غير صالح." };
    if (!(data instanceof Uint8Array)) {
      return { ok: false, message: "محتوى الملف غير صالح." };
    }

    const saveResult = await dialog.showSaveDialog(
      getMainWindow() ?? undefined,
      {
        title: input?.title || "حفظ التصدير",
        defaultPath: suggestedName,
        filters:
          Array.isArray(input?.filters) && input.filters.length
            ? input.filters
            : [{ name: "مصنف إكسل", extensions: ["xlsx"] }],
      },
    );
    if (saveResult.canceled || !saveResult.filePath) {
      return { ok: false, canceled: true };
    }

    try {
      fs.writeFileSync(saveResult.filePath, Buffer.from(data));
      return { ok: true, path: saveResult.filePath };
    } catch (error) {
      log.error("File export failed", error);
      return { ok: false, message: "تعذر حفظ ملف التصدير." };
    }
  });

  ipcMain.handle("export:save-folder", async (event, input) => {
    const files = Array.isArray(input?.files) ? input.files : [];
    if (!isMainWindowSender(event, getMainWindow()) || !files.length) {
      return { ok: false, message: "لا توجد ملفات لتصديرها." };
    }

    const folderResult = await dialog.showOpenDialog(
      getMainWindow() ?? undefined,
      {
        title: input?.title || "اختيار مجلد التصدير",
        properties: ["openDirectory", "createDirectory"],
      },
    );
    if (folderResult.canceled || !folderResult.filePaths[0]) {
      return { ok: false, canceled: true };
    }

    const folderName = safeExportName(
      input?.suggestedFolderName,
      "تصدير_دلالي",
    );
    const targetFolder = path.join(folderResult.filePaths[0], folderName);

    try {
      fs.mkdirSync(targetFolder, { recursive: true });
      for (const file of files) {
        if (!(file?.data instanceof Uint8Array)) {
          return { ok: false, message: "محتوى إحدى الصور غير صالح." };
        }
        const fileName = safeExportName(
          path.basename(String(file.name ?? "")),
          "file.bin",
        );
        fs.writeFileSync(
          path.join(targetFolder, fileName),
          Buffer.from(file.data),
        );
      }
      return { ok: true, path: targetFolder };
    } catch (error) {
      log.error("Folder export failed", error);
      return { ok: false, message: "تعذر إنشاء مجلد التصدير." };
    }
  });
}
