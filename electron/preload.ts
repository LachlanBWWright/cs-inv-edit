import { contextBridge, shell } from 'electron'

type DesktopShell = {
  isDesktop: true
  platform: NodeJS.Platform
  openExternal: (url: string) => Promise<void>
}

const desktopShell: DesktopShell = {
  isDesktop: true,
  platform: process.platform,
  openExternal: async (url) => {
    await shell.openExternal(url)
  },
}

contextBridge.exposeInMainWorld('desktopShell', desktopShell)
