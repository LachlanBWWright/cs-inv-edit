import { contextBridge, ipcRenderer } from "electron";

const api = {
  health: () => ipcRenderer.invoke("backend:get", "/health"),
  inventory: () => ipcRenderer.invoke("backend:get", "/inventory"),
  submitOperation: (type: string, input?: unknown) =>
    ipcRenderer.invoke("backend:post", `/operations/${encodeURIComponent(type)}`, input),
};

contextBridge.exposeInMainWorld("cs2", api);

export type DesktopApi = typeof api;
