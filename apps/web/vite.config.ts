import { defineConfig } from "vite";
import solid from "vite-plugin-solid";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  base: process.env.VITE_BASE_PATH ?? "/",
  plugins: [tailwindcss(), solid()],
  publicDir: "../../public",
});
