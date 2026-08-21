import { defineConfig } from "tsup";

export default defineConfig({
  entry: {
    "electron/main": "src/electron/main.ts",
    "preload/index": "src/preload/index.ts",
  },
  outDir: "dist",
  format: ["esm"],
  platform: "node",
  target: "node22",
  bundle: true,
  splitting: false,
  sourcemap: true,
  clean: true,
  external: ["electron"],
});
