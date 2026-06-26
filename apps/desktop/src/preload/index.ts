import { contextBridge, ipcRenderer } from "electron";

const api = {
  health: () => ipcRenderer.invoke("backend:health"),
  inventory: () => ipcRenderer.invoke("backend:inventory"),
  refreshInventory: () => ipcRenderer.invoke("backend:refreshInventory"),
  submitOperation: (type: string, input?: unknown) => ipcRenderer.invoke("backend:submitOperation", type, input),
  operations: () => ipcRenderer.invoke("backend:operations"),
  events: () => ipcRenderer.invoke("backend:events"),
  settings: () => ipcRenderer.invoke("backend:settings"),
  connectSteam: (input?: unknown) => ipcRenderer.invoke("backend:connectSteam", input),
  submitSteamGuard: (input?: unknown) => ipcRenderer.invoke("backend:submitSteamGuard", input),
  disconnectSteam: () => ipcRenderer.invoke("backend:disconnectSteam"),
};

contextBridge.exposeInMainWorld("cs2", api);

export type DesktopApi = typeof api;
