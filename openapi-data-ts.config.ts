import { defineConfig } from "@hey-api/openapi-ts";
import { fileURLToPath } from "node:url";

export default defineConfig({
  input: {
    path: fileURLToPath(
      new URL("./api/data-service.openapi.yaml", import.meta.url),
    ),
  },
  output: {
    path: "packages/contracts/src/generated-data",
    clean: true,
  },
  plugins: ["@hey-api/typescript", "zod"],
});
