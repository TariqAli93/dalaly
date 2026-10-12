import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { _electron } from "@playwright/test";

// Exercise the same IPC handlers and preload used by the desktop. All windows
// stay hidden; native dialogs and notification display are intercepted only in
// this isolated harness, without starting another API or touching user data.
export async function verifyElectronContracts(
  documents: Array<{ html: string; code: string }>,
  temporary: string,
) {
  const root = fileURLToPath(new URL("../../", import.meta.url));
  const harness = path.join(temporary, "contracts-electron.mjs");
  const source = `import {app,BrowserWindow,dialog,Notification} from 'electron';
import {registerContractPdfExport} from ${JSON.stringify(pathToFileURL(path.join(root, "apps/desktop/src/contract-export.js")).href)};
import {registerLegalNotifications} from ${JSON.stringify(pathToFileURL(path.join(root, "apps/desktop/src/legal-notifications.js")).href)};
app.setPath('userData',${JSON.stringify(path.join(temporary, "electron-profile"))});
app.whenReady().then(async()=>{
app.setAppUserModelId('dalaly.contracts.test');
dialog.showSaveDialog=async()=>globalThis.cancelPdf?{canceled:true}:{canceled:false,filePath:globalThis.pdfTarget};
Notification.isSupported=()=>true;
Notification.prototype.show=function(){globalThis.noticeCount=(globalThis.noticeCount??0)+1;};
app.on('web-contents-created',(_event,contents)=>{
 contents.print=(options,callback)=>{
  globalThis.printOptions=options;
  globalThis.printCount=(globalThis.printCount??0)+1;
  callback(!globalThis.cancelPrint,globalThis.cancelPrint?'Print job cancelled':'');
 };
});
let main;
registerContractPdfExport(()=>main);
registerLegalNotifications(()=>main);
main=new BrowserWindow({show:false,webPreferences:{contextIsolation:true,nodeIntegration:false,sandbox:false,preload:${JSON.stringify(path.join(root, "apps/desktop/src/preload.cjs"))}}});
await main.loadURL('data:text/html;charset=utf-8,<html lang="ar" dir="rtl"><body>اختبار تصدير العقود</body></html>');
});
`;
  await fs.mkdir(path.join(temporary, "electron-profile"), { recursive: true });
  await fs.writeFile(harness, source);
  const env = Object.fromEntries(
    Object.entries(process.env).filter(
      ([key, value]) =>
        key !== "ELECTRON_RUN_AS_NODE" && typeof value === "string",
    ),
  ) as Record<string, string>;
  const electron = await _electron.launch({
    executablePath: path.join(root, "node_modules/electron/dist/electron.exe"),
    args: [
      harness,
      `--user-data-dir=${path.join(temporary, "electron-profile")}`,
    ],
    env,
    timeout: 30000,
  });
  try {
    const page = await electron.firstWindow();
    await page.waitForFunction(
      () =>
        !!window.dalalyConfig?.exportPdf &&
        !!window.dalalyConfig?.printDocument &&
        !!window.dalalyConfig?.notifyLegalTask,
    );
    assert.equal(
      await electron.evaluate(({ BrowserWindow }) =>
        BrowserWindow.getAllWindows().some((w) => w.isVisible()),
      ),
      false,
    );
    const invalid = await page.evaluate(() =>
      window.dalalyConfig!.exportPdf!({
        html: "",
        suggestedName: "invalid.pdf",
      }),
    );
    assert.equal(invalid.ok, false);
    const invalidPrint = await page.evaluate(() => window.dalalyConfig!.printDocument!({ html: "" }));
    assert.equal(invalidPrint.ok, false);
    const print = await page.evaluate((html) => window.dalalyConfig!.printDocument!({ html }), documents[0].html);
    assert.equal(print.ok, true);
    assert.deepEqual(await electron.evaluate(() => (globalThis as any).printOptions), { silent: false, printBackground: true, pageSize: "A4" });
    await electron.evaluate(() => { (globalThis as any).cancelPrint = true; });
    const cancelledPrint = await page.evaluate((html) => window.dalalyConfig!.printDocument!({ html }), documents[0].html);
    assert.equal(cancelledPrint.canceled, true);
    assert.equal(await electron.evaluate(() => (globalThis as any).printCount), 2);
    assert.equal(await electron.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().some((window) => window.isVisible())), false);
    await electron.evaluate(() => {
      (globalThis as any).cancelPdf = true;
    });
    const canceled = await page.evaluate(() =>
      window.dalalyConfig!.exportPdf!({
        html: "<p>اختبار</p>",
        suggestedName: "canceled.pdf",
      }),
    );
    assert.equal(canceled.canceled, true);
    await electron.evaluate(() => {
      (globalThis as any).cancelPdf = false;
    });
    const output = path.join(root, "test-results/contracts-legal");
    await fs.mkdir(output, { recursive: true });
    for (const document of documents) {
      const target = path.join(output, `electron_${document.code}.pdf`);
      await electron.evaluate((_electron, value) => {
        (globalThis as any).pdfTarget = value;
      }, target);
      const result = await page.evaluate(
        (input) => window.dalalyConfig!.exportPdf!(input),
        { html: document.html, suggestedName: `${document.code}.pdf` },
      );
      assert.equal(result.ok, true);
      assert.equal(result.path, target);
      const bytes = await fs.readFile(target);
      assert(bytes.subarray(0, 4).equals(Buffer.from("%PDF")));
      const size = bytes
        .toString("latin1")
        .match(/\/MediaBox\s*\[\s*0\s+0\s+([\d.]+)\s+([\d.]+)\s*\]/);
      assert(size);
      assert(
        Math.abs(Number(size[1]) - 595) < 2 &&
          Math.abs(Number(size[2]) - 842) < 2,
      );
    }
    const notice = await page.evaluate(() =>
      window.dalalyConfig!.notifyLegalTask!({
        title: "اختبار تنبيه",
        body: "طلبات تحتاج إجراء",
      }),
    );
    assert.equal(notice.ok, true);
    const repeat = await page.evaluate(() =>
      window.dalalyConfig!.notifyLegalTask!({
        title: "اختبار تنبيه",
        body: "طلبات تحتاج إجراء",
      }),
    );
    assert.equal(repeat.ok, false);
    assert.equal(
      await electron.evaluate(() => (globalThis as any).noticeCount),
      1,
    );
  } finally {
    await electron.close();
  }
}
