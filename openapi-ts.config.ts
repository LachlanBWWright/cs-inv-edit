import { defineConfig } from "@hey-api/openapi-ts";
import { fileURLToPath } from "node:url";

export default defineConfig({
  input: {
    path: fileURLToPath(new URL("./api/openapi.yaml", import.meta.url)),
  },
  output: {
    path: "packages/contracts/src/generated",
    clean: true,
  },
  plugins: ["@hey-api/typescript", "zod"],
});
