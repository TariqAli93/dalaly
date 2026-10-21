// The main window's top frame is the only renderer allowed to call the
// privileged bridge (files, dialogs, local settings). Splash and the offscreen
// PDF window have no access to these channels.
export function isMainWindowSender(event, mainWindow) {
  return Boolean(
    mainWindow &&
    !mainWindow.isDestroyed() &&
    event.sender === mainWindow.webContents &&
    event.senderFrame === mainWindow.webContents.mainFrame,
  );
}
