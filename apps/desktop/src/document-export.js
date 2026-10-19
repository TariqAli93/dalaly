import { BrowserWindow, dialog, ipcMain } from "electron";
import fs from "node:fs";
import log from "electron-log/main.js";

// Shared property and rental PDF export uses Electron's built-in print engine.
export function registerDocumentExport(getMainWindow) {
  ipcMain.handle("export:save-pdf", async (_event, input) => {
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
}
