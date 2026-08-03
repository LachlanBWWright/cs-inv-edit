import { defineConfig } from "vite";
import solid from "vite-plugin-solid";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  publicDir: "../../public",
  plugins: [tailwindcss(), solid()],
  build: {
    outDir: "dist/renderer",
  },
});
