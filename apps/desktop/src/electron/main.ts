import { app } from "electron";
import { ResultAsync, err, type Result } from "neverthrow";
import {
  backend,
  createWindow,
  dataService,
  markRuntimeQuitting,
  showRuntimeFailure,
  startRuntime,
  waitForRuntime,
  type RuntimeError,
} from "./desktop-runtime.js";

async function bootstrap(): Promise<Result<void, RuntimeError>> {
  const runtime = await startRuntime();
  if (runtime.isErr()) return err(runtime.error);
  const ready = await waitForRuntime(runtime.value);
  if (ready.isErr()) return err(ready.error);
  const windowResult = await ResultAsync.fromPromise(
    createWindow(runtime.value),
    (cause) => ({ message: "Could not create the application window", cause }),
  );
  return windowResult.map(() => undefined);
}

void ResultAsync.fromPromise(app.whenReady(), (cause) => ({
  message: "Electron failed to become ready",
  cause,
}))
  .andThen(() =>
    ResultAsync.fromPromise(bootstrap(), (cause) => ({
      message: "Desktop runtime initialization failed",
      cause,
    })).andThen((result) => result),
  )
  .match(
    () => undefined,
    (error) => {
      console.error(error.message, error.cause);
      showRuntimeFailure(error);
    },
  );

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("before-quit", () => {
  markRuntimeQuitting();
  backend?.kill();
  dataService?.kill();
});
