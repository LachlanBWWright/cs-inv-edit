import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["**/*.{test,spec}.ts?(x)"],
    exclude: ["**/node_modules/**", "**/dist/**", "backend/**", "apps/desktop/**"],
  },
});
