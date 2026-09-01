// Jenvu Desktop — thin Electron shell that loads the live SSR site.
const { app, BrowserWindow, shell, Menu } = require("electron");
const path = require("path");

const APP_URL = process.env.JENVU_URL || "https://jenvu.com";

function createWindow() {
  const win = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1024,
    minHeight: 640,
    backgroundColor: "#ffffff",
    title: "Jenvu",
    icon: path.join(__dirname, "..", "public", "favicon.png"),
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  win.loadURL(APP_URL);

  // Open external links (target=_blank, http/https to other origins) in the OS browser.
  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });

  win.webContents.on("will-navigate", (event, url) => {
    try {
      const target = new URL(url);
      const current = new URL(APP_URL);
      if (target.origin !== current.origin) {
        event.preventDefault();
        shell.openExternal(url);
      }
    } catch {
      // ignore malformed URLs
    }
  });
}

app.whenReady().then(() => {
  Menu.setApplicationMenu(null);
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
