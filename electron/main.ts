import { app, BrowserWindow, shell } from 'electron'
import { join } from 'node:path'

const createWindow = async (): Promise<void> => {
  const mainWindow = new BrowserWindow({
    width: 1600,
    height: 1024,
    minWidth: 1180,
    minHeight: 840,
    titleBarStyle: 'hiddenInset',
    backgroundColor: '#020617',
    webPreferences: {
      preload: join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url)

    return { action: 'deny' }
  })

  const devServerUrl = process.env.VITE_DEV_SERVER_URL

  if (devServerUrl !== undefined) {
    await mainWindow.loadURL(devServerUrl)
    mainWindow.webContents.openDevTools({ mode: 'detach' })
    return
  }

  await mainWindow.loadFile(join(__dirname, '../dist/index.html'))
}

void app.whenReady().then(async () => {
  await createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      void createWindow()
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
