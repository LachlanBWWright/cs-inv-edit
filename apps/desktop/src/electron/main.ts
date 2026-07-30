import { app } from "electron";
import {
  backend,
  createWindow,
  startBackend,
  waitForBackend,
} from "./desktop-runtime.js";

app.whenReady().then(async () => {
  startBackend();
  const ready = await waitForBackend();
  if (!ready) {
    console.error("Backend did not become ready in time");
    return;
  }
  await createWindow();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("before-quit", () => {
  backend?.kill();
});
