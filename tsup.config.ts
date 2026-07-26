import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["electron/main.ts", "electron/preload.ts"],
  format: ["cjs"],
  outDir: "dist-electron",
  target: "node22",
  clean: true,
  sourcemap: true,
  outExtension: () => ({
    js: ".cjs",
  }),
});
