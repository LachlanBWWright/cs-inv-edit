import { contextBridge, ipcRenderer } from "electron";

const api = {
  health: () => ipcRenderer.invoke("backend:health"),
  inventory: () => ipcRenderer.invoke("backend:inventory"),
  refreshInventory: () => ipcRenderer.invoke("backend:refreshInventory"),
  submitOperation: (type: string, input?: unknown) => ipcRenderer.invoke("backend:submitOperation", type, input),
  operations: () => ipcRenderer.invoke("backend:operations"),
  events: () => ipcRenderer.invoke("backend:events"),
  settings: () => ipcRenderer.invoke("backend:settings"),
  steamStatus: () => ipcRenderer.invoke("backend:steamStatus"),
  connectSteam: (input?: unknown) => ipcRenderer.invoke("backend:connectSteam", input),
  submitSteamGuard: (input?: unknown) => ipcRenderer.invoke("backend:submitSteamGuard", input),
  disconnectSteam: () => ipcRenderer.invoke("backend:disconnectSteam"),
  applyNameTag: (input: unknown) => ipcRenderer.invoke("backend:applyNameTag", input),
  removeNameTag: (input: unknown) => ipcRenderer.invoke("backend:removeNameTag", input),
  deleteItem: (input: unknown) => ipcRenderer.invoke("backend:deleteItem", input),
  applyStatTrakSwap: (input: unknown) => ipcRenderer.invoke("backend:applyStatTrakSwap", input),
  applyStrangePart: (input: unknown) => ipcRenderer.invoke("backend:applyStrangePart", input),
  useItem: (input: unknown) => ipcRenderer.invoke("backend:useItem", input),
  useMultipleItems: (input: unknown) => ipcRenderer.invoke("backend:useMultipleItems", input),
  applyToolToItem: (input: unknown) => ipcRenderer.invoke("backend:applyToolToItem", input),
  applyToolToBaseItem: (input: unknown) => ipcRenderer.invoke("backend:applyToolToBaseItem", input),
  giftItem: (input: unknown) => ipcRenderer.invoke("backend:giftItem", input),
};

contextBridge.exposeInMainWorld("cs2", api);

export type DesktopApi = typeof api;
