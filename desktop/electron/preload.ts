import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("electronAPI", {
  // Generic IPC
  send: (channel: string, data: unknown) => {
    const allowed = [
      "window:minimize",
      "window:maximize",
      "window:close",
      "notification:show",
    ];
    if (allowed.includes(channel)) {
      ipcRenderer.send(channel, data);
    }
  },
  invoke: (channel: string, ...args: unknown[]) => {
    const allowed = ["app:version"];
    if (allowed.includes(channel)) {
      return ipcRenderer.invoke(channel, ...args);
    }
    return Promise.reject(new Error(`Channel ${channel} not allowed`));
  },
  on: (channel: string, callback: (...args: unknown[]) => void) => {
    const allowed = ["deep-link", "notification:clicked"];
    if (allowed.includes(channel)) {
      ipcRenderer.on(channel, (_event, ...args) => callback(...args));
    }
  },

  // Window controls
  minimize: () => ipcRenderer.send("window:minimize"),
  maximize: () => ipcRenderer.send("window:maximize"),
  close: () => ipcRenderer.send("window:close"),

  // Notifications
  showNotification: (title: string, body: string) =>
    ipcRenderer.send("notification:show", { title, body }),

  // App info
  getVersion: () => ipcRenderer.invoke("app:version"),
});
