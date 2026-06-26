import { contextBridge, ipcRenderer } from "electron";

const api = {
  health: () => ipcRenderer.invoke("backend:request", "GET", "/health"),
  inventory: () => ipcRenderer.invoke("backend:request", "GET", "/inventory"),
  refreshInventory: () => ipcRenderer.invoke("backend:request", "POST", "/inventory/refresh"),
  submitOperation: (type: string, input?: unknown) =>
    ipcRenderer.invoke("backend:request", "POST", `/operations/${encodeURIComponent(type)}`, input ?? {}),
  events: () => ipcRenderer.invoke("backend:request", "GET", "/events"),
  getSettings: () => ipcRenderer.invoke("backend:request", "GET", "/settings"),
  updateSettings: (settings: unknown) => ipcRenderer.invoke("backend:request", "POST", "/settings", settings),
  connectSteam: (input?: unknown) => ipcRenderer.invoke("backend:request", "POST", "/steam/connect", input ?? {}),
  submitSteamGuard: (input?: unknown) => ipcRenderer.invoke("backend:request", "POST", "/steam/guard", input ?? {}),
  disconnectSteam: () => ipcRenderer.invoke("backend:request", "POST", "/steam/disconnect"),
};

contextBridge.exposeInMainWorld("cs2", api);

export type DesktopApi = typeof api;
