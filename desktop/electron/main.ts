import { app, BrowserWindow, ipcMain, Tray, Menu, nativeImage, Notification } from "electron";
import path from "node:path";

process.env.DIST = path.join(__dirname, "../dist");
process.env.VITE_PUBLIC = app.isPackaged
  ? process.env.DIST
  : path.join(process.env.DIST, "../public");

let mainWindow: BrowserWindow | null;
let tray: Tray | null;

const VITE_DEV_SERVER_URL = process.env["VITE_DEV_SERVER_URL"];

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 500,
    icon: path.join(process.env.VITE_PUBLIC!, "electron-vite.svg"),
    titleBarStyle: "hidden",
    titleBarOverlay: {
      color: "#111318",
      symbolColor: "#e0e0e0",
      height: 36,
    },
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  if (VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(VITE_DEV_SERVER_URL);
  } else {
    mainWindow.loadFile(path.join(process.env.DIST!, "index.html"));
  }

  // Minimise to tray instead of closing
  mainWindow.on("close", (e) => {
    if (!app.isQuitting) {
      e.preventDefault();
      mainWindow?.hide();
    }
  });
}

function createTray() {
  const icon = nativeImage.createFromPath(
    path.join(process.env.VITE_PUBLIC!, "electron-vite.svg")
  );
  tray = new Tray(icon.isEmpty() ? nativeImage.createEmpty() : icon);
  tray.setToolTip("Burrow");
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: "Show Burrow", click: () => mainWindow?.show() },
      { type: "separator" },
      {
        label: "Quit",
        click: () => {
          app.isQuitting = true;
          app.quit();
        },
      },
    ])
  );
  tray.on("click", () => mainWindow?.show());
}

// ---- IPC Handlers ----

ipcMain.on("window:minimize", () => mainWindow?.minimize());
ipcMain.on("window:maximize", () => {
  if (mainWindow?.isMaximized()) mainWindow.unmaximize();
  else mainWindow?.maximize();
});
ipcMain.on("window:close", () => mainWindow?.close());

ipcMain.on("notification:show", (_e, { title, body }: { title: string; body: string }) => {
  if (Notification.isSupported()) {
    new Notification({ title, body }).show();
  }
});

ipcMain.handle("app:version", () => app.getVersion());

// ---- Lifecycle ----

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
    mainWindow = null;
  }
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  } else {
    mainWindow?.show();
  }
});

app.whenReady().then(() => {
  createWindow();
  createTray();
});
