import { ipcMain, Notification } from "electron";

export function registerLegalNotifications(getMainWindow) {
  let lastNotice = 0;
  ipcMain.handle("legal:notify", (event, input) => {
    const mainWindow = getMainWindow();
    if (
      !mainWindow ||
      event.sender !== mainWindow.webContents ||
      event.senderFrame !== mainWindow.webContents.mainFrame
    )
      return { ok: false };
    if (!Notification.isSupported() || Date.now() - lastNotice < 60000)
      return { ok: false };
    if (
      typeof input?.title !== "string" ||
      typeof input?.body !== "string" ||
      input.title.length > 200 ||
      input.body.length > 1000
    )
      return { ok: false };
    lastNotice = Date.now();
    const notice = new Notification({ title: input.title, body: input.body });
    notice.on("click", () => {
      getMainWindow()?.show();
      getMainWindow()?.focus();
    });
    notice.show();
    return { ok: true };
  });
}
