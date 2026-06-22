export {}

declare global {
  interface Window {
    desktopShell?: {
      isDesktop: true
      platform: NodeJS.Platform
      openExternal: (url: string) => Promise<void>
    }
  }
}
